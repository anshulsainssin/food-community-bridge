-- Admin dashboard, Contact Us / Volunteer signup forms, and donation photo uploads.

-- ADMINS (allowlist, not self-service). Nobody is an admin until a row is inserted here
-- directly (Supabase SQL editor / service role) — there is deliberately no self-signup path,
-- since profiles.role is user-editable and must never be trusted for privilege elevation.
CREATE TABLE public.admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admins TO authenticated;
GRANT ALL ON public.admins TO service_role;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can check their own admin membership" ON public.admins FOR SELECT TO authenticated USING (auth.uid() = id);

-- CONTACT US messages. Open to signed-out visitors; only readable by admins.
CREATE TABLE public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can send a contact message" ON public.contact_messages FOR INSERT TO anon, authenticated
  WITH CHECK (length(btrim(name)) > 0 AND length(btrim(email)) > 0 AND length(btrim(message)) > 0);

-- VOLUNTEER SIGNUPS. Same shape: open insert, admin-only read.
CREATE TABLE public.volunteer_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location_label TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.volunteer_signups TO anon, authenticated;
GRANT ALL ON public.volunteer_signups TO service_role;
ALTER TABLE public.volunteer_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can sign up to volunteer" ON public.volunteer_signups FOR INSERT TO anon, authenticated
  WITH CHECK (length(btrim(name)) > 0 AND length(btrim(email)) > 0);

-- DONATION PHOTOS: a column for the uploaded photo, plus a public storage bucket the donor
-- uploads to. photo_url joins the same explicit SELECT column allowlist as the rest of the
-- non-sensitive donation fields (contact_info stays excluded, per the earlier privacy fix).
ALTER TABLE public.donations ADD COLUMN photo_url TEXT;
GRANT SELECT (photo_url) ON public.donations TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('donation-photos', 'donation-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view donation photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'donation-photos');
CREATE POLICY "Donors can upload their own donation photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'donation-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Donors can replace their own donation photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'donation-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'donation-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Donors can delete their own donation photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'donation-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ADMIN-ONLY READS. Each function is SECURITY DEFINER (so it can see the full rows,
-- contact_info and all) but self-checks admins membership before returning anything.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS TABLE (
  total_users BIGINT, total_donations BIGINT, active_requests BIGINT, meals_delivered BIGINT,
  food_saved_kg NUMERIC, expired_donations BIGINT, pending_contact_messages BIGINT, pending_volunteer_signups BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profiles)::BIGINT,
    (SELECT count(*) FROM public.donations)::BIGINT,
    (SELECT count(*) FROM public.donations WHERE status IN ('Claimed', 'Pickup in Progress', 'Picked Up'))::BIGINT,
    (SELECT COALESCE(SUM(servings), 0) FROM public.donations WHERE status = 'Completed')::BIGINT,
    (SELECT COALESCE(SUM(weight_kg), 0) FROM public.donations WHERE status = 'Completed')::NUMERIC,
    (SELECT count(*) FROM public.donations WHERE status = 'Expired')::BIGINT,
    (SELECT count(*) FROM public.contact_messages)::BIGINT,
    (SELECT count(*) FROM public.volunteer_signups)::BIGINT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.profiles ORDER BY created_at DESC LIMIT 500;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_donations()
RETURNS SETOF public.donations LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.donations ORDER BY created_at DESC LIMIT 500;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_donations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_donations() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_contact_messages()
RETURNS SETOF public.contact_messages LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.contact_messages ORDER BY created_at DESC LIMIT 500;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_contact_messages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_contact_messages() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_volunteer_signups()
RETURNS SETOF public.volunteer_signups LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.volunteer_signups ORDER BY created_at DESC LIMIT 500;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_volunteer_signups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_volunteer_signups() TO authenticated;
