CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1) Block claiming of expired donations (and lazily mark them expired)
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
  IF v_row.status = 'Expired' OR (v_row.status = 'Available' AND v_row.created_at < now() - interval '24 hours') THEN
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

-- 2) Batch expiry: marks Available donations older than 24h as Expired and logs a timeline event
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
    WHERE status = 'Available' AND created_at < now() - interval '24 hours'
    RETURNING id, donor_id
  ), events AS (
    INSERT INTO public.pickup_events (donation_id, status, actor_id)
    SELECT id, 'Expired', donor_id FROM expired
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$function$;

-- 3) Hourly job that runs the expiry check
SELECT cron.schedule('expire-old-donations', '0 * * * *', $$SELECT public.expire_old_donations();$$);

-- 4) Expired donations no longer count as active in dashboard stats
CREATE OR REPLACE FUNCTION public.my_dashboard_stats()
 RETURNS TABLE(food_saved_kg numeric, people_fed bigint, active_donations bigint, completed_pickups bigint, meals_this_month bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(weight_kg) FILTER (WHERE status = 'Completed'), 0)::NUMERIC,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Completed'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE status NOT IN ('Completed', 'Expired'))::BIGINT,
    COUNT(*) FILTER (WHERE status = 'Completed')::BIGINT,
    COALESCE(SUM(servings) FILTER (WHERE status = 'Completed' AND completed_at >= date_trunc('month', now())), 0)::BIGINT
  FROM public.donations
  WHERE auth.uid() IS NOT NULL AND (donor_id = auth.uid() OR claimed_by = auth.uid());
$function$;