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
