import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type MyStats = {
  food_saved_kg: number;
  people_fed: number;
  active_donations: number;
  completed_pickups: number;
  meals_this_month: number;
};

export type NetworkStats = {
  food_saved_kg: number;
  people_fed: number;
  donations_completed: number;
  pickups_completed: number;
  total_donations: number;
  claimed_donations: number;
  on_time_pickups: number;
  active_donations: number;
};

const EMPTY_MINE: MyStats = {
  food_saved_kg: 0,
  people_fed: 0,
  active_donations: 0,
  completed_pickups: 0,
  meals_this_month: 0,
};

const EMPTY_NETWORK: NetworkStats = {
  food_saved_kg: 0,
  people_fed: 0,
  donations_completed: 0,
  pickups_completed: 0,
  total_donations: 0,
  claimed_donations: 0,
  on_time_pickups: 0,
  active_donations: 0,
};

/** Totals for the signed-in person, calculated in the database. Zeroes until they have records. */
export function useMyStats(userId: string | null | undefined) {
  const [stats, setStats] = useState<MyStats>(EMPTY_MINE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setStats(EMPTY_MINE);
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("my_dashboard_stats");
    const row = Array.isArray(data) ? data[0] : null;
    setStats(row ? normalizeMine(row) : EMPTY_MINE);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { stats, loading, reload: load };
}

/**
 * Network-wide totals, calculated in the database. Visitors who are not signed in get them too;
 * `available` is false when the database did not return them (so the page can show "—", not 0).
 */
export function useNetworkStats() {
  const [stats, setStats] = useState<NetworkStats>(EMPTY_NETWORK);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("network_impact_stats");
    const row = !error && Array.isArray(data) ? data[0] : null;
    setStats(row ? normalizeNetwork(row) : EMPTY_NETWORK);
    setAvailable(Boolean(row));
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { stats, available, loading, reload: load };
}

function num(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMine(row: Record<string, unknown>): MyStats {
  return {
    food_saved_kg: num(row["food_saved_kg"]),
    people_fed: num(row["people_fed"]),
    active_donations: num(row["active_donations"]),
    completed_pickups: num(row["completed_pickups"]),
    meals_this_month: num(row["meals_this_month"]),
  };
}

function normalizeNetwork(row: Record<string, unknown>): NetworkStats {
  return {
    food_saved_kg: num(row["food_saved_kg"]),
    people_fed: num(row["people_fed"]),
    donations_completed: num(row["donations_completed"]),
    pickups_completed: num(row["pickups_completed"]),
    total_donations: num(row["total_donations"]),
    claimed_donations: num(row["claimed_donations"]),
    on_time_pickups: num(row["on_time_pickups"]),
    active_donations: num(row["active_donations"]),
  };
}

export function formatCount(value: number) {
  return value.toLocaleString();
}

export function formatWeight(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export type PlatformImpact = {
  food_donated_kg: number;
  food_saved_kg: number;
  completed_pickups: number;
  verified_ngos: number;
  active_volunteers: number;
  waste_reduced_kg: number;
};

const EMPTY_PLATFORM: PlatformImpact = {
  food_donated_kg: 0,
  food_saved_kg: 0,
  completed_pickups: 0,
  verified_ngos: 0,
  active_volunteers: 0,
  waste_reduced_kg: 0,
};

function toNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Platform-wide impact totals (public, calculated live in the database). */
export function usePlatformImpact() {
  const [stats, setStats] = useState<PlatformImpact>(EMPTY_PLATFORM);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("platform_impact_stats");
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    setAvailable(!error && row != null);
    setStats(
      row
        ? {
            food_donated_kg: toNumber(row["food_donated_kg"]),
            food_saved_kg: toNumber(row["food_saved_kg"]),
            completed_pickups: toNumber(row["completed_pickups"]),
            verified_ngos: toNumber(row["verified_ngos"]),
            active_volunteers: toNumber(row["active_volunteers"]),
            waste_reduced_kg: toNumber(row["waste_reduced_kg"]),
          }
        : EMPTY_PLATFORM,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, available, loading, reload: load };
}

export type LeaderboardRow = {
  board: "donors" | "volunteers";
  rank: number;
  display_name: string;
  completed: number;
  food_kg: number;
  people_served: number;
  is_me: boolean;
};

/** Top 5 donors and top 5 volunteers by completed donations / pickups (live from the database). */
export function useLeaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("leaderboard");
    setRows(
      ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
        board: row["board"] === "volunteers" ? "volunteers" : "donors",
        rank: toNumber(row["rank"]),
        display_name: String(row["display_name"] ?? ""),
        completed: toNumber(row["completed"]),
        food_kg: toNumber(row["food_kg"]),
        people_served: toNumber(row["people_served"]),
        is_me: row["is_me"] === true,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, reload: load };
}
