import { useCallback, useEffect, useState } from "react";

import type { NgoRegistration } from "@/integrations/mongodb/types";
import { getMyRegistration, saveMyRegistration } from "@/lib/account.functions";
import { errorMessage } from "@/lib/utils";

export type { NgoRegistration };

export type RegistrationInput = {
  organization_name: string;
  registration_80g: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  pincode: string;
};

/** The signed-in user's own partner registration; admin approval (admin.tsx) links it to a distribution center. */
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
    setRegistration(await getMyRegistration().catch(() => null));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const save = useCallback(
    async (input: RegistrationInput) => {
      if (!userId) return false;
      setSaving(true);
      setError(null);
      try {
        await saveMyRegistration({ data: input });
      } catch (saveError) {
        setError(errorMessage(saveError));
        return false;
      } finally {
        setSaving(false);
      }
      await load();
      return true;
    },
    [userId, load],
  );

  return { registration, loading, saving, error, save, reload: load };
}
