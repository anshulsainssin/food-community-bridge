import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "@/lib/geo";
import { ROLE_OPTIONS, roleKind } from "@/lib/roles";

export type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
};

const PROFILE_COLUMNS = "id, full_name, role, organization, phone, email, location_label, latitude, longitude";
const PENDING_ROLE_KEY = "fwc-pending-role";

/** Keeps the role picked on the sign-up screen across the Google redirect (email sign-ups carry it in user metadata). */
export function rememberPendingRole(role: string) {
  try {
    sessionStorage.setItem(PENDING_ROLE_KEY, role);
  } catch {
    // Storage can be unavailable (private mode); the role can still be set on the profile page.
  }
}

function pendingRole(user: User) {
  const fromMetadata: unknown = user.user_metadata?.["role"];
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(PENDING_ROLE_KEY);
  } catch {
    stored = null;
  }
  const candidate = typeof fromMetadata === "string" ? fromMetadata : stored;
  return candidate && (ROLE_OPTIONS as readonly string[]).includes(candidate) ? candidate : null;
}

/**
 * The user's profile row. The first time a user signs in after choosing a role at sign-up, that role
 * is saved to their profile; a role that is already set is never overwritten.
 */
export async function fetchProfile(user: User): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  const profile = (data as Profile | null) ?? null;
  let role = pendingRole(user);
  if (profile && !profile.role?.trim() && !role) {
    // An account that registered its organization in the NGO portal is an NGO, even if its profile
    // role was never set (accounts created before sign-up asked for a role).
    const { data: registration } = await supabase.from("ngo_registrations").select("id").eq("user_id", user.id).maybeSingle();
    if (registration) role = "NGO";
  }
  if (profile && !profile.role?.trim() && role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", user.id);
    if (!error) profile.role = role;
  }
  if (profile?.role?.trim()) {
    try {
      sessionStorage.removeItem(PENDING_ROLE_KEY);
    } catch {
      // ignore
    }
  }
  return profile;
}

/** Where a user starts after signing in: NGOs and volunteers get the NGO dashboard, everyone else the donor dashboard. */
export function homePathFor(profile: Pick<Profile, "role"> | null) {
  return roleKind(profile?.role) === "Receiver" ? "/admin" : "/";
}

export function useProfile() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (user: User) => {
    setProfile(await fetchProfile(user));
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setTimeout(() => void loadProfile(nextSession.user), 0);
      } else {
        setProfile(null);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadProfile]);

  const updateProfile = useCallback(
    async (values: Partial<Omit<Profile, "id">>) => {
      if (!session?.user) return;
      await supabase.from("profiles").update(values).eq("id", session.user.id);
      await loadProfile(session.user);
    },
    [session, loadProfile],
  );

  return { session, user: session?.user ?? null, profile, loading, updateProfile, reload: () => session?.user && loadProfile(session.user) };
}

export type Coords = { latitude: number; longitude: number };

/**
 * Keeps the signed-in user's own location on their profile. With no saved location it asks for
 * permission; with a saved one it re-reads the position when the browser already allows location
 * (no prompt) and saves it if the user is now more than 1 km away, so a location first saved from
 * another device doesn't stay wrong forever.
 */
export function useLocationSync(
  enabled: boolean,
  stored: Coords | null,
  save: (coords: Coords) => Promise<void> | void,
) {
  const hasStoredLocation = stored != null;
  const refreshed = useRef(false);
  const [status, setStatus] = useState<"idle" | "asking" | "granted" | "denied" | "unavailable" | "unsupported">("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus("granted");
        void save({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      // Permission refused vs. no position (GPS off, timeout): the profile explains each differently.
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [save]);

  useEffect(() => {
    if (!enabled || hasStoredLocation || status !== "idle") return;
    request();
  }, [enabled, hasStoredLocation, status, request]);

  useEffect(() => {
    if (!enabled || !stored || refreshed.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions) return;
    refreshed.current = true;
    const saved = { lat: stored.latitude, lon: stored.longitude };
    void navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            if (distanceKm(saved, { lat: next.latitude, lon: next.longitude }) > 1) void save(next);
          },
          () => undefined,
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stored?.latitude, stored?.longitude, save]);

  return { status, request };
}
