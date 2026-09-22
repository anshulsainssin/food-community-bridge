import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/hooks/use-profile";

export type DemoRole = "user" | "admin";

const STORAGE_KEY = "rn_demo_session";

export const DEMO_USER = {
  id: "demo-0000-0000-0000-000000000001",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: { full_name: "Demo Visitor" },
  email: "demo@ratnanidhikitchen.org",
  created_at: "2026-01-01T00:00:00.000Z",
} as User;

export const DEMO_ADMIN = {
  id: "demo-0000-0000-0000-000000000002",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: { full_name: "Demo Admin" },
  email: "admin@ratnanidhikitchen.org",
  created_at: "2026-01-01T00:00:00.000Z",
} as User;

export const DEMO_PROFILE: Profile = {
  id: DEMO_USER.id,
  full_name: "Demo Visitor",
  role: "Sponsor",
  organization: null,
  phone: null,
  email: "demo@ratnanidhikitchen.org",
  location_label: null,
  latitude: null,
  longitude: null,
};

export const DEMO_ADMIN_PROFILE: Profile = {
  id: DEMO_ADMIN.id,
  full_name: "Demo Admin",
  role: "Admin",
  organization: "Ratna Nidhi Central Kitchen",
  phone: null,
  email: "admin@ratnanidhikitchen.org",
  location_label: "Mumbai, Maharashtra",
  latitude: 19.076,
  longitude: 72.8777,
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
