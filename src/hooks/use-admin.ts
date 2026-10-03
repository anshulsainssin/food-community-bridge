import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/** Whether the signed-in user is a platform admin (user_roles table, checked in the database). */
export function useIsAdmin(userId: string | null | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    void supabase.rpc("is_platform_admin").then(({ data, error }) => {
      if (cancelled) return;
      setIsAdmin(!error && data === true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAdmin, loading };
}
