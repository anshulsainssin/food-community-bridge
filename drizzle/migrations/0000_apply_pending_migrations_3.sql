-- Food Waste Connect: apply the 6 pending migrations to the live database, in order.
-- Paste this whole file into the Supabase SQL Editor and click Run, once.
--
-- * All-or-nothing: everything runs in one transaction. If any step fails, nothing is changed.
-- * Safe to run again: each migration only creates/replaces functions, triggers and one private
--   table. No user data is deleted. (Donor contact numbers are moved into a private table.)
-- * The last result table should show OK on every row.

BEGIN;

-- 0) Pre-check: stop with a clear message if the live database is missing something these
--    migrations build on (it would mean the database is not the one this app expects).
DO $precheck$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_name text;
BEGIN
  IF to_regclass('public.donations') IS NULL THEN
    RAISE EXCEPTION 'Wrong database: this project has no donations table. Open the SQL Editor of the Supabase project the app uses (project ref namplkcbmbfbbyyylquo) and run this file there. Nothing was changed.';
  END IF;
  FOREACH v_name IN ARRAY ARRAY['public.profiles','public.donations','public.claims','public.pickup_events','public.notifications','public.ngo_registrations'] LOOP
    IF to_regclass(v_name) IS NULL THEN v_missing := v_missing || ('table ' || v_name); END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['set_updated_at','claim_donation','expire_old_donations','advance_donation_status','donation_parties','network_impact_stats'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = v_name) THEN
      v_missing := v_missing || ('function public.' || v_name);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'donations_set_updated_at' AND tgrelid = to_regclass('public.donations')) THEN
    v_missing := v_missing || 'trigger donations_set_updated_at'::text;
  END IF;
  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Stopped before changing anything. Missing in this database: %', array_to_string(v_missing, ', ');
  END IF;
END
$precheck$;


-- ============================================================================
-- Migration 20260928090000_5b1f3c2e-8d4a-4f6b-9c21-7e3a0d9b4f18.sql
-- ============================================================================

-- Food safety & urgency: a donation's safe pickup window now ends at the earliest of its pickup
-- deadline, 24h after the food was prepared, and 24h after it was posted (the previous rule).
-- Mirrors safeUntil() in src/lib/donation-status.ts. Only function bodies change; no schema changes.

-- 1) Claim guard: refuse to claim donations past their safe pickup window (and mark them expired)
CREATE OR REPLACE FUNCTION public.claim_donation(p_donation_id uuid)
 RETURNS donations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_row.status = 'Expired' OR (
    v_row.status = 'Available' AND (
      v_row.created_at < now() - interval '24 hours'
      OR v_row.prepared_at < now() - interval '24 hours'
      OR v_row.pickup_deadline < now()
    )
  ) THEN
    UPDATE public.donations SET status = 'Expired' WHERE id = p_donation_id AND status = 'Available';
    RAISE EXCEPTION 'This donation has expired';
  END IF;

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
$function$;

