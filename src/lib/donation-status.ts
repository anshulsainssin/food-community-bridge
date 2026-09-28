export const DONATION_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const URGENT_WINDOW_MS = 4 * 60 * 60 * 1000;
export const CRITICAL_WINDOW_MS = 60 * 60 * 1000;

export type Urgency = "Normal" | "Urgent" | "Critical" | "Expired";

type Expirable = {
  status: string;
  created_at: string;
  prepared_at: string | null;
  pickup_deadline: string | null;
};

// Statuses where the food is still waiting to be collected. Picked-up and completed donations have no urgency.
const AWAITING_PICKUP = new Set(["Available", "Claimed", "Pickup in Progress"]);

/**
 * End of the donation's safe pickup window: the earliest of its pickup deadline, 24h after the food
 * was prepared, and 24h after it was posted. Must match the rule in the claim_donation / expiry SQL.
 */
export function safeUntil(donation: Expirable) {
  const limits = [
    Date.parse(donation.created_at) + DONATION_EXPIRY_MS,
    donation.prepared_at ? Date.parse(donation.prepared_at) + DONATION_EXPIRY_MS : NaN,
    donation.pickup_deadline ? Date.parse(donation.pickup_deadline) : NaN,
  ].filter(Number.isFinite);
  return limits.length ? Math.min(...limits) : null;
}

export function donationUrgency(donation: Expirable, now = Date.now()): Urgency | null {
  if (donation.status === "Expired") return "Expired";
  if (!AWAITING_PICKUP.has(donation.status)) return null;
  const until = safeUntil(donation);
  if (until == null) return null;
  const remaining = until - now;
  if (remaining <= 0) return "Expired";
  if (remaining <= CRITICAL_WINDOW_MS) return "Critical";
  if (remaining <= URGENT_WINDOW_MS) return "Urgent";
  return "Normal";
}

export function isExpiredDonation(donation: Expirable, now = Date.now()) {
  if (donation.status === "Expired") return true;
  if (donation.status !== "Available") return false;
  return donationUrgency(donation, now) === "Expired";
}

export function displayStatus(donation: Expirable, now = Date.now()) {
  return isExpiredDonation(donation, now) ? "Expired" : donation.status;
}

/** "45 min left", "3 h 10 min left", "2 days left". */
export function formatTimeLeft(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min left` : `${hours} h left`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}
