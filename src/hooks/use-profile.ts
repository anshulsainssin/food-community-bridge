import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { DEMO_ADMIN, DEMO_ADMIN_PROFILE, DEMO_PROFILE, DEMO_USER, type DemoRole, getDemoRole } from "@/lib/demo";

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

export function useProfile() {
  // Read once on mount — demo login/logout always does window.location.href so every mount
  // re-reads localStorage fresh, the same as a real OAuth redirect.
  const [demoRole] = useState<DemoRole | null>(() => (typeof window !== "undefined" ? getDemoRole() : null));
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!demoRole);

  const loadProfile = useCallback(
    async (userId: string) => {
      if (demoRole) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, organization, phone, email, location_label, latitude, longitude")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as Profile | null) ?? null);
    },
    [demoRole],
  );

  useEffect(() => {
    if (demoRole) return;
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setTimeout(() => void loadProfile(nextSession.user.id), 0);
      } else {
        setProfile(null);
      }
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, [loadProfile, demoRole]);

  const updateProfile = useCallback(
    async (values: Partial<Omit<Profile, "id">>) => {
      if (demoRole) return;
      if (!session?.user) return;
      await supabase.from("profiles").update(values).eq("id", session.user.id);
      await loadProfile(session.user.id);
    },
    [session, loadProfile, demoRole],
  );

  if (demoRole) {
    return {
      session: null,
      user: demoRole === "admin" ? DEMO_ADMIN : DEMO_USER,
      profile: demoRole === "admin" ? DEMO_ADMIN_PROFILE : DEMO_PROFILE,
      loading: false,
      updateProfile,
      reload: () => {},
    };
  }

  return {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    updateProfile,
    reload: () => session?.user && loadProfile(session.user.id),
  };
}

export type Coords = { latitude: number; longitude: number };

/** Asks the browser for location permission once a user is signed in and stores the coordinates on their profile. */
export function useLocationSync(
  enabled: boolean,
  hasStoredLocation: boolean,
  save: (coords: Coords) => Promise<void> | void,
) {
  const [status, setStatus] = useState<"idle" | "asking" | "granted" | "denied" | "unsupported">("idle");

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
      () => setStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [save]);

  useEffect(() => {
    if (!enabled || hasStoredLocation || status !== "idle") return;
    request();
  }, [enabled, hasStoredLocation, status, request]);

  return { status, request };
}
