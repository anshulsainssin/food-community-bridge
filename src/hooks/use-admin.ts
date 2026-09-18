import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/** Whether the signed-in user is in the admins allowlist. Not self-service — see migrations. */
export function useIsAdmin(userId: string | null | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    void supabase
      .from("admins")
      .select("id")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setIsAdmin(data != null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { isAdmin, loading };
}
