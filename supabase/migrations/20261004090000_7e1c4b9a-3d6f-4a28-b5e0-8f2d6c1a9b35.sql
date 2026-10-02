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
