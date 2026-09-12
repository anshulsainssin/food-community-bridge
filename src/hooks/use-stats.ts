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

/** Network-wide totals, calculated in the database. */
export function useNetworkStats(enabled: boolean) {
  const [stats, setStats] = useState<NetworkStats>(EMPTY_NETWORK);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) {
      setStats(EMPTY_NETWORK);
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("network_impact_stats");
    const row = Array.isArray(data) ? data[0] : null;
    setStats(row ? normalizeNetwork(row) : EMPTY_NETWORK);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { stats, loading, reload: load };
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
  };
}

export function formatCount(value: number) {
  return value.toLocaleString();
}

export function formatWeight(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
