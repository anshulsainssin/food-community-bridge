import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { getKitchenStats, type KitchenStats } from "@/lib/kitchen.functions";

export type { KitchenStats };

export const KITCHEN_STATS_QUERY_KEY = ["kitchen-stats"] as const;

/** How often "live" pages re-poll the server now that there's no Supabase realtime channel. */
export const LIVE_REFRESH_MS = 30_000;

const EMPTY_STATS: KitchenStats = {
  meals_cooked_today: 0,
  children_served_today: 0,
  active_kitchen_centers: 0,
  meals_cooked_this_month: 0,
  total_sponsorships_amount: 0,
  total_meals_sponsored: 0,
  low_stock_items: 0,
};

/** Live community kitchen totals — public data, no sign-in required. */
export function useKitchenStats() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KITCHEN_STATS_QUERY_KEY,
    queryFn: () => getKitchenStats(),
    refetchInterval: LIVE_REFRESH_MS,
  });
  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: KITCHEN_STATS_QUERY_KEY }),
    [queryClient],
  );

  return { stats: query.data ?? EMPTY_STATS, loading: query.isPending, reload };
}
