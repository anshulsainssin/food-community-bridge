-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT,
  organization TEXT,
  phone TEXT,
  email TEXT,
  location_label TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- DONATIONS
CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_type TEXT NOT NULL,
  diet TEXT NOT NULL,
  quantity TEXT NOT NULL,
  servings INTEGER,
  weight_kg NUMERIC(10,2),
  prepared_at TIMESTAMPTZ,
  pickup_deadline TIMESTAMPTZ,
  contact_info TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Available',
  pickup_address TEXT NOT NULL,
  pickup_latitude DOUBLE PRECISION,
  pickup_longitude DOUBLE PRECISION,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view donations" ON public.donations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Donors can create their own donations" ON public.donations FOR INSERT TO authenticated WITH CHECK (auth.uid() = donor_id);
CREATE POLICY "Donors can update their own donations" ON public.donations FOR UPDATE TO authenticated USING (auth.uid() = donor_id) WITH CHECK (auth.uid() = donor_id);
CREATE POLICY "Donors can delete their own donations" ON public.donations FOR DELETE TO authenticated USING (auth.uid() = donor_id);

-- CLAIMS
CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id UUID NOT NULL UNIQUE REFERENCES public.donations(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claims TO authenticated;
GRANT ALL ON public.claims TO service_role;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties can view claims" ON public.claims FOR SELECT TO authenticated
  USING (auth.uid() = receiver_id OR EXISTS (SELECT 1 FROM public.donations d WHERE d.id = donation_id AND d.donor_id = auth.uid()));

-- PICKUP EVENTS
CREATE TABLE public.pickup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id UUID NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pickup_events TO authenticated;
GRANT ALL ON public.pickup_events TO service_role;
ALTER TABLE public.pickup_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view pickup events" ON public.pickup_events FOR SELECT TO authenticated USING (true);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  donation_id UUID REFERENCES public.donations(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX donations_donor_idx ON public.donations(donor_id);
CREATE INDEX donations_claimed_by_idx ON public.donations(claimed_by);
CREATE INDEX pickup_events_donation_idx ON public.pickup_events(donation_id);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);

-- TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER donations_set_updated_at BEFORE UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NEW USER -> PROFILE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
          NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- FIRST TIMELINE EVENT
CREATE OR REPLACE FUNCTION public.handle_new_donation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.pickup_events (donation_id, status, actor_id) VALUES (NEW.id, NEW.status, NEW.donor_id);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_donation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER donations_first_event AFTER INSERT ON public.donations FOR EACH ROW EXECUTE FUNCTION public.handle_new_donation();

-- CLAIM
CREATE OR REPLACE FUNCTION public.claim_donation(p_donation_id UUID)
RETURNS public.donations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_row.donor_id = v_uid THEN RAISE EXCEPTION 'You cannot claim your own donation'; END IF;
  IF v_row.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'This donation has already been claimed'; END IF;

  UPDATE public.donations SET status = 'Claimed', claimed_by = v_uid, claimed_at = now()
  WHERE id = p_donation_id RETURNING * INTO v_row;

  INSERT INTO public.claims (donation_id, receiver_id) VALUES (p_donation_id, v_uid)
  ON CONFLICT (donation_id) DO NOTHING;
  INSERT INTO public.pickup_events (donation_id, status, actor_id) VALUES (p_donation_id, 'Claimed', v_uid);

  SELECT COALESCE(NULLIF(organization, ''), NULLIF(full_name, ''), 'A community partner') INTO v_name
  FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.notifications (user_id, title, body, donation_id)
  VALUES (v_row.donor_id, 'Your donation was claimed',
          COALESCE(v_name, 'A community partner') || ' claimed your ' || v_row.food_type || ' donation.', p_donation_id);
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_donation(UUID) TO authenticated;

