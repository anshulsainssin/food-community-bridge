/** Maps the database donation status onto the NGO admin workflow stages. */
export const ADMIN_STAGES = ["Request Placed", "Accepted", "Out for Pickup", "Delivered"] as const;

export type AdminStage = (typeof ADMIN_STAGES)[number] | "Expired";

export function adminStage(status: string): AdminStage {
  switch (status) {
    case "Available":
      return "Request Placed";
    case "Claimed":
      return "Accepted";
    case "Pickup in Progress":
    case "Picked Up":
      return "Out for Pickup";
    case "Completed":
      return "Delivered";
    default:
      return "Expired";
  }
}

export type AdminAction =
  | { kind: "claim"; label: string }
  | { kind: "advance"; label: string; statuses: string[] }
  | null;

/** The single next step an NGO can take on a donation, or null when nothing is left to do. */
export function nextAdminAction(status: string): AdminAction {
  switch (status) {
    case "Available":
      return { kind: "claim", label: "Accept request" };
    case "Claimed":
      return { kind: "advance", label: "Out for pickup", statuses: ["Pickup in Progress"] };
    case "Pickup in Progress":
      return { kind: "advance", label: "Mark delivered", statuses: ["Picked Up", "Completed"] };
    case "Picked Up":
      return { kind: "advance", label: "Mark delivered", statuses: ["Completed"] };
    default:
      return null;
  }
}
