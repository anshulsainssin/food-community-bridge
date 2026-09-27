export const DONATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

type Expirable = { status: string; created_at: string };

export function isExpiredDonation(donation: Expirable) {
  if (donation.status === "Expired") return true;
  if (donation.status !== "Available") return false;
  return Date.now() - new Date(donation.created_at).getTime() > DONATION_EXPIRY_MS;
}

export function displayStatus(donation: Expirable) {
  return isExpiredDonation(donation) ? "Expired" : donation.status;
}
