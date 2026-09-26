export const DONOR_ROLE = "Donor";
export const NGO_ROLE = "NGO / Volunteer";

/** Where a signed-in user lands right after auth. Everyone shares the same home dashboard. */
export function roleHomePath(_role: string | null | undefined): "/" {
  return "/";
}
