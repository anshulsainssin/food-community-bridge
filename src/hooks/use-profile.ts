import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import type { Profile } from "@/integrations/mongodb/types";
import { getAccount, updateProfile as updateProfileFn } from "@/lib/account.functions";
import {
  DEMO_ADMIN,
  DEMO_ADMIN_PROFILE,
  DEMO_PROFILE,
  DEMO_USER,
  type DemoRole,
  getDemoRole,
} from "@/lib/demo";

export type { Profile };

export const ACCOUNT_QUERY_KEY = ["account"] as const;

/** Shared, cached session lookup — AppShell and the page both call this without refetching twice. */
export function useAccount() {
  return useQuery({ queryKey: ACCOUNT_QUERY_KEY, queryFn: () => getAccount(), staleTime: 60_000 });
}

export function useProfile() {
  // Read once on mount — demo login/logout always does window.location.href so every mount
  // re-reads localStorage fresh, the same as a real sign-in.
  const [demoRole] = useState<DemoRole | null>(() =>
    typeof window !== "undefined" ? getDemoRole() : null,
  );
  const queryClient = useQueryClient();
  const account = useAccount();

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
    [queryClient],
  );

  const updateProfile = useCallback(
    async (values: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>) => {
      if (demoRole || !account.data) return;
      await updateProfileFn({ data: values });
      await reload();
    },
    [demoRole, account.data, reload],
  );

  if (demoRole) {
    return {
      user: demoRole === "admin" ? DEMO_ADMIN : DEMO_USER,
      profile: demoRole === "admin" ? DEMO_ADMIN_PROFILE : DEMO_PROFILE,
      loading: false,
      updateProfile,
      reload: () => {},
    };
  }

  return {
    user: account.data?.user ?? null,
    profile: account.data?.profile ?? null,
    loading: account.isPending,
    updateProfile,
    reload,
  };
}

export type Coords = { latitude: number; longitude: number };

/** Asks the browser for location permission once a user is signed in and stores the coordinates on their profile. */
export function useLocationSync(
  enabled: boolean,
  hasStoredLocation: boolean,
  save: (coords: Coords) => Promise<void> | void,
) {
  const [status, setStatus] = useState<"idle" | "asking" | "granted" | "denied" | "unsupported">(
    "idle",
  );

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
