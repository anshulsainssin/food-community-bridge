import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError } from "@/lib/food-details";
import type { Lang } from "@/lib/i18n";

/** A donor earns the month's certificate with more than this many kg of completed donations. */
export const CERTIFICATE_THRESHOLD_KG = 100;

const TIME_ZONE = "Asia/Kolkata";

export type Certificate = {
  month: string; // first day of the month, "YYYY-MM-DD"
  total_kg: number;
  donations: number;
  people_served: number;
  certificate_no: string;
  recipient_name: string;
};

/** "2026-10" for a timestamp, in India time (matches the database). */
export function monthKey(date: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(typeof date === "string" ? new Date(date) : date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

/** "October 2026" / "अक्टूबर 2026" for "2026-10" or "2026-10-01". */
export function monthLabel(key: string, lang: Lang = "en") {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString(
    lang === "hi" ? "hi-IN" : "en-IN",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}

export function toNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeCertificates(rows: Record<string, unknown>[] | null): Certificate[] {
  return (rows ?? []).map((row) => ({
    month: String(row["month"] ?? ""),
    total_kg: toNumber(row["total_kg"]),
    donations: toNumber(row["donations"]),
    people_served: toNumber(row["people_served"]),
    certificate_no: String(row["certificate_no"] ?? ""),
    recipient_name: String(row["recipient_name"] ?? ""),
  }));
}

/**
 * The signed-in donor's certificates, newest month first. Uses the my_certificates database function;
 * if that hasn't been added to the database yet, works the same months out from the donor's own
 * completed donations so certificates still show.
 */
export async function loadMyCertificates(userId: string): Promise<Certificate[]> {
  const { data, error } = await supabase.rpc("my_certificates");
  if (!error) return normalizeCertificates(data as Record<string, unknown>[] | null);
  if (!isMissingSchemaError(error)) return [];

  const [donationsResult, profileResult] = await Promise.all([
    supabase
      .from("donations")
      .select("weight_kg, servings, completed_at")
      .eq("donor_id", userId)
      .eq("status", "Completed")
      .not("completed_at", "is", null)
      .limit(5000),
    supabase.from("profiles").select("full_name, organization").eq("id", userId).maybeSingle(),
  ]);
  const rows =
    (donationsResult.data as
      | { weight_kg: number | null; servings: number | null; completed_at: string | null }[]
      | null) ?? [];
  const months = new Map<string, { kg: number; donations: number; people: number }>();
  for (const row of rows) {
    if (!row.completed_at) continue;
    const key = monthKey(row.completed_at);
    const month = months.get(key) ?? { kg: 0, donations: 0, people: 0 };
    month.kg += toNumber(row.weight_kg);
    month.donations += 1;
    month.people += toNumber(row.servings);
    months.set(key, month);
  }
  const profile = profileResult.data as {
    full_name: string | null;
    organization: string | null;
  } | null;
  const recipient = profile?.organization?.trim() || profile?.full_name?.trim() || "Food donor";
  const idPart = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return [...months.entries()]
    .filter(([, month]) => month.kg > CERTIFICATE_THRESHOLD_KG)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, month]) => ({
      month: `${key}-01`,
      total_kg: Math.round(month.kg * 100) / 100,
      donations: month.donations,
      people_served: month.people,
      certificate_no: `FWC-${key.replace("-", "")}-${idPart}`,
      recipient_name: recipient,
    }));
}
