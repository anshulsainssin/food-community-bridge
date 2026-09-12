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
    count(d.id) FILTER (WHERE d.status IN ('Claimed', 'Pickup in Progress')) AS active_claims,
    count(d.id) FILTER (
      WHERE d.status IN ('Claimed', 'Pickup in Progress')
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

REVOKE ALL ON FUNCTION public.nearby_urgent_ngos(double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nearby_urgent_ngos(double precision, double precision, double precision) TO authenticated;