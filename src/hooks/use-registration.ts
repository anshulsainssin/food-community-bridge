import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lookupLocation } from "@/lib/geocode.functions";
import type { Tables } from "@/integrations/supabase/types";

export type NgoRegistration = Tables<"ngo_registrations">;

export type RegistrationInput = {
  organization_name: string;
  registration_80g: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  pincode: string;
};

/**
 * The signed-in user's distribution-partner registration: organization name, 80G tax
 * certificate, contact info, and a pincode-verified location. Once an admin approves a
 * verified registration, it links to a real distribution_centers row (see use-kitchen
 * consumers in admin.tsx) — this hook only owns the applicant's own submission and status.
 */
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
        place = await lookupLocation({ data: { query: input.pincode } });
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
