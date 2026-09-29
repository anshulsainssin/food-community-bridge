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
