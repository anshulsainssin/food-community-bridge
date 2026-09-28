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
  INSERT INTO public.pickup_events (donation_id, status, actor_id) VALUES (p_donation_id, 'Picked Up', v_uid);

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