-- ADVANCE STATUS
CREATE OR REPLACE FUNCTION public.advance_donation_status(p_donation_id UUID, p_status TEXT)
RETURNS public.donations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_actor TEXT;
  v_other UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_status NOT IN ('Pickup in Progress', 'Picked Up', 'Completed') THEN
    RAISE EXCEPTION 'Unsupported status';
  END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_uid <> v_row.donor_id AND v_uid IS DISTINCT FROM v_row.claimed_by THEN
    RAISE EXCEPTION 'You are not part of this pickup';
  END IF;
  IF v_row.claimed_by IS NULL THEN RAISE EXCEPTION 'This donation has not been claimed yet'; END IF;

  UPDATE public.donations
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'Completed' THEN now() ELSE completed_at END
  WHERE id = p_donation_id RETURNING * INTO v_row;

  INSERT INTO public.pickup_events (donation_id, status, actor_id) VALUES (p_donation_id, p_status, v_uid);

  SELECT COALESCE(NULLIF(full_name, ''), NULLIF(organization, ''), 'A community member') INTO v_actor
  FROM public.profiles WHERE id = v_uid;
  v_other := CASE WHEN v_uid = v_row.donor_id THEN v_row.claimed_by ELSE v_row.donor_id END;

  IF v_other IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, donation_id)
    VALUES (v_other, 'Pickup update: ' || p_status,
            COALESCE(v_actor, 'A community member') || ' marked the ' || v_row.food_type || ' pickup as ' || p_status || '.',
            p_donation_id);
  END IF;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.advance_donation_status(UUID, TEXT) TO authenticated;

-- PARTY CONTACT DETAILS (only for donations you are part of)
CREATE OR REPLACE FUNCTION public.donation_parties(p_donation_id UUID)
RETURNS TABLE (
  donor_name TEXT, donor_organization TEXT, donor_phone TEXT,
  receiver_name TEXT, receiver_organization TEXT, receiver_phone TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_uid <> v_row.donor_id AND v_uid IS DISTINCT FROM v_row.claimed_by THEN RETURN; END IF;
  RETURN QUERY
  SELECT dp.full_name, dp.organization, COALESCE(NULLIF(v_row.contact_info, ''), dp.phone),
         rp.full_name, rp.organization, rp.phone
  FROM public.profiles dp
  LEFT JOIN public.profiles rp ON rp.id = v_row.claimed_by
  WHERE dp.id = v_row.donor_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.donation_parties(UUID) TO authenticated;

-- MY DASHBOARD STATS
CREATE OR REPLACE FUNCTION public.my_dashboard_stats()
RETURNS TABLE (
  food_saved_kg NUMERIC, people_fed BIGINT, active_donations BIGINT,
  completed_pickups BIGINT, meals_this_month BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(weight_kg) FILTER (WHERE status = 'Completed'), 0)::NUMERIC,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Completed'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE status <> 'Completed')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Completed')::BIGINT,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Completed' AND completed_at >= date_trunc('month', now())), 0)::BIGINT
  FROM public.donations
  WHERE auth.uid() IS NOT NULL AND (donor_id = auth.uid() OR claimed_by = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.my_dashboard_stats() TO authenticated;

-- NETWORK IMPACT STATS
CREATE OR REPLACE FUNCTION public.network_impact_stats()
RETURNS TABLE (
  food_saved_kg NUMERIC, people_fed BIGINT, donations_completed BIGINT, pickups_completed BIGINT,
  total_donations BIGINT, claimed_donations BIGINT, on_time_pickups BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(weight_kg) FILTER (WHERE status = 'Completed'), 0)::NUMERIC,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Completed'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Completed')::BIGINT,
    COUNT(*) FILTER (WHERE status IN ('Picked Up', 'Completed'))::BIGINT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE claimed_by IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Completed' AND pickup_deadline IS NOT NULL AND completed_at IS NOT NULL AND completed_at <= pickup_deadline)::BIGINT
  FROM public.donations;
$$;
GRANT EXECUTE ON FUNCTION public.network_impact_stats() TO authenticated;