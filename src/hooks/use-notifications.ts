import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { LIVE_REFRESH_MS } from "@/hooks/use-kitchen";
import type { NotificationRow } from "@/integrations/mongodb/types";
import { listNotifications, markNotificationsRead } from "@/lib/account.functions";
import { playNotificationSound } from "@/lib/notification-sound";

export type Notification = NotificationRow;

export function useNotifications(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["notifications", userId ?? null] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => listNotifications(),
    enabled: Boolean(userId),
    refetchInterval: LIVE_REFRESH_MS,
  });
  const items = userId ? (query.data ?? []) : [];

  // Chime when a poll brings in a notification newer than anything seen so far (not on first load).
  const newestSeen = useRef<string | null>(null);
  const newest = items[0]?.created_at ?? null;
  useEffect(() => {
    if (newest && newestSeen.current && newest > newestSeen.current) playNotificationSound();
    if (newest) newestSeen.current = newest;
  }, [newest]);

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    [queryClient],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await markNotificationsRead();
    await reload();
  }, [userId, reload]);

  return {
    items,
    loading: Boolean(userId) && query.isPending,
    unread: items.filter((item) => !item.read).length,
    reload,
    markAllRead,
  };
}
