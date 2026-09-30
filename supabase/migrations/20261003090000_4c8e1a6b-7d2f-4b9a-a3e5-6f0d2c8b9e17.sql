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
