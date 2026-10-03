-- FoodBridge: apply the 3 pending database updates, in order.
--   1. 20261004090000  live GPS tracking during pickup
--   2. 20261005090000  NGO / volunteer verification, admin panel, reports, leaderboard, impact stats
--   3. 20261006090000  monthly donor certificate
--
-- HOW: copy this WHOLE file, paste it into the Supabase SQL Editor (or ask Lovable to run it as a SQL
-- migration) and run it once.
--
-- * All-or-nothing: everything runs in one transaction. If any step fails, nothing is changed.
-- * Safe to run again: every step uses IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.
--   No donations, users or other data are deleted.
-- * The last result table should show OK on every row.
-- * After it runs, make yourself admin with the INSERT at the very bottom (put in your email).

BEGIN;

-- 0) Pre-check: stop with a clear message if this isn't the FoodBridge database.
DO $precheck$
BEGIN
  IF to_regclass('public.donations') IS NULL OR to_regclass('public.ngo_registrations') IS NULL
     OR to_regclass('public.pickup_codes') IS NULL THEN
    RAISE EXCEPTION 'Wrong or outdated database: the FoodBridge tables (donations, ngo_registrations, pickup_codes) were not found. Nothing was changed.';
  END IF;
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Supabase Storage is not available in this database. Nothing was changed.';
  END IF;
END
$precheck$;


-- ============================================================================
-- Migration 20261004090000_7e1c4b9a-3d6f-4a28-b5e0-8f2d6c1a9b35.sql
-- ============================================================================

-- Live pickup tracking: while a claimed donation is waiting to be collected ('Claimed' or
-- 'Pickup in Progress'), the NGO/volunteer who claimed it shares their phone's GPS position and the
-- donor sees it move on the pickup map in real time.
--
-- * One row per donation holds only the latest position; no location history is kept.
-- * Only the donor and the claimer can read it. It is written only through share_pickup_location(),
--   which accepts positions from the claimer while the pickup is still open.
-- * The row is deleted as soon as the food is picked up (or the donation expires / is removed), so the
--   collector's location is not visible after the handover.