-- 2) Hourly expiry job (already scheduled as 'expire-old-donations'): same rule
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
    RETURNING id, donor_id
  ), events AS (
    INSERT INTO public.pickup_events (donation_id, status, actor_id)
    SELECT id, 'Expired', donor_id FROM expired
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$function$;

-- ============================================================================
-- Migration 20260929090000_8c4e2a71-3f5d-4b9e-a6c0-2d7f19e3b5a4.sql
-- ============================================================================

-- QR pickup verification. Every claimed donation gets a one-time pickup code. Only the donor can read it
-- (to show as a QR code); only the NGO/volunteer who claimed the donation can redeem it, and redeeming it
-- is now the only way to move a donation to 'Picked Up'.

CREATE TABLE IF NOT EXISTS public.pickup_codes (
  donation_id UUID PRIMARY KEY REFERENCES public.donations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.pickup_codes ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: clients never read or write this table directly, only via the functions below.
REVOKE ALL ON public.pickup_codes FROM anon, authenticated;
GRANT ALL ON public.pickup_codes TO service_role;

-- 10 random hex characters (40 bits) from gen_random_uuid().
CREATE OR REPLACE FUNCTION public.new_pickup_code()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;
REVOKE EXECUTE ON FUNCTION public.new_pickup_code() FROM PUBLIC, anon, authenticated;

-- Donations already claimed and awaiting pickup get their code now.
INSERT INTO public.pickup_codes (donation_id, code)
SELECT id, public.new_pickup_code() FROM public.donations
WHERE claimed_by IS NOT NULL AND status IN ('Claimed', 'Pickup in Progress')
ON CONFLICT (donation_id) DO NOTHING;

-- 1) Claiming now also issues the pickup code (body otherwise identical to 20260928090000).
CREATE OR REPLACE FUNCTION public.claim_donation(p_donation_id uuid)
 RETURNS donations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_row.status = 'Expired' OR (
    v_row.status = 'Available' AND (
      v_row.created_at < now() - interval '24 hours'
      OR v_row.prepared_at < now() - interval '24 hours'
      OR v_row.pickup_deadline < now()
    )
  ) THEN
    UPDATE public.donations SET status = 'Expired' WHERE id = p_donation_id AND status = 'Available';
    RAISE EXCEPTION 'This donation has expired';
  END IF;

  UPDATE public.donations SET status = 'Claimed', claimed_by = v_uid, claimed_at = now()
  WHERE id = p_donation_id RETURNING * INTO v_row;

  INSERT INTO public.claims (donation_id, receiver_id) VALUES (p_donation_id, v_uid)
  ON CONFLICT (donation_id) DO NOTHING;
  INSERT INTO public.pickup_events (donation_id, status, actor_id) VALUES (p_donation_id, 'Claimed', v_uid);
  INSERT INTO public.pickup_codes (donation_id, code) VALUES (p_donation_id, public.new_pickup_code())
  ON CONFLICT (donation_id) DO NOTHING;

  SELECT COALESCE(NULLIF(organization, ''), NULLIF(full_name, ''), 'A community partner') INTO v_name
  FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.notifications (user_id, title, body, donation_id)
  VALUES (v_row.donor_id, 'Your donation was claimed',
          COALESCE(v_name, 'A community partner') || ' claimed your ' || v_row.food_type || ' donation.', p_donation_id);
  RETURN v_row;
END;
$function$;

-- 2) The donor reads their pickup code (to display as a QR code). Nobody else can.
CREATE OR REPLACE FUNCTION public.get_pickup_code(p_donation_id uuid)
RETURNS TABLE (code text, verified_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_row.donor_id <> v_uid THEN RAISE EXCEPTION 'Only the donor can view the pickup code'; END IF;
  IF v_row.claimed_by IS NULL THEN RETURN; END IF;
  -- Safety net for claims made before codes existed.
  INSERT INTO public.pickup_codes (donation_id, code) VALUES (p_donation_id, public.new_pickup_code())
  ON CONFLICT (donation_id) DO NOTHING;
  RETURN QUERY SELECT pc.code, pc.verified_at FROM public.pickup_codes pc WHERE pc.donation_id = p_donation_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_pickup_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pickup_code(uuid) TO authenticated;

-- 3) The claiming NGO/volunteer redeems the code: one use only, then the donation becomes 'Picked Up'.
CREATE OR REPLACE FUNCTION public.verify_pickup_code(p_donation_id uuid, p_code text)
RETURNS public.donations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_code public.pickup_codes;
  v_actor TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_row.claimed_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the NGO or volunteer who claimed this donation can verify its pickup';
  END IF;
  SELECT * INTO v_code FROM public.pickup_codes WHERE donation_id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No pickup code exists for this donation yet'; END IF;
  IF v_code.verified_at IS NOT NULL THEN RAISE EXCEPTION 'This pickup QR code has already been used'; END IF;
  IF v_row.status NOT IN ('Claimed', 'Pickup in Progress') THEN
    RAISE EXCEPTION 'This donation is not waiting for pickup';
  END IF;
  IF upper(regexp_replace(COALESCE(p_code, ''), '[^0-9A-Za-z]', '', 'g')) <> v_code.code THEN
    RAISE EXCEPTION 'This QR code does not match this donation';
  END IF;

  UPDATE public.pickup_codes SET verified_at = now(), verified_by = v_uid WHERE donation_id = p_donation_id;

  IF v_row.status = 'Claimed' THEN
    INSERT INTO public.pickup_events (donation_id, status, actor_id) VALUES (p_donation_id, 'Pickup in Progress', v_uid);
  END IF;
  UPDATE public.donations SET status = 'Picked Up' WHERE id = p_donation_id RETURNING * INTO v_row;
  -- clock_timestamp() (not the transaction's now()) so 'Picked Up' sorts after the event above.
  INSERT INTO public.pickup_events (donation_id, status, actor_id, occurred_at)
  VALUES (p_donation_id, 'Picked Up', v_uid, clock_timestamp());

  SELECT COALESCE(NULLIF(organization, ''), NULLIF(full_name, ''), 'The assigned NGO/volunteer') INTO v_actor
  FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.notifications (user_id, title, body, donation_id)
  VALUES (v_row.donor_id, 'Pickup verified',
          COALESCE(v_actor, 'The assigned NGO/volunteer') || ' scanned your pickup QR code for the ' || v_row.food_type || ' donation.',
          p_donation_id);
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_pickup_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_pickup_code(uuid, text) TO authenticated;

-- 4) Manual status changes follow the pickup order one step at a time, and can no longer set 'Picked Up'
--    (that now requires verify_pickup_code). Otherwise identical to the original function.
CREATE OR REPLACE FUNCTION public.advance_donation_status(p_donation_id UUID, p_status TEXT)
RETURNS public.donations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_actor TEXT;
  v_other UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_status = 'Picked Up' THEN
    RAISE EXCEPTION 'Pickup must be confirmed by scanning the donor''s pickup QR code';
  END IF;
  IF p_status NOT IN ('Pickup in Progress', 'Completed') THEN
    RAISE EXCEPTION 'Unsupported status';
  END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_uid <> v_row.donor_id AND v_uid IS DISTINCT FROM v_row.claimed_by THEN
    RAISE EXCEPTION 'You are not part of this pickup';
  END IF;
  IF v_row.claimed_by IS NULL THEN RAISE EXCEPTION 'This donation has not been claimed yet'; END IF;
  IF NOT (
    (v_row.status = 'Claimed' AND p_status = 'Pickup in Progress')
    OR (v_row.status = 'Picked Up' AND p_status = 'Completed')
  ) THEN
    RAISE EXCEPTION 'Cannot change status from % to %', v_row.status, p_status;
  END IF;

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

