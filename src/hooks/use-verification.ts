import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type VolunteerVerification = Tables<"volunteer_verifications">;

export type VerificationState = {
  /** Verified NGO registration or verified volunteer profile: may claim food. */
  verified: boolean;
  ngoStatus: string | null;
  volunteerStatus: string | null;
  suspended: boolean;
};

const EMPTY: VerificationState = {
  verified: false,
  ngoStatus: null,
  volunteerStatus: null,
  suspended: false,
};

/** The signed-in user's verification and suspension status (their own rows only). */
export function useMyVerification(userId: string | null | undefined) {
  const [state, setState] = useState<VerificationState>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setState(EMPTY);
      setLoading(false);
      return;
    }
    const [ngo, volunteer, suspension] = await Promise.all([
      supabase.from("ngo_registrations").select("status").eq("user_id", userId).maybeSingle(),
      supabase.from("volunteer_verifications").select("status").eq("user_id", userId).maybeSingle(),
      supabase.from("user_suspensions").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    const ngoStatus = (ngo.data as { status: string } | null)?.status ?? null;
    const volunteerStatus = (volunteer.data as { status: string } | null)?.status ?? null;
    setState({
      verified: ngoStatus === "Verified" || volunteerStatus === "Verified",
      ngoStatus,
      volunteerStatus,
      suspended: Boolean(suspension.data),
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { ...state, loading, reload: load };
}

/** The volunteer's own verification record, with save (status is always set by the database). */
export function useVolunteerVerification(userId: string | null | undefined) {
  const [record, setRecord] = useState<VolunteerVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRecord(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("volunteer_verifications")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setRecord((data as VolunteerVerification | null) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const save = useCallback(
    async (
      values: Pick<
        VolunteerVerification,
        "full_name" | "contact_phone" | "area" | "pincode" | "id_type" | "id_last4"
      >,
      file: File | null,
    ) => {
      if (!userId) return false;
      setSaving(true);
      setError(null);
      let document: { path: string; name: string } | null = null;
      if (file) {
        const uploaded = await uploadVerificationDocument(userId, "volunteer-id", file);
        if ("error" in uploaded) {
          setSaving(false);
          setError(uploaded.error);
          return false;
        }
        document = uploaded;
      }
      const { error: saveError } = await supabase.from("volunteer_verifications").upsert(
        {
          user_id: userId,
          ...values,
          ...(document ? { document_path: document.path, document_name: document.name } : {}),
        },
        { onConflict: "user_id" },
      );
      setSaving(false);
      if (saveError) {
        setError(saveError.message);
        return false;
      }
      await load();
      return true;
    },
    [userId, load],
  );

  return { record, loading, saving, error, save, reload: load };
}

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Uploads a verification document to the private "verification-docs" bucket, under the user's own
 * folder. Returns the storage path (never a public URL).
 */
export async function uploadVerificationDocument(
  userId: string,
  kind: "volunteer-id" | "ngo-certificate",
  file: File,
): Promise<{ path: string; name: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) return { error: "Upload a PDF, JPG, PNG or WEBP file." };
  if (file.size > MAX_BYTES) return { error: "The document must be 5 MB or smaller." };
  const extension = file.name.includes(".")
    ? file.name
        .split(".")
        .pop()!
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
    : "bin";
  const path = `${userId}/${kind}-${Date.now()}.${extension || "bin"}`;
  const { error } = await supabase.storage.from("verification-docs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: error.message };
  return { path, name: file.name.slice(0, 120) };
}