CREATE TABLE IF NOT EXISTS public.pickup_locations (
  donation_id UUID PRIMARY KEY REFERENCES public.donations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m DOUBLE PRECISION CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pickup_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pickup_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pickup_locations TO authenticated;

-- Donor or claimer of a donation (SECURITY DEFINER so the check does not depend on donations' own RLS).
CREATE OR REPLACE FUNCTION public.is_pickup_party(p_donation_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.donations d
    WHERE d.id = p_donation_id
      AND auth.uid() IS NOT NULL
      AND (d.donor_id = auth.uid() OR d.claimed_by = auth.uid())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_pickup_party(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pickup_party(UUID) TO authenticated;

DROP POLICY IF EXISTS "Pickup parties can view the live location" ON public.pickup_locations;
CREATE POLICY "Pickup parties can view the live location" ON public.pickup_locations
FOR SELECT TO authenticated USING (public.is_pickup_party(donation_id));

-- The claimer's phone calls this every few seconds while their pickup page is open.
CREATE OR REPLACE FUNCTION public.share_pickup_location(
  p_donation_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy_m DOUBLE PRECISION DEFAULT NULL
)
RETURNS public.pickup_locations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_location public.pickup_locations;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid location';
  END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_row.claimed_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the NGO or volunteer who claimed this donation can share their location';
  END IF;
  IF v_row.status NOT IN ('Claimed', 'Pickup in Progress') THEN
    RAISE EXCEPTION 'This donation is not waiting for pickup';
  END IF;

  INSERT INTO public.pickup_locations (donation_id, user_id, latitude, longitude, accuracy_m, updated_at)
  VALUES (p_donation_id, v_uid, p_latitude, p_longitude,
          CASE WHEN p_accuracy_m IS NULL THEN NULL ELSE GREATEST(p_accuracy_m, 0) END, now())
  ON CONFLICT (donation_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      accuracy_m = EXCLUDED.accuracy_m,
      updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_location;
  RETURN v_location;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.share_pickup_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_pickup_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- The claimer turns live sharing off: their last position is removed.
CREATE OR REPLACE FUNCTION public.stop_pickup_location(p_donation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  DELETE FROM public.pickup_locations WHERE donation_id = p_donation_id AND user_id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.stop_pickup_location(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_pickup_location(UUID) TO authenticated;

-- Once the food is picked up (or the donation leaves the open pickup states), drop the live position.
CREATE OR REPLACE FUNCTION public.clear_pickup_location()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('Claimed', 'Pickup in Progress') OR NEW.claimed_by IS DISTINCT FROM OLD.claimed_by THEN
    DELETE FROM public.pickup_locations WHERE donation_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.clear_pickup_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS donations_clear_pickup_location ON public.donations;
CREATE TRIGGER donations_clear_pickup_location
AFTER UPDATE OF status, claimed_by ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.clear_pickup_location();

-- Realtime: the donor's map moves as soon as a new position is saved.
ALTER TABLE public.pickup_locations REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pickup_locations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_locations';
  END IF;
END
$$;


-- ============================================================================
-- Migration 20261005090000_712a01da-f861-402e-a643-212a19b70ee4.sql
-- ============================================================================

-- Trust & verification update. Adds only what is new; existing tables, rows and functions keep working.
--
--  1. Platform administrators (separate user_roles table — the profile "role" is user-editable, so it
--     never grants admin rights).
--  2. Account suspension (admin-managed; suspended users can't post or claim food).
--  3. NGO verification: documents + admin review (Pending / Verified / Rejected). New and edited
--     registrations wait for an admin. Registrations that are already Verified stay Verified.
--  4. Volunteer verification (name, contact, area, ID type, last 4 digits of the ID, ID document).
--  5. Private storage bucket for verification documents (never public; admins read via signed URLs).
--  6. Donations: food name, storage condition and packaging details.
--  7. Reports on problematic listings, reviewed by admins.
--  8. Only verified NGOs / volunteers can claim food.
--  9. Admin RPCs, public impact statistics, leaderboard and badges.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------------------------
-- 1) Platform administrators
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
DROP POLICY IF EXISTS "Users can see their own roles" ON public.user_roles;
CREATE POLICY "Users can see their own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2) Suspensions
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_suspensions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_suspensions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_suspensions TO authenticated;
GRANT ALL ON public.user_suspensions TO service_role;
DROP POLICY IF EXISTS "Users can see their own suspension" ON public.user_suspensions;
CREATE POLICY "Users can see their own suspension" ON public.user_suspensions
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_user_suspended(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user);
$$;
REVOKE EXECUTE ON FUNCTION public.is_user_suspended(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_suspended(UUID) TO authenticated;

-- Suspended accounts can't post donations. RESTRICTIVE, so the existing insert policy is unchanged.
DROP POLICY IF EXISTS "Suspended users cannot post donations" ON public.donations;
CREATE POLICY "Suspended users cannot post donations" ON public.donations
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT public.is_user_suspended(auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- 3) NGO verification
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.ngo_registrations
  ADD COLUMN IF NOT EXISTS registration_number TEXT,
  ADD COLUMN IF NOT EXISTS document_path TEXT,
  ADD COLUMN IF NOT EXISTS document_name TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ngo_registrations_status_check') THEN
    ALTER TABLE public.ngo_registrations
      ADD CONSTRAINT ngo_registrations_status_check CHECK (status IN ('Pending', 'Verified', 'Rejected')) NOT VALID;
  END IF;
END
$$;

-- Replaces the old rule ("pincode located → Verified"). The NGO can't set its own status: a new or
-- resubmitted registration (organization, 80G, registration number or document changed, or it was
-- Rejected) waits as Pending for an admin. Admin RPCs run as the owner and are let through.
CREATE OR REPLACE FUNCTION public.set_ngo_registration_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'Pending';
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    RETURN NEW;
  END IF;
  NEW.status := OLD.status;
  NEW.verified_at := OLD.verified_at;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.reviewed_by := OLD.reviewed_by;
  IF OLD.status = 'Rejected'
     OR NEW.organization_name IS DISTINCT FROM OLD.organization_name
     OR NEW.registration_80g IS DISTINCT FROM OLD.registration_80g
     OR NEW.registration_number IS DISTINCT FROM OLD.registration_number
     OR NEW.document_path IS DISTINCT FROM OLD.document_path THEN
    NEW.status := 'Pending';
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_ngo_registration_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ngo_registrations_set_status ON public.ngo_registrations;
CREATE TRIGGER ngo_registrations_set_status
BEFORE INSERT OR UPDATE ON public.ngo_registrations
FOR EACH ROW EXECUTE FUNCTION public.set_ngo_registration_status();

DROP POLICY IF EXISTS "Admins can view all NGO registrations" ON public.ngo_registrations;
CREATE POLICY "Admins can view all NGO registrations" ON public.ngo_registrations
FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------------------------
-- 4) Volunteer verification
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.volunteer_verifications (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  contact_phone TEXT NOT NULL CHECK (length(btrim(contact_phone)) BETWEEN 6 AND 20),
  area TEXT NOT NULL CHECK (length(btrim(area)) BETWEEN 2 AND 200),
  pincode TEXT CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$'),
  id_type TEXT NOT NULL CHECK (id_type IN ('Aadhaar', 'PAN', 'Voter ID', 'Driving Licence', 'Passport', 'Other')),
  -- Only the last 4 characters of the ID number are stored, never the full number.
  id_last4 TEXT NOT NULL CHECK (id_last4 ~ '^[0-9A-Za-z]{4}$'),
  document_path TEXT,
  document_name TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Verified', 'Rejected')),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.volunteer_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.volunteer_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.volunteer_verifications TO authenticated;
GRANT ALL ON public.volunteer_verifications TO service_role;

DROP POLICY IF EXISTS "Volunteers see their own verification" ON public.volunteer_verifications;
CREATE POLICY "Volunteers see their own verification" ON public.volunteer_verifications
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin());
DROP POLICY IF EXISTS "Volunteers submit their own verification" ON public.volunteer_verifications;
CREATE POLICY "Volunteers submit their own verification" ON public.volunteer_verifications
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Volunteers update their own verification" ON public.volunteer_verifications;
CREATE POLICY "Volunteers update their own verification" ON public.volunteer_verifications
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_volunteer_verification_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'Pending';
    NEW.rejection_reason := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  NEW.status := OLD.status;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.created_at := OLD.created_at;
  IF OLD.status = 'Rejected'
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.id_type IS DISTINCT FROM OLD.id_type
     OR NEW.id_last4 IS DISTINCT FROM OLD.id_last4
     OR NEW.document_path IS DISTINCT FROM OLD.document_path THEN
    NEW.status := 'Pending';
    NEW.rejection_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_volunteer_verification_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS volunteer_verifications_set_status ON public.volunteer_verifications;
CREATE TRIGGER volunteer_verifications_set_status
BEFORE INSERT OR UPDATE ON public.volunteer_verifications
FOR EACH ROW EXECUTE FUNCTION public.set_volunteer_verification_status();

-- Verified NGO registration or verified volunteer.
CREATE OR REPLACE FUNCTION public.is_verified_receiver(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.ngo_registrations WHERE user_id = p_user AND status = 'Verified')
      OR EXISTS (SELECT 1 FROM public.volunteer_verifications WHERE user_id = p_user AND status = 'Verified');
$$;
REVOKE EXECUTE ON FUNCTION public.is_verified_receiver(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_verified_receiver(UUID) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5) Private bucket for verification documents: <user id>/<file>. Owners upload and read their own
--    files; admins can read all (through short-lived signed URLs). Nothing is public.
-- ---------------------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-docs', 'verification-docs', false, 5242880,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Owners upload verification documents" ON storage.objects;
CREATE POLICY "Owners upload verification documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owners and admins read verification documents" ON storage.objects;
CREATE POLICY "Owners and admins read verification documents" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'verification-docs'
       AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_platform_admin()));

DROP POLICY IF EXISTS "Owners replace verification documents" ON storage.objects;
CREATE POLICY "Owners replace verification documents" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owners delete verification documents" ON storage.objects;
CREATE POLICY "Owners delete verification documents" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- 6) Donation details
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS food_name TEXT,
  ADD COLUMN IF NOT EXISTS storage_condition TEXT,
  ADD COLUMN IF NOT EXISTS packaging TEXT;

-- ---------------------------------------------------------------------------------------------
-- 7) Reports on listings
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kept (with a label snapshot) even if an admin removes the listing.
  donation_id UUID REFERENCES public.donations(id) ON DELETE SET NULL,
  donation_label TEXT,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('Unsafe or spoiled food', 'Wrong or misleading details', 'Spam or fake listing', 'Donor did not hand over food', 'Other')),
  details TEXT CHECK (details IS NULL OR length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Resolved', 'Dismissed')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS donation_reports_one_per_user ON public.donation_reports (donation_id, reporter_id);
ALTER TABLE public.donation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.donation_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.donation_reports TO authenticated;
GRANT ALL ON public.donation_reports TO service_role;

DROP POLICY IF EXISTS "Users report listings" ON public.donation_reports;
CREATE POLICY "Users report listings" ON public.donation_reports
FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid() AND NOT public.is_user_suspended(auth.uid()));
DROP POLICY IF EXISTS "Reporters and admins see reports" ON public.donation_reports;
CREATE POLICY "Reporters and admins see reports" ON public.donation_reports
FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.prepare_donation_report()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.donations;
BEGIN
  SELECT * INTO v_row FROM public.donations WHERE id = NEW.donation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  NEW.donation_label := v_row.food_type || COALESCE(' · ' || NULLIF(btrim(v_row.food_name), ''), '')
                        || ' (' || v_row.quantity || ')';
  NEW.status := 'Open';
  NEW.admin_note := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prepare_donation_report() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS donation_reports_prepare ON public.donation_reports;
CREATE TRIGGER donation_reports_prepare
BEFORE INSERT ON public.donation_reports
FOR EACH ROW EXECUTE FUNCTION public.prepare_donation_report();

-- ---------------------------------------------------------------------------------------------
-- 8) Claiming needs a verified NGO registration or volunteer verification (and no suspension).
--    Body otherwise identical to 20260929090000.
-- ---------------------------------------------------------------------------------------------
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
  IF public.is_user_suspended(v_uid) THEN
    RAISE EXCEPTION 'Your account is suspended. Contact the platform admin.';
  END IF;
  IF NOT public.is_verified_receiver(v_uid) THEN
    RAISE EXCEPTION 'Only verified NGOs and volunteers can claim food. Complete your NGO registration or volunteer verification and wait for admin approval.';
  END IF;
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

-- ---------------------------------------------------------------------------------------------
-- 9a) Admin actions (each checks is_platform_admin())
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_ngo_status(p_registration_id UUID, p_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS public.ngo_registrations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.ngo_registrations;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_status NOT IN ('Pending', 'Verified', 'Rejected') THEN RAISE EXCEPTION 'Unsupported status'; END IF;
  IF p_status = 'Rejected' AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for the rejection';
  END IF;
  UPDATE public.ngo_registrations
  SET status = p_status,
      verified_at = CASE WHEN p_status = 'Verified' THEN now() ELSE NULL END,
      rejection_reason = CASE WHEN p_status = 'Rejected' THEN btrim(p_reason) ELSE NULL END,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = p_registration_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (v_row.user_id, 'NGO verification: ' || p_status,
          CASE p_status
            WHEN 'Verified' THEN v_row.organization_name || ' is verified. You can now claim food.'
            WHEN 'Rejected' THEN v_row.organization_name || ' was not verified: ' || btrim(p_reason) || '. Update your registration to resubmit.'
            ELSE v_row.organization_name || ' is back in review.'
          END);
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_ngo_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ngo_status(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_volunteer_status(p_user_id UUID, p_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS public.volunteer_verifications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.volunteer_verifications;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_status NOT IN ('Pending', 'Verified', 'Rejected') THEN RAISE EXCEPTION 'Unsupported status'; END IF;
  IF p_status = 'Rejected' AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for the rejection';
  END IF;
  UPDATE public.volunteer_verifications
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'Rejected' THEN btrim(p_reason) ELSE NULL END,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE user_id = p_user_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Volunteer verification not found'; END IF;
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (v_row.user_id, 'Volunteer verification: ' || p_status,
          CASE p_status
            WHEN 'Verified' THEN 'Your volunteer profile is verified. You can now claim food.'
            WHEN 'Rejected' THEN 'Your volunteer verification was not approved: ' || btrim(p_reason) || '. Update your details to resubmit.'
            ELSE 'Your volunteer verification is back in review.'
          END);
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_volunteer_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_volunteer_status(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID, full_name TEXT, email TEXT, role TEXT, organization TEXT, phone TEXT, created_at TIMESTAMPTZ,
  is_admin BOOLEAN, suspended BOOLEAN, suspension_reason TEXT, ngo_status TEXT, volunteer_status TEXT,
  donations_posted BIGINT, pickups_claimed BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.role, p.organization, p.phone, p.created_at,
         EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin'),
         s.user_id IS NOT NULL, s.reason, n.status, v.status,
         (SELECT count(*) FROM public.donations d WHERE d.donor_id = p.id),
         (SELECT count(*) FROM public.donations d WHERE d.claimed_by = p.id)
  FROM public.profiles p
  LEFT JOIN public.user_suspensions s ON s.user_id = p.id
  LEFT JOIN public.ngo_registrations n ON n.user_id = p.id
  LEFT JOIN public.volunteer_verifications v ON v.user_id = p.id
  WHERE NULLIF(btrim(p_search), '') IS NULL
     OR p.full_name ILIKE '%' || btrim(p_search) || '%'
     OR p.email ILIKE '%' || btrim(p_search) || '%'
     OR p.organization ILIKE '%' || btrim(p_search) || '%'
  ORDER BY p.created_at DESC
  LIMIT 500;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_suspension(p_user_id UUID, p_suspend BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot suspend your own account'; END IF;
  IF p_suspend THEN
    INSERT INTO public.user_suspensions (user_id, reason, suspended_by)
    VALUES (p_user_id, NULLIF(btrim(p_reason), ''), auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, suspended_by = EXCLUDED.suspended_by, suspended_at = now();
  ELSE
    DELETE FROM public.user_suspensions WHERE user_id = p_user_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_suspension(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_suspension(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_admin(p_user_id UUID, p_make_admin BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_user_id = auth.uid() AND NOT p_make_admin THEN RAISE EXCEPTION 'You cannot remove your own admin access'; END IF;
  IF p_make_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_admin(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_role NOT IN ('Donor', 'NGO', 'Volunteer') THEN RAISE EXCEPTION 'Unsupported role'; END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_report(p_report_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS public.donation_reports LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.donation_reports;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_status NOT IN ('Open', 'Resolved', 'Dismissed') THEN RAISE EXCEPTION 'Unsupported status'; END IF;
  UPDATE public.donation_reports
  SET status = p_status, admin_note = NULLIF(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_report_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_review_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_report(UUID, TEXT, TEXT) TO authenticated;

-- Removes a problematic listing. Its open reports are marked Resolved (reports are kept), and the donor
-- (and claimer, if any) are told why.
CREATE OR REPLACE FUNCTION public.admin_remove_donation(p_donation_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.donations;
  v_reason TEXT := NULLIF(btrim(p_reason), '');
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for removing the listing'; END IF;
  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  UPDATE public.donation_reports
  SET status = 'Resolved', admin_note = COALESCE(admin_note, 'Listing removed: ' || v_reason),
      reviewed_by = auth.uid(), reviewed_at = now()
  WHERE donation_id = p_donation_id AND status = 'Open';
  INSERT INTO public.notifications (user_id, title, body)
  SELECT DISTINCT person, 'Listing removed by admin',
         'The ' || v_row.food_type || ' listing (' || v_row.quantity || ') was removed: ' || v_reason || '.'
  FROM unnest(ARRAY[v_row.donor_id, v_row.claimed_by]) AS person
  WHERE person IS NOT NULL;
  DELETE FROM public.donations WHERE id = p_donation_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_remove_donation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_donation(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS TABLE (
  total_users BIGINT, donors BIGINT, ngo_accounts BIGINT, volunteer_accounts BIGINT, admins BIGINT, suspended BIGINT,
  ngo_pending BIGINT, ngo_verified BIGINT, ngo_rejected BIGINT,
  volunteer_pending BIGINT, volunteer_verified BIGINT, volunteer_rejected BIGINT,
  donations_total BIGINT, donations_available BIGINT, donations_claimed BIGINT, donations_in_pickup BIGINT,
  donations_picked_up BIGINT, donations_completed BIGINT, donations_expired BIGINT,
  food_donated_kg NUMERIC, food_saved_kg NUMERIC, people_fed BIGINT, open_reports BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.profiles p WHERE btrim(COALESCE(p.role, '')) <> ''
       AND lower(p.role) !~ '(ngo|volunteer|receiver|shelter|charity|kitchen trust|trust)'),
    (SELECT count(*) FROM public.profiles p WHERE lower(COALESCE(p.role, '')) ~ '(ngo|shelter|charity|kitchen trust|trust)'),
    (SELECT count(*) FROM public.profiles p WHERE lower(COALESCE(p.role, '')) ~ 'volunteer'),
    (SELECT count(*) FROM public.user_roles r WHERE r.role = 'admin'),
    (SELECT count(*) FROM public.user_suspensions),
    (SELECT count(*) FROM public.ngo_registrations n WHERE n.status = 'Pending'),
    (SELECT count(*) FROM public.ngo_registrations n WHERE n.status = 'Verified'),
    (SELECT count(*) FROM public.ngo_registrations n WHERE n.status = 'Rejected'),
    (SELECT count(*) FROM public.volunteer_verifications v WHERE v.status = 'Pending'),
    (SELECT count(*) FROM public.volunteer_verifications v WHERE v.status = 'Verified'),
    (SELECT count(*) FROM public.volunteer_verifications v WHERE v.status = 'Rejected'),
    (SELECT count(*) FROM public.donations),
    (SELECT count(*) FROM public.donations d WHERE d.status = 'Available'),
    (SELECT count(*) FROM public.donations d WHERE d.status = 'Claimed'),
    (SELECT count(*) FROM public.donations d WHERE d.status = 'Pickup in Progress'),
    (SELECT count(*) FROM public.donations d WHERE d.status = 'Picked Up'),
    (SELECT count(*) FROM public.donations d WHERE d.status = 'Completed'),
    (SELECT count(*) FROM public.donations d WHERE d.status = 'Expired'),
    (SELECT COALESCE(sum(d.weight_kg), 0)::NUMERIC FROM public.donations d),
    (SELECT COALESCE(sum(d.weight_kg), 0)::NUMERIC FROM public.donations d WHERE d.status = 'Completed'),
    (SELECT COALESCE(sum(d.servings), 0)::BIGINT FROM public.donations d WHERE d.status = 'Completed'),
    (SELECT count(*) FROM public.donation_reports r WHERE r.status = 'Open');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9b) Public impact statistics (totals only, no personal data). Readable by visitors too, like
--     network_impact_stats().
--     Estimated food waste reduced = recorded weight of completed donations, plus 0.4 kg per person
--     served when a completed donation has no recorded weight.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_impact_stats()
RETURNS TABLE (
  food_donated_kg NUMERIC, food_saved_kg NUMERIC, completed_pickups BIGINT,
  verified_ngos BIGINT, active_volunteers BIGINT, waste_reduced_kg NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COALESCE(sum(weight_kg), 0)::NUMERIC FROM public.donations),
    (SELECT COALESCE(sum(weight_kg), 0)::NUMERIC FROM public.donations WHERE status = 'Completed'),
    (SELECT count(*) FROM public.donations WHERE status = 'Completed'),
    (SELECT count(*) FROM public.ngo_registrations WHERE status = 'Verified'),
    (SELECT count(DISTINCT d.claimed_by) FROM public.donations d
       JOIN public.profiles p ON p.id = d.claimed_by
      WHERE lower(COALESCE(p.role, '')) ~ 'volunteer' AND d.claimed_at >= now() - interval '30 days'),
    (SELECT COALESCE(sum(COALESCE(weight_kg, servings * 0.4)), 0)::NUMERIC FROM public.donations WHERE status = 'Completed');
$$;
REVOKE EXECUTE ON FUNCTION public.platform_impact_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_impact_stats() TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9c) Leaderboard (top 5 donors by completed donations, top 5 volunteers by completed pickups) and
--     badges. Only a display name is returned: the organization, else first name + last initial.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_display_name(p_full_name TEXT, p_organization TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(btrim(p_organization), ''),
    NULLIF(btrim(split_part(btrim(COALESCE(p_full_name, '')), ' ', 1)
      || CASE WHEN position(' ' IN btrim(COALESCE(p_full_name, ''))) > 0
              THEN ' ' || upper(left(reverse(split_part(reverse(btrim(p_full_name)), ' ', 1)), 1)) || '.'
              ELSE '' END), ''),
    'Community member');
$$;

CREATE OR REPLACE FUNCTION public.leaderboard()
RETURNS TABLE (board TEXT, rank INT, display_name TEXT, completed BIGINT, food_kg NUMERIC, people_served BIGINT, is_me BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  (SELECT 'donors', row_number() OVER (ORDER BY t.completed DESC, t.food_kg DESC, t.first_done)::INT,
          public.public_display_name(p.full_name, p.organization), t.completed, t.food_kg, t.people, t.user_id = auth.uid()
   FROM (SELECT d.donor_id AS user_id, count(*) AS completed, COALESCE(sum(d.weight_kg), 0)::NUMERIC AS food_kg,
                COALESCE(sum(d.servings), 0)::BIGINT AS people, min(d.completed_at) AS first_done
         FROM public.donations d WHERE d.status = 'Completed' GROUP BY d.donor_id) t
   JOIN public.profiles p ON p.id = t.user_id
   ORDER BY 2 LIMIT 5)
  UNION ALL
  (SELECT 'volunteers', row_number() OVER (ORDER BY t.completed DESC, t.food_kg DESC, t.first_done)::INT,
          public.public_display_name(p.full_name, p.organization), t.completed, t.food_kg, t.people, t.user_id = auth.uid()
   FROM (SELECT d.claimed_by AS user_id, count(*) AS completed, COALESCE(sum(d.weight_kg), 0)::NUMERIC AS food_kg,
                COALESCE(sum(d.servings), 0)::BIGINT AS people, min(d.completed_at) AS first_done
         FROM public.donations d WHERE d.status = 'Completed' AND d.claimed_by IS NOT NULL GROUP BY d.claimed_by) t
   JOIN public.profiles p ON p.id = t.user_id
   WHERE lower(COALESCE(p.role, '')) ~ 'volunteer'
   ORDER BY 2 LIMIT 5);
$$;
REVOKE EXECUTE ON FUNCTION public.leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leaderboard() TO anon, authenticated;

-- Badges earned by the signed-in user:
--  * Zero Food Waste Champion — 5+ completed donations and none of their donations expired unclaimed.
--  * Top Donor / Top Volunteer — currently in the top 5 of the leaderboard.
CREATE OR REPLACE FUNCTION public.my_badges()
RETURNS TABLE (badge TEXT, detail TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT
      (SELECT count(*) FROM public.donations WHERE donor_id = auth.uid() AND status = 'Completed') AS done,
      (SELECT count(*) FROM public.donations WHERE donor_id = auth.uid() AND status = 'Expired') AS expired
  )
  SELECT 'Zero Food Waste Champion', me.done || ' completed donations and none expired'
  FROM me WHERE auth.uid() IS NOT NULL AND me.done >= 5 AND me.expired = 0
  UNION ALL
  SELECT CASE l.board WHEN 'donors' THEN 'Top Donor' ELSE 'Top Volunteer' END,
         '#' || l.rank || ' on the leaderboard · ' || l.completed || ' completed'
  FROM public.leaderboard() l WHERE l.is_me;
$$;
REVOKE EXECUTE ON FUNCTION public.my_badges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_badges() TO authenticated;


-- ============================================================================
-- Migration 20261006090000_c174d058-f678-4621-aab5-7f66437db588.sql
-- ============================================================================

-- Monthly donor certificate: a donor whose completed donations in one calendar month (India time)
-- add up to more than 100 kg earns a certificate of appreciation for that month.
-- Only completed donations with a recorded weight count. Safe to run more than once.

-- The signed-in donor's certificates, newest month first.
CREATE OR REPLACE FUNCTION public.my_certificates()
RETURNS TABLE (
  month DATE, total_kg NUMERIC, donations BIGINT, people_served BIGINT,
  certificate_no TEXT, recipient_name TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.month, m.total_kg, m.donations, m.people,
         'FWC-' || to_char(m.month, 'YYYYMM') || '-' || upper(left(replace(auth.uid()::text, '-', ''), 8)),
         COALESCE(NULLIF(btrim(p.organization), ''), NULLIF(btrim(p.full_name), ''), 'Food donor')
  FROM (
    SELECT date_trunc('month', d.completed_at AT TIME ZONE 'Asia/Kolkata')::date AS month,
           COALESCE(sum(d.weight_kg), 0)::NUMERIC AS total_kg,
           count(*) AS donations,
           COALESCE(sum(d.servings), 0)::BIGINT AS people
    FROM public.donations d
    WHERE auth.uid() IS NOT NULL AND d.donor_id = auth.uid()
      AND d.status = 'Completed' AND d.completed_at IS NOT NULL
    GROUP BY 1
  ) m
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE m.total_kg > 100
  ORDER BY m.month DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.my_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_certificates() TO authenticated;

-- Tell the donor the moment a completed donation takes their month past 100 kg.
CREATE OR REPLACE FUNCTION public.notify_monthly_certificate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month DATE;
  v_total NUMERIC;
BEGIN
  IF NEW.status <> 'Completed' OR OLD.status = 'Completed' OR NEW.weight_kg IS NULL OR NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;
  v_month := date_trunc('month', NEW.completed_at AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT COALESCE(sum(weight_kg), 0) INTO v_total
  FROM public.donations
  WHERE donor_id = NEW.donor_id AND status = 'Completed' AND completed_at IS NOT NULL
    AND date_trunc('month', completed_at AT TIME ZONE 'Asia/Kolkata')::date = v_month;
  -- This row is already counted (AFTER trigger), so the month crossed 100 kg with this donation.
  IF v_total > 100 AND v_total - NEW.weight_kg <= 100 THEN
    INSERT INTO public.notifications (user_id, title, body)
    VALUES (NEW.donor_id, 'You earned a certificate',
            'You donated ' || to_char(v_total, 'FM999990.##') || ' kg of food in ' || to_char(v_month, 'FMMonth YYYY')
              || '. Download your certificate of appreciation from your profile.');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_monthly_certificate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS donations_notify_monthly_certificate ON public.donations;
CREATE TRIGGER donations_notify_monthly_certificate
AFTER UPDATE OF status ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.notify_monthly_certificate();


COMMIT;

-- Verification: every row should say OK.
SELECT item, CASE WHEN present THEN 'OK' ELSE 'MISSING' END AS status
FROM (VALUES
  ('live tracking: table pickup_locations',         to_regclass('public.pickup_locations') IS NOT NULL),
  ('live tracking: function share_pickup_location', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'share_pickup_location')),
  ('admin: table user_roles',                       to_regclass('public.user_roles') IS NOT NULL),
  ('admin: function admin_overview',                EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_overview')),
  ('verification: table volunteer_verifications',   to_regclass('public.volunteer_verifications') IS NOT NULL),
  ('verification: NGO document column',            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ngo_registrations' AND column_name = 'document_path')),
  ('verification: private documents bucket',       EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'verification-docs' AND NOT public)),
  ('donations: storage / packaging columns',        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'donations' AND column_name = 'packaging')),
  ('reports: table donation_reports',               to_regclass('public.donation_reports') IS NOT NULL),
  ('impact: function platform_impact_stats',        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'platform_impact_stats')),
  ('leaderboard: function leaderboard',             EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'leaderboard')),
  ('certificate: function my_certificates',         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'my_certificates')),
  ('certificate: notification trigger',             EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'donations_notify_monthly_certificate'))
) AS checks(item, present);

-- Make yourself the first admin (replace the email with the one you sign in with, then run this line):
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'your-email@example.com'
-- ON CONFLICT DO NOTHING;
