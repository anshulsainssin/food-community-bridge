-- Feature audit fixes. Only function bodies, one new private table and triggers; no existing data is
-- deleted.

-- 1) Donors are told when their donation expires unclaimed. Same expiry rule as 20260928090000; each
--    donation can only expire once, so this sends exactly one notification per expired donation.
CREATE OR REPLACE FUNCTION public.expire_old_donations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.donations
    SET status = 'Expired'
    WHERE status = 'Available' AND (
      created_at < now() - interval '24 hours'
      OR prepared_at < now() - interval '24 hours'
      OR pickup_deadline < now()
    )
    RETURNING id, donor_id, food_type
  ), events AS (
    INSERT INTO public.pickup_events (donation_id, status, actor_id)
    SELECT id, 'Expired', donor_id FROM expired
  ), notes AS (
    INSERT INTO public.notifications (user_id, title, body, donation_id)
    SELECT donor_id, 'Donation expired',
           'Your ' || food_type || ' donation passed its safe pickup window before anyone claimed it, so it can no longer be claimed.',
           id
    FROM expired
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$function$;

-- 2) Donor contact details were readable by every signed-in user (the donations SELECT policy is
--    row-level only). They now live in a private table that clients cannot read; donation_parties()
--    already hands them to the donor and the claiming NGO/volunteer only. The app keeps writing
--    donations.contact_info as before: a trigger moves the value here and leaves the column empty,
--    so it never reaches other users (not even through realtime).
CREATE TABLE IF NOT EXISTS public.donation_contacts (
  donation_id UUID PRIMARY KEY REFERENCES public.donations(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  contact_info TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.donation_contacts ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the SECURITY DEFINER functions below touch this table.
REVOKE ALL ON public.donation_contacts FROM anon, authenticated;
GRANT ALL ON public.donation_contacts TO service_role;

CREATE OR REPLACE FUNCTION public.store_donation_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_info IS NOT NULL THEN
    IF btrim(NEW.contact_info) = '' THEN
      DELETE FROM public.donation_contacts WHERE donation_id = NEW.id;
    ELSE
      INSERT INTO public.donation_contacts (donation_id, contact_info)
      VALUES (NEW.id, NEW.contact_info)
      ON CONFLICT (donation_id) DO UPDATE SET contact_info = EXCLUDED.contact_info, updated_at = now();
    END IF;
    NEW.contact_info := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.store_donation_contact() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS donations_store_contact ON public.donations;
CREATE TRIGGER donations_store_contact
BEFORE INSERT OR UPDATE OF contact_info ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.store_donation_contact();

-- Move existing contact details into the private table (without bumping updated_at).
INSERT INTO public.donation_contacts (donation_id, contact_info)
SELECT id, contact_info FROM public.donations
WHERE contact_info IS NOT NULL AND btrim(contact_info) <> ''
ON CONFLICT (donation_id) DO NOTHING;
ALTER TABLE public.donations DISABLE TRIGGER donations_set_updated_at;
UPDATE public.donations SET contact_info = NULL WHERE contact_info IS NOT NULL;
ALTER TABLE public.donations ENABLE TRIGGER donations_set_updated_at;

-- Same result columns as before; the donor contact now comes from the private table.
CREATE OR REPLACE FUNCTION public.donation_parties(p_donation_id UUID)
RETURNS TABLE (
  donor_name TEXT, donor_organization TEXT, donor_phone TEXT,
  receiver_name TEXT, receiver_organization TEXT, receiver_phone TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_contact TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_uid <> v_row.donor_id AND v_uid IS DISTINCT FROM v_row.claimed_by THEN RETURN; END IF;
  SELECT dc.contact_info INTO v_contact FROM public.donation_contacts dc WHERE dc.donation_id = p_donation_id;
  RETURN QUERY
  SELECT dp.full_name, dp.organization,
         COALESCE(NULLIF(v_contact, ''), NULLIF(v_row.contact_info, ''), dp.phone),
         rp.full_name, rp.organization, rp.phone
  FROM public.profiles dp
  LEFT JOIN public.profiles rp ON rp.id = v_row.claimed_by
  WHERE dp.id = v_row.donor_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.donation_parties(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donation_parties(UUID) TO authenticated;

-- 3) NGO registration status is decided by the database, not the browser: 'Verified' only when the
--    operating pincode was resolved to a location, with the server's own timestamp. This is the same
--    rule the app already used; users just can't set 'Verified' on their own any more. Changes made by
--    an administrator (service role / SQL editor) are left alone, and existing rows are not touched.
CREATE OR REPLACE FUNCTION public.set_ngo_registration_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.status := 'Verified';
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Verified' OR NEW.pincode IS DISTINCT FROM OLD.pincode THEN
      NEW.verified_at := now();
    ELSE
      NEW.verified_at := OLD.verified_at;
    END IF;
  ELSE
    NEW.status := 'Pending';
    NEW.verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_ngo_registration_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ngo_registrations_set_status ON public.ngo_registrations;
CREATE TRIGGER ngo_registrations_set_status
BEFORE INSERT OR UPDATE ON public.ngo_registrations
FOR EACH ROW EXECUTE FUNCTION public.set_ngo_registration_status();

-- 4) Network totals also report active donations (not completed and not expired), for the Impact page.
--    The result gains one column, so the function has to be dropped and recreated.
DROP FUNCTION IF EXISTS public.network_impact_stats();
CREATE FUNCTION public.network_impact_stats()
RETURNS TABLE (
  food_saved_kg NUMERIC, people_fed BIGINT, donations_completed BIGINT, pickups_completed BIGINT,
  total_donations BIGINT, claimed_donations BIGINT, on_time_pickups BIGINT, active_donations BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(weight_kg) FILTER (WHERE status = 'Completed'), 0)::NUMERIC,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Completed'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Completed')::BIGINT,
    COUNT(*) FILTER (WHERE status IN ('Picked Up', 'Completed'))::BIGINT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE claimed_by IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Completed' AND pickup_deadline IS NOT NULL AND completed_at IS NOT NULL AND completed_at <= pickup_deadline)::BIGINT,
    COUNT(*) FILTER (WHERE status NOT IN ('Completed', 'Expired'))::BIGINT
  FROM public.donations;
$$;
REVOKE EXECUTE ON FUNCTION public.network_impact_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.network_impact_stats() TO authenticated;
