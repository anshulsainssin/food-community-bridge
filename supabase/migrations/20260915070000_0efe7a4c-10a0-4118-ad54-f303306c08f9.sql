-- Close two gaps found during a security review of the donation flow.

-- 1) Contact details were readable by any signed-in user through a plain
--    `select("*")` on donations, even though donation_parties() already
--    exists specifically to keep contact info scoped to the donor and the
--    claimant. Column-level grants now keep contact_info out of the general
--    row, so it only reaches clients through the vetted RPC (which runs as
--    the function owner and is unaffected by these grants).
-- 2) The same broad UPDATE grant let a donor set `status`, `claimed_by`,
--    `claimed_at` or `completed_at` directly, bypassing the status-machine
--    checks in advance_donation_status(). Direct UPDATE is now limited to
--    the descriptive fields a donor legitimately edits; all status/claim
--    changes must go through the SECURITY DEFINER functions.
REVOKE SELECT, UPDATE ON public.donations FROM authenticated;

GRANT SELECT (
  id, donor_id, food_type, diet, quantity, servings, weight_kg, prepared_at, pickup_deadline,
  notes, status, pickup_address, pickup_latitude, pickup_longitude, claimed_by, claimed_at,
  completed_at, created_at, updated_at
) ON public.donations TO authenticated;

GRANT UPDATE (
  food_type, diet, quantity, servings, weight_kg, prepared_at, pickup_deadline, contact_info,
  notes, pickup_address, pickup_latitude, pickup_longitude
) ON public.donations TO authenticated;

-- 3) advance_donation_status() validated the target status but not the
--    current one, so a party member could jump straight from "Claimed" to
--    "Completed" over the RPC, skipping the pickup stages. Enforce the
--    single-step state machine explicitly.
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
    WHEN 'Pickup in Progress' THEN 'Claimed'
    WHEN 'Picked Up' THEN 'Pickup in Progress'
    WHEN 'Completed' THEN 'Picked Up'
    ELSE NULL
  END;
  IF v_required_from IS NULL THEN
    RAISE EXCEPTION 'Unsupported status';
  END IF;

  SELECT * INTO v_row FROM public.donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_uid <> v_row.donor_id AND v_uid IS DISTINCT FROM v_row.claimed_by THEN
    RAISE EXCEPTION 'You are not part of this pickup';
  END IF;
  IF v_row.claimed_by IS NULL THEN RAISE EXCEPTION 'This donation has not been claimed yet'; END IF;
  IF v_row.status <> v_required_from THEN
    RAISE EXCEPTION 'Cannot move from % to %', v_row.status, p_status;
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
REVOKE EXECUTE ON FUNCTION public.advance_donation_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_donation_status(UUID, TEXT) TO authenticated;
