-- Replace the pickup status pipeline with the requested 5-stage flow:
--   Posted -> Packed (donor, pre-claim) -> Claimed/Picked Up (NGO) -> In Transit -> Delivered
-- This supersedes the earlier 5-stage pipeline (Available -> Claimed -> Pickup in Progress ->
-- Picked Up -> Completed). "Packed" is new: the donor marks their own still-unclaimed listing
-- ready before an NGO can claim it. Claiming and pickup-confirmation are combined into one
-- NGO-side action ("Claimed"), same as before, just relabeled in the UI as "Claimed / Picked Up".

-- 1) New default + backfill of existing rows to the new vocabulary.
ALTER TABLE public.donations ALTER COLUMN status SET DEFAULT 'Posted';

UPDATE public.donations SET status = 'Delivered' WHERE status = 'Completed';
UPDATE public.donations SET status = 'In Transit' WHERE status = 'Pickup in Progress';
UPDATE public.donations SET status = 'Claimed' WHERE status = 'Picked Up';
UPDATE public.donations SET status = 'Posted' WHERE status = 'Available';

UPDATE public.pickup_events SET status = 'Delivered' WHERE status = 'Completed';
UPDATE public.pickup_events SET status = 'In Transit' WHERE status = 'Pickup in Progress';
UPDATE public.pickup_events SET status = 'Claimed' WHERE status = 'Picked Up';
UPDATE public.pickup_events SET status = 'Posted' WHERE status = 'Available';

-- 2) Claiming now requires the donor to have marked the listing 'Packed' first.
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
  IF v_row.status = 'Expired' OR (v_row.status IN ('Posted', 'Packed') AND v_row.created_at < now() - interval '24 hours') THEN
    UPDATE public.donations SET status = 'Expired' WHERE id = p_donation_id AND status IN ('Posted', 'Packed');
    RAISE EXCEPTION 'This donation has expired';
  END IF;
  IF v_row.status <> 'Packed' THEN
    RAISE EXCEPTION 'This donation is not packed and ready for pickup yet';
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
          COALESCE(v_name, 'A community partner') || ' claimed and picked up your ' || v_row.food_type || ' donation.', p_donation_id);
  RETURN v_row;
END;
$function$;

-- 3) advance_donation_status now also handles the donor-only, pre-claim 'Packed' transition,
--    alongside the existing claimant/donor-shared 'In Transit' and 'Delivered' transitions.
CREATE OR REPLACE FUNCTION public.advance_donation_status(p_donation_id UUID, p_status TEXT)
RETURNS public.donations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.donations;
  v_actor TEXT;
  v_other UUID;
  v_required_from TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  v_required_from := CASE p_status
    WHEN 'Packed' THEN 'Posted'
    WHEN 'In Transit' THEN 'Claimed'
    WHEN 'Delivered' THEN 'In Transit'
    ELSE NULL
  END;
  IF v_required_from IS NULL THEN
    RAISE EXCEPTION 'Unsupported status';
  END IF;

  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;

  IF p_status = 'Packed' THEN
    IF v_uid <> v_row.donor_id THEN RAISE EXCEPTION 'Only the donor can mark this donation packed'; END IF;
  ELSE
    IF v_uid <> v_row.donor_id AND v_uid IS DISTINCT FROM v_row.claimed_by THEN
      RAISE EXCEPTION 'You are not part of this pickup';
    END IF;
    IF v_row.claimed_by IS NULL THEN RAISE EXCEPTION 'This donation has not been claimed yet'; END IF;
  END IF;

  IF v_row.status <> v_required_from THEN
    RAISE EXCEPTION 'Cannot move from % to %', v_row.status, p_status;
  END IF;

  UPDATE public.donations
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'Delivered' THEN now() ELSE completed_at END
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

