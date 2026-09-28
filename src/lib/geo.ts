export type LatLon = { lat: number; lon: number };

/** Great-circle (haversine) distance in kilometres. */
export function distanceKm(a: LatLon, b: LatLon) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance to a donation's saved pickup point, or null when either side has no real coordinates. */
export function donationDistance(
  origin: LatLon | null,
  donation: { pickup_latitude: number | null; pickup_longitude: number | null },
) {
  if (!origin || donation.pickup_latitude == null || donation.pickup_longitude == null) return null;
  return distanceKm(origin, { lat: donation.pickup_latitude, lon: donation.pickup_longitude });
}

/** Nearest first; donations without a known distance go last. */
export function byDistance(a: number | null, b: number | null) {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a - b;
}