-- ============================================================================
-- Migration 20260930090000_3d7e9b14-6a2c-4f81-b5d0-9c4e1a7f2b63.sql
-- ============================================================================

-- The donor UPDATE/INSERT policies on donations cover whole rows, so a donor could write status,
-- claimed_by, claimed_at or completed_at directly (e.g. set 'Picked Up' or 'Completed' without the
-- NGO scanning the pickup QR code). Those columns now change only through the workflow functions
-- (claim_donation, advance_donation_status, verify_pickup_code, expire_old_donations), which run as
-- the function owner. Donors can still create, edit and delete their own donations as before.
CREATE OR REPLACE FUNCTION public.guard_donation_workflow_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Only direct client writes are checked; SECURITY DEFINER functions and the cron job run as the owner.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'Available' OR NEW.claimed_by IS NOT NULL
       OR NEW.claimed_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'New donations must start as Available';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.claimed_by IS DISTINCT FROM OLD.claimed_by
     OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Donation status can only change through the claim and pickup steps';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_donation_workflow_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS donations_guard_workflow_columns ON public.donations;
CREATE TRIGGER donations_guard_workflow_columns
BEFORE INSERT OR UPDATE ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.guard_donation_workflow_columns();

-- ============================================================================
-- Migration 20261001090000_6f2a8c3d-1b4e-4d7a-9e5f-0c8b3a2d1e47.sql
-- ============================================================================

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
-- Dropped first so this file can be re-run after 20261003090000 has added a column.
DROP FUNCTION IF EXISTS public.donation_parties(UUID);
CREATE FUNCTION public.donation_parties(p_donation_id UUID)
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

-- ============================================================================
-- Migration 20261002090000_9b3d5e7f-2c4a-4e6b-8d1f-3a5c7e9b1d24.sql
-- ============================================================================

