export const DONOR_ROLE = "Donor";
export const NGO_ROLE = "NGO / Volunteer";

// Mirrors the role-matching regex already used by the nearby_urgent_ngos() database function,
// so a role picked here is recognized consistently on both sides.
const NGO_ROLE_PATTERN = /(ngo|volunteer|receiver|shelter|charity|trust)/i;

export function isNgoRole(role: string | null | undefined) {
  return Boolean(role && NGO_ROLE_PATTERN.test(role));
}

/** Where a signed-in user lands right after auth: NGOs/volunteers go straight to Find Food. */
export function roleHomePath(role: string | null | undefined): "/" | "/donations" {
  return isNgoRole(role) ? "/donations" : "/";
}
