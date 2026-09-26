import type { AuthUser, Profile } from "@/integrations/mongodb/types";

export type DemoRole = "user" | "admin";

const STORAGE_KEY = "fwc_demo_session";
const DEMO_CREATED_AT = "2026-01-01T00:00:00.000Z";

export const DEMO_USER: AuthUser = {
  id: "demo-0000-0000-0000-000000000001",
  email: "demo@example.org",
};

export const DEMO_ADMIN: AuthUser = {
  id: "demo-0000-0000-0000-000000000002",
  email: "admin@example.org",
};

export const DEMO_PROFILE: Profile = {
  id: DEMO_USER.id,
  full_name: "Demo Visitor",
  role: "Sponsor",
  organization: null,
  phone: null,
  email: "demo@example.org",
  location_label: null,
  latitude: null,
  longitude: null,
  created_at: DEMO_CREATED_AT,
  updated_at: DEMO_CREATED_AT,
};

export const DEMO_ADMIN_PROFILE: Profile = {
  id: DEMO_ADMIN.id,
  full_name: "Demo Admin",
  role: "Admin",
  organization: "Neighborhood Community Kitchen",
  phone: null,
  email: "admin@example.org",
  location_label: "Mumbai, Maharashtra",
  latitude: 19.076,
  longitude: 72.8777,
  created_at: DEMO_CREATED_AT,
  updated_at: DEMO_CREATED_AT,
};

export function getDemoRole(): DemoRole | null {
  if (typeof window === "undefined") return null;
  try {
    return (localStorage.getItem(STORAGE_KEY) as DemoRole | null) ?? null;
  } catch {
    return null;
  }
}

export function setDemoRole(role: DemoRole) {
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {}
}

export function clearDemoRole() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function isDemoActive(): boolean {
  return getDemoRole() !== null;
}
