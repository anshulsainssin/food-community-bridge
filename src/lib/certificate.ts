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
