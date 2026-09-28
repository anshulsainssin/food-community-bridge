/** Role choices on the profile. NGO and Volunteer match what nearby_urgent_ngos() treats as receivers. */
export const ROLE_OPTIONS = ["Donor", "NGO", "Volunteer"] as const;

export type RoleKind = "Donor" | "Receiver";

/** Receivers (NGOs, volunteers, shelters…) claim and collect food; everyone else donates. */
export function roleKind(role: string | null | undefined): RoleKind | null {
  const text = (role ?? "").trim().toLowerCase();
  if (!text) return null;
  return /(ngo|volunteer|receiver|shelter|charity|kitchen trust|trust)/.test(text) ? "Receiver" : "Donor";
}

/** The saved name, else the email's local part; null when neither exists (never an empty string). */
export function displayName(fullName: string | null | undefined, email: string | null | undefined) {
  const name = (fullName ?? "").trim();
  if (name) return name;
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  return local || null;
}
