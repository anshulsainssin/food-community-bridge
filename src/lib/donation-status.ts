export const DONATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** The pickup pipeline: Posted -> Packed (donor, pre-claim) -> Claimed/Picked Up (NGO) -> In Transit -> Delivered. */
export const PICKUP_STEPS = [
  { value: "Posted", label: "Food Posted" },
  { value: "Packed", label: "Food Packed" },
  { value: "Claimed", label: "Food Claimed / Picked Up" },
  { value: "In Transit", label: "In Transit" },
  { value: "Delivered", label: "Delivered / Handed Over" },
] as const;

type Expirable = { status: string; created_at: string };

export function isExpiredDonation(donation: Expirable) {
  if (donation.status === "Expired") return true;
  if (donation.status !== "Posted" && donation.status !== "Packed") return false;
  return Date.now() - new Date(donation.created_at).getTime() > DONATION_EXPIRY_MS;
}

export function displayStatus(donation: Expirable) {
  return isExpiredDonation(donation) ? "Expired" : donation.status;
}