-- 1) When a donation is posted, NGOs and volunteers near its pickup location are notified once.
--    "Near" = within 25 km (the same radius the app uses for nearby NGOs), measured from the donation's
--    own pickup coordinates to the receiver's operating area (NGO registration) or else their profile
--    location. Receivers without a known location, and the donor themself, are skipped. The trigger
--    runs once per new donation, so each receiver gets at most one notification per donation.
CREATE OR REPLACE FUNCTION public.notify_nearby_receivers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'Available' OR NEW.pickup_latitude IS NULL OR NEW.pickup_longitude IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, donation_id)
  SELECT nearby.id,
         'New food available nearby',
         NEW.food_type || ' (' || NEW.quantity || ') is ready for pickup '
           || to_char(nearby.distance_km, 'FM9990.0') || ' km from you'
           || COALESCE(' at ' || NULLIF(btrim(NEW.pickup_address), ''), '') || '.',
         NEW.id
  FROM (
    SELECT p.id,
           6371 * 2 * asin(sqrt(
             power(sin(radians(loc.lat - NEW.pickup_latitude) / 2), 2)
             + cos(radians(NEW.pickup_latitude)) * cos(radians(loc.lat))
               * power(sin(radians(loc.lon - NEW.pickup_longitude) / 2), 2)
           )) AS distance_km
    FROM public.profiles p
    LEFT JOIN public.ngo_registrations r ON r.user_id = p.id
    CROSS JOIN LATERAL (
      SELECT COALESCE(r.latitude, p.latitude) AS lat, COALESCE(r.longitude, p.longitude) AS lon
    ) loc
    WHERE p.id <> NEW.donor_id
      AND (
        lower(COALESCE(p.role, '')) ~ '(ngo|volunteer|receiver|shelter|charity|kitchen trust|trust)'
        OR (btrim(COALESCE(p.role, '')) = '' AND r.user_id IS NOT NULL)
      )
      AND loc.lat IS NOT NULL AND loc.lon IS NOT NULL
  ) nearby
  WHERE nearby.distance_km <= 25;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_nearby_receivers() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS donations_notify_nearby_receivers ON public.donations;
CREATE TRIGGER donations_notify_nearby_receivers
AFTER INSERT ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.notify_nearby_receivers();

-- 2) Pickup-update notifications use the same step names as the app ("Pickup Started" for the stored
--    'Pickup in Progress'). Everything else is identical to 20260929090000: one step at a time, and
--    'Picked Up' is only reachable through verify_pickup_code (the donor's one-time QR code).
CREATE OR REPLACE FUNCTION public.advance_donation_status(p_donation_id UUID, p_status TEXT)
RETURNS public.donations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_actor TEXT;
  v_other UUID;
  v_label TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_status = 'Picked Up' THEN
    RAISE EXCEPTION 'Pickup must be confirmed by scanning the donor''s pickup QR code';
  END IF;
  IF p_status NOT IN ('Pickup in Progress', 'Completed') THEN
    RAISE EXCEPTION 'Unsupported status';
  END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_uid <> v_row.donor_id AND v_uid IS DISTINCT FROM v_row.claimed_by THEN
    RAISE EXCEPTION 'You are not part of this pickup';
  END IF;
  IF v_row.claimed_by IS NULL THEN RAISE EXCEPTION 'This donation has not been claimed yet'; END IF;
  IF NOT (
    (v_row.status = 'Claimed' AND p_status = 'Pickup in Progress')
    OR (v_row.status = 'Picked Up' AND p_status = 'Completed')
  ) THEN
    RAISE EXCEPTION 'Cannot change status from % to %', v_row.status, p_status;
  END IF;

  UPDATE public.donations
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'Completed' THEN now() ELSE completed_at END
  WHERE id = p_donation_id RETURNING * INTO v_row;

  INSERT INTO public.pickup_events (donation_id, status, actor_id) VALUES (p_donation_id, p_status, v_uid);

  SELECT COALESCE(NULLIF(full_name, ''), NULLIF(organization, ''), 'A community member') INTO v_actor
  FROM public.profiles WHERE id = v_uid;
  v_other := CASE WHEN v_uid = v_row.donor_id THEN v_row.claimed_by ELSE v_row.donor_id END;
  v_label := CASE p_status WHEN 'Pickup in Progress' THEN 'Pickup Started' ELSE p_status END;

  IF v_other IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, donation_id)
    VALUES (v_other, 'Pickup update: ' || v_label,
            COALESCE(v_actor, 'A community member') || ' marked the ' || v_row.food_type || ' pickup as ' || v_label || '.',
            p_donation_id);
  END IF;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.advance_donation_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_donation_status(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Migration 20261003090000_4c8e1a6b-7d2f-4b9a-a3e5-6f0d2c8b9e17.sql
-- ============================================================================

-- 1) Visitors who are not signed in can see real data (read-only): network totals and the list of
--    donations. Every action (donating, claiming, pickup, QR, notifications) still needs an account.
--    Donor phone numbers are NOT part of this: 20261001090000 moved them into the private
--    donation_contacts table, and this migration refuses to run if any are still on donations.
DO $$
BEGIN
  IF to_regclass('public.donation_contacts') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261001090000 first: donor contact details must be private before donations become public.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.donations WHERE contact_info IS NOT NULL AND btrim(contact_info) <> '') THEN
    RAISE EXCEPTION 'Some donations still carry contact details in the public row; apply 20261001090000 first.';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.network_impact_stats() TO anon;