-- 4) Auto-expiry now watches both pre-claim states.
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
    WHERE status IN ('Posted', 'Packed') AND created_at < now() - interval '24 hours'
    RETURNING id, donor_id
  ), events AS (
    INSERT INTO public.pickup_events (donation_id, status, actor_id)
    SELECT id, 'Expired', donor_id FROM expired
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$function$;

-- 5) Dashboard stats against the new terminal/active status values.
CREATE OR REPLACE FUNCTION public.my_dashboard_stats()
 RETURNS TABLE(food_saved_kg numeric, people_fed bigint, active_donations bigint, completed_pickups bigint, meals_this_month bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(weight_kg) FILTER (WHERE status = 'Delivered'), 0)::NUMERIC,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Delivered'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE status NOT IN ('Delivered', 'Expired'))::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Delivered')::BIGINT,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Delivered' AND completed_at >= date_trunc('month', now())), 0)::BIGINT
  FROM public.donations
  WHERE auth.uid() IS NOT NULL AND (donor_id = auth.uid() OR claimed_by = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.network_impact_stats()
RETURNS TABLE (
  food_saved_kg NUMERIC, people_fed BIGINT, donations_completed BIGINT, pickups_completed BIGINT,
  total_donations BIGINT, claimed_donations BIGINT, on_time_pickups BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(weight_kg) FILTER (WHERE status = 'Delivered'), 0)::NUMERIC,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Delivered'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Delivered')::BIGINT,
    COUNT(*) FILTER (WHERE status IN ('Claimed', 'In Transit', 'Delivered'))::BIGINT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE claimed_by IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Delivered' AND pickup_deadline IS NOT NULL AND completed_at IS NOT NULL AND completed_at <= pickup_deadline)::BIGINT
  FROM public.donations;
$$;

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
    (SELECT count(*) FROM public.donations WHERE status IN ('Claimed', 'In Transit'))::BIGINT,
    (SELECT COALESCE(SUM(servings), 0) FROM public.donations WHERE status = 'Delivered')::BIGINT,
    (SELECT COALESCE(SUM(weight_kg), 0) FROM public.donations WHERE status = 'Delivered')::NUMERIC,
    (SELECT count(*) FROM public.donations WHERE status = 'Expired')::BIGINT,
    (SELECT count(*) FROM public.contact_messages)::BIGINT,
    (SELECT count(*) FROM public.volunteer_signups)::BIGINT;
END;
$$;

-- 6) Nearby-NGOs urgency counts against the new active states.
CREATE OR REPLACE FUNCTION public.nearby_urgent_ngos(p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 25)
RETURNS TABLE(
  id uuid,
  full_name text,
  organization text,
  role text,
  location_label text,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  active_claims bigint,
  urgent_claims bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.organization,
    p.role,
    p.location_label,
    p.latitude,
    p.longitude,
    CASE
      WHEN p_lat IS NULL OR p_lon IS NULL OR p.latitude IS NULL OR p.longitude IS NULL THEN NULL
      ELSE 6371 * 2 * asin(sqrt(
        power(sin(radians(p.latitude - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - p_lon) / 2), 2)
      ))
    END AS distance_km,
    count(d.id) FILTER (WHERE d.status IN ('Claimed', 'In Transit')) AS active_claims,
    count(d.id) FILTER (
      WHERE d.status IN ('Claimed', 'In Transit')
        AND d.pickup_deadline IS NOT NULL
        AND d.pickup_deadline <= now() + interval '4 hours'
    ) AS urgent_claims
  FROM public.profiles p
  LEFT JOIN public.donations d ON d.claimed_by = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.role IS NOT NULL
    AND lower(p.role) ~ '(ngo|volunteer|receiver|shelter|charity|kitchen trust|trust)'
  GROUP BY p.id, p.full_name, p.organization, p.role, p.location_label, p.latitude, p.longitude
  HAVING
    p_lat IS NULL OR p_lon IS NULL OR p.latitude IS NULL OR p.longitude IS NULL
    OR 6371 * 2 * asin(sqrt(
        power(sin(radians(p.latitude - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - p_lon) / 2), 2)
      )) <= coalesce(p_radius_km, 25)
  ORDER BY urgent_claims DESC, distance_km ASC NULLS LAST
  LIMIT 12
$$;
