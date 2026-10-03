import { Link } from "@tanstack/react-router";
import { Award, Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatWeight } from "@/hooks/use-stats";
import { supabase } from "@/integrations/supabase/client";
import {
  CERTIFICATE_THRESHOLD_KG,
  monthKey,
  monthLabel,
  normalizeCertificates,
  type Certificate,
} from "@/lib/certificate";
import { useLanguage, useT } from "@/lib/i18n";

/**
 * Profile section: this month's progress towards the 100 kg certificate, and every certificate earned.
 */
export function CertificatesSection({ userId }: { userId: string }) {
  const t = useT();
  const lang = useLanguage();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [thisMonthKg, setThisMonthKg] = useState(0);
  const [loading, setLoading] = useState(true);
  const currentMonth = monthKey(new Date());

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const [certResult, recentResult] = await Promise.all([
      supabase.rpc("my_certificates"),
      supabase
        .from("donations")
        .select("weight_kg, completed_at")
        .eq("donor_id", userId)
        .eq("status", "Completed")
        .gte("completed_at", since),
    ]);
    setCertificates(normalizeCertificates(certResult.data as Record<string, unknown>[] | null));
    const recent =
      (recentResult.data as { weight_kg: number | null; completed_at: string | null }[] | null) ??
      [];
    setThisMonthKg(
      recent
        .filter((row) => row.completed_at && monthKey(row.completed_at) === currentMonth)
        .reduce((sum, row) => sum + Number(row.weight_kg ?? 0), 0),
    );
    setLoading(false);
  }, [userId, currentMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = Math.min(100, (thisMonthKg / CERTIFICATE_THRESHOLD_KG) * 100);
  const earnedThisMonth = certificates.some((item) => item.month.startsWith(currentMonth));

  return (
    <section className="border-t border-border px-4 py-6 sm:px-8 lg:px-10">
      <h2 className="label-caps flex items-center gap-2">
        <Award className="size-4 text-accent" />
        {t("Monthly donor certificate")}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {t(
          "Donate more than {kg} kg of food in a month (completed pickups with a recorded weight) to earn a certificate of appreciation for that month.",
          {
            kg: CERTIFICATE_THRESHOLD_KG,
          },
        )}
      </p>

      <div className="mt-4 max-w-xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
          <span className="min-w-0 break-words">
            {t("This month ({month})", { month: monthLabel(currentMonth, lang) })}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {loading ? "—" : `${formatWeight(thisMonthKg)} / ${CERTIFICATE_THRESHOLD_KG} kg`}
          </span>
        </div>
        <div className="mt-2 h-2 bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${loading ? 0 : progress}%` }}
          />
        </div>
        {!loading && !earnedThisMonth && (
          <p className="mt-2 text-xs text-muted-foreground">
            {thisMonthKg > CERTIFICATE_THRESHOLD_KG
              ? t("Certificate unlocked — refresh to see it.")
              : t("{kg} kg to go — the certificate unlocks once you pass {limit} kg this month.", {
                  kg: formatWeight(
                    Math.max(0, Math.round((CERTIFICATE_THRESHOLD_KG - thisMonthKg) * 10) / 10),
                  ),
                  limit: CERTIFICATE_THRESHOLD_KG,
                })}
          </p>
        )}
      </div>

      {!loading && certificates.length > 0 && (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {certificates.map((item) => (
            <li
              key={item.month}
              className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{monthLabel(item.month, lang)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("{kg} kg donated · {count} donations", {
                    kg: formatWeight(item.total_kg),
                    count: item.donations,
                  })}{" "}
                  · {item.certificate_no}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/certificate" search={{ month: item.month.slice(0, 7) }}>
                  <Download className="size-4" />
                  {t("View / download")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