GRANT SELECT ON public.donations TO anon;
DROP POLICY IF EXISTS "Visitors can view donations" ON public.donations;
CREATE POLICY "Visitors can view donations" ON public.donations FOR SELECT TO anon USING (true);

-- 2) donation_parties() also returns the distance between the donation's pickup point and the
--    NGO/volunteer who claimed it (their registered operating area, else their saved location), so the
--    donor sees how far the collector is. Still only returned to the donor and the claimer.
--    The result gains a column, so the function is dropped and recreated (body otherwise as in
--    20261001090000).
DROP FUNCTION IF EXISTS public.donation_parties(UUID);
CREATE FUNCTION public.donation_parties(p_donation_id UUID)
RETURNS TABLE (
  donor_name TEXT, donor_organization TEXT, donor_phone TEXT,
  receiver_name TEXT, receiver_organization TEXT, receiver_phone TEXT,
  pickup_to_receiver_km DOUBLE PRECISION
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
         rp.full_name, rp.organization, rp.phone,
         CASE
           WHEN v_row.pickup_latitude IS NULL OR v_row.pickup_longitude IS NULL OR loc.lat IS NULL OR loc.lon IS NULL THEN NULL
           ELSE 6371 * 2 * asin(sqrt(
             power(sin(radians(loc.lat - v_row.pickup_latitude) / 2), 2)
             + cos(radians(v_row.pickup_latitude)) * cos(radians(loc.lat))
               * power(sin(radians(loc.lon - v_row.pickup_longitude) / 2), 2)
           ))
         END
  FROM public.profiles dp
  LEFT JOIN public.profiles rp ON rp.id = v_row.claimed_by
  LEFT JOIN public.ngo_registrations reg ON reg.user_id = v_row.claimed_by
  CROSS JOIN LATERAL (
    SELECT COALESCE(reg.latitude, rp.latitude) AS lat, COALESCE(reg.longitude, rp.longitude) AS lon
  ) loc
  WHERE dp.id = v_row.donor_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.donation_parties(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donation_parties(UUID) TO authenticated;


COMMIT;

-- Verification: every row should say OK.
SELECT item, CASE WHEN present THEN 'OK' ELSE 'MISSING' END AS status
FROM (VALUES
  ('function verify_pickup_code',        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'verify_pickup_code')),
  ('function get_pickup_code',           EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_pickup_code')),
  ('function notify_nearby_receivers',   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_nearby_receivers')),
  ('table pickup_codes',                 to_regclass('public.pickup_codes') IS NOT NULL),
  ('table donation_contacts',            to_regclass('public.donation_contacts') IS NOT NULL),
  ('trigger donations_guard_workflow_columns',   EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'donations_guard_workflow_columns')),
  ('trigger donations_store_contact',            EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'donations_store_contact')),
  ('trigger donations_notify_nearby_receivers',  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'donations_notify_nearby_receivers')),
  ('trigger ngo_registrations_set_status',       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ngo_registrations_set_status')),
  ('visitors can read network totals',           has_function_privilege('anon', 'public.network_impact_stats()', 'execute')),
  ('visitors can read donations',                EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donations' AND policyname = 'Visitors can view donations')),
  ('donation_parties returns NGO distance',      EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'donation_parties' AND 'pickup_to_receiver_km' = ANY (proargnames)))
) AS checks(item, present);