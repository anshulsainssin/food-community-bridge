import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lookupPincode } from "@/lib/geocode.functions";
import type { Tables } from "@/integrations/supabase/types";

export type NgoRegistration = Tables<"ngo_registrations">;

export type NgoAdminStats = {
  food_claimed_kg: number;
  meals_claimed: number;
  total_claims: number;
  active_distributions: number;
  pending_pickups: number;
  delivered: number;
  people_served: number;
  open_requests: number;
};

const EMPTY_STATS: NgoAdminStats = {
  food_claimed_kg: 0,
  meals_claimed: 0,
  total_claims: 0,
  active_distributions: 0,
  pending_pickups: 0,
  delivered: 0,
  people_served: 0,
  open_requests: 0,
};

function num(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type RegistrationInput = {
  organization_name: string;
  registration_80g: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  pincode: string;
};

/** The signed-in user's NGO registration record, with pincode-based location verification. */
export function useNgoRegistration(userId: string | null | undefined) {
  const [registration, setRegistration] = useState<NgoRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRegistration(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("ngo_registrations").select("*").eq("user_id", userId).maybeSingle();
    setRegistration((data as NgoRegistration | null) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const save = useCallback(
    async (input: RegistrationInput) => {
      if (!userId) return;
      setSaving(true);
      setError(null);

      let place: { label: string; latitude: number; longitude: number } | null = null;
      try {
        place = await lookupPincode({ data: { pincode: input.pincode } });
      } catch (lookupError) {
        console.error(lookupError);
      }

      const row = {
        user_id: userId,
        organization_name: input.organization_name,
        registration_80g: input.registration_80g,
        contact_person: input.contact_person,
        contact_phone: input.contact_phone,
        contact_email: input.contact_email || null,
        pincode: input.pincode,
        area_label: place?.label ?? null,
        latitude: place?.latitude ?? null,
        longitude: place?.longitude ?? null,
        status: place ? "Verified" : "Pending",
        verified_at: place ? new Date().toISOString() : null,
      };

      const { error: saveError } = await supabase.from("ngo_registrations").upsert(row, { onConflict: "user_id" });
      setSaving(false);
      if (saveError) {
        setError(saveError.message);
        return;
      }
      await load();
    },
    [userId, load],
  );

  return { registration, loading, saving, error, save, reload: load };
}

/** Live dashboard totals for the signed-in organization, calculated in the database. */
export function useNgoStats(enabled: boolean) {
  const [stats, setStats] = useState<NgoAdminStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) {
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("ngo_admin_stats");
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    setStats(
      row
        ? {
            food_claimed_kg: num(row["food_claimed_kg"]),
            meals_claimed: num(row["meals_claimed"]),
            total_claims: num(row["total_claims"]),
            active_distributions: num(row["active_distributions"]),
            pending_pickups: num(row["pending_pickups"]),
            delivered: num(row["delivered"]),
            people_served: num(row["people_served"]),
            open_requests: num(row["open_requests"]),
          }
        : EMPTY_STATS,
    );
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { stats, loading, reload: load };
}

/** Subscribes to donation changes so admin actions show up everywhere without a refresh. */
export function useDonationsRealtime(onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`donations-sync-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "donations" }, () => onChange())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
