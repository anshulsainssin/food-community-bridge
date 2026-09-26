export const DONOR_ROLE = "Donor";
export const VOLUNTEER_ROLE = "Volunteer";

/** Where a signed-in user lands right after auth. Everyone shares the same home dashboard. */
export function roleHomePath(_role: string | null | undefined): "/" {
  return "/";
}
