/** Choices on the donation form. Stored as the English text; shown translated. */
export const STORAGE_OPTIONS = [
  "Hot-held (above 60°C)",
  "Refrigerated (below 5°C)",
  "Frozen",
  "Room temperature (cooked within 2 hours)",
  "Room temperature (dry / packaged food)",
] as const;

export const PACKAGING_OPTIONS = [
  "Sealed food-grade containers",
  "Covered trays / vessels",
  "Food-grade bags / foil",
  "Original sealed packaging",
  "Other (see notes)",
] as const;

/** Google Maps directions to a pickup point (coordinates when known, else the typed address). */
export function directionsUrl(donation: {
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  pickup_address: string | null;
}) {
  const destination =
    donation.pickup_latitude != null && donation.pickup_longitude != null
      ? `${donation.pickup_latitude},${donation.pickup_longitude}`
      : (donation.pickup_address ?? "").trim();
  return destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;
}

/**
 * True when Supabase reports a column or table that doesn't exist yet — i.e. the database migration
 * that adds it hasn't been applied. Callers then fall back to the previous behaviour.
 */
export function isMissingSchemaError(
  error: { code?: string; message?: string } | null | undefined,
) {
  if (!error) return false;
  return (
    ["PGRST202", "PGRST204", "PGRST205", "42P01", "42703", "42883"].includes(error.code ?? "") ||
    /schema cache|does not exist/i.test(error.message ?? "")
  );
}
