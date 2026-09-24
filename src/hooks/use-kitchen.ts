import { useCallback, useEffect, useId, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type KitchenStats = {
  meals_cooked_today: number;
  children_served_today: number;
  active_kitchen_centers: number;
  meals_cooked_this_month: number;
  total_sponsorships_amount: number;
  total_meals_sponsored: number;
  low_stock_items: number;
};

const EMPTY_STATS: KitchenStats = {
  meals_cooked_today: 0,
  children_served_today: 0,
  active_kitchen_centers: 0,
  meals_cooked_this_month: 0,
  total_sponsorships_amount: 0,
  total_meals_sponsored: 0,
  low_stock_items: 0,
};

function num(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(row: Record<string, unknown>): KitchenStats {
  return {
    meals_cooked_today: num(row["meals_cooked_today"]),
    children_served_today: num(row["children_served_today"]),
    active_kitchen_centers: num(row["active_kitchen_centers"]),
    meals_cooked_this_month: num(row["meals_cooked_this_month"]),
    total_sponsorships_amount: num(row["total_sponsorships_amount"]),
    total_meals_sponsored: num(row["total_meals_sponsored"]),
    low_stock_items: num(row["low_stock_items"]),
  };
}

/** Live community kitchen totals — public data, no sign-in required. */
export function useKitchenStats() {
  const [stats, setStats] = useState<KitchenStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  // Multiple call sites mount this hook at once (AppShell's sidebar plus the page itself), so
  // each instance needs its own realtime channel name — Supabase's client dedupes channels by
  // name, and a second `.on()` after another instance already `.subscribe()`d on the same name
  // throws.
  const instanceId = useId();

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("kitchen_dashboard_stats");
    const row = Array.isArray(data) ? data[0] : null;
    setStats(row ? normalize(row) : EMPTY_STATS);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`kitchen-stats-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_logs" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sponsorships" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "distribution_centers" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, instanceId]);

  return { stats, loading, reload: load };
}
