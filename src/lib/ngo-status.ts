import { statusLabel } from "@/lib/donation-status";

/** The NGO dashboard shows the same pickup steps as the tracking page. */
export const ADMIN_STAGES = ["Available", "Claimed", "Pickup Started", "Picked Up", "Completed"] as const;

export type AdminStage = (typeof ADMIN_STAGES)[number] | "Expired";

export function adminStage(status: string): AdminStage {
  switch (status) {
    case "Available":
    case "Claimed":
    case "Pickup in Progress":
    case "Picked Up":
    case "Completed":
      return statusLabel(status) as AdminStage;
    default:
      return "Expired";
  }
}

export type AdminAction =
  | { kind: "claim"; label: string }
  | { kind: "advance"; label: string; statuses: string[] }
  | { kind: "verify"; label: string }
  | null;

/** The single next step an NGO can take on a donation, or null when nothing is left to do. */
export function nextAdminAction(status: string): AdminAction {
  switch (status) {
    case "Available":
      return { kind: "claim", label: "Claim food" };
    case "Claimed":
      return { kind: "advance", label: "Start pickup", statuses: ["Pickup in Progress"] };
    case "Pickup in Progress":
      // "Picked Up" requires scanning the donor's one-time pickup QR code.
      return { kind: "verify", label: "Verify pickup QR" };
    case "Picked Up":
      return { kind: "advance", label: "Mark completed", statuses: ["Completed"] };
    default:
      return null;
  }
}
