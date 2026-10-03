import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { CertificatesSection } from "@/components/certificates";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight } from "@/hooks/use-stats";
import { supabase } from "@/integrations/supabase/client";
import {
  CERTIFICATE_THRESHOLD_KG,
  monthLabel,
  normalizeCertificates,
  type Certificate,
} from "@/lib/certificate";
import { useLanguage, useT } from "@/lib/i18n";

type CertificateSearch = { month?: string };

export const Route = createFileRoute("/certificate")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): CertificateSearch =>
    typeof search["month"] === "string" && /^\d{4}-\d{2}$/.test(search["month"])
      ? { month: search["month"] }
      : {},
  head: () => ({
    meta: [
      { title: "Donor Certificate | Food Waste Connect" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CertificatePage,
});

/**
 * Printable certificate of appreciation for a month in which the signed-in donor donated more than
 * 100 kg. "Download" uses the browser's print dialog (Save as PDF).
 */
function CertificatePage() {
  const t = useT();
  const lang = useLanguage();
  const { month } = Route.useSearch();
  const { user, loading: loadingUser } = useProfile();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (loadingUser) return;
    if (!user || !month) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void supabase.rpc("my_certificates").then(({ data }) => {
      if (cancelled) return;
      const all = normalizeCertificates(data as Record<string, unknown>[] | null);
      setCertificate(all.find((item) => item.month.startsWith(month)) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, loadingUser, month]);

  // Opened from the menu (no month): this month's progress and every certificate earned.
  if (!month) {
    return (
      <AppShell>
        <PageIntro
          eyebrow="Donor / Certificates"
          title={<>{t("Your certificates")}</>}
          description="Donate more than 100 kg of food in a month and download a certificate of appreciation for that month."
        />
        {loadingUser ? (
          <p className="px-4 py-8 text-sm text-muted-foreground sm:px-8 lg:px-10">
            {t("Loading…")}
          </p>
        ) : user ? (
          <CertificatesSection userId={user.id} />
        ) : (
          <p className="px-4 py-8 text-sm text-muted-foreground sm:px-8 lg:px-10">
            {t("Sign in to see your certificate.")}{" "}
            <Link to="/auth" className="underline">
              {t("Sign in")}
            </Link>
          </p>
        )}
      </AppShell>
    );
  }

  const issued = new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground print:bg-white print:p-0 sm:px-8">
      <style>{"@media print { @page { size: A4 landscape; margin: 12mm; } }"}</style>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline">
          <Link to="/profile">
            <ArrowLeft className="size-4" />
            {t("Back to profile")}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {certificate && (
            <Button onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("Download / Print")}
            </Button>
          )}
        </div>
      </div>

      {loading || loadingUser ? (
        <p className="mx-auto mt-10 max-w-4xl text-sm text-muted-foreground">{t("Loading…")}</p>
      ) : !user ? (
        <p className="mx-auto mt-10 max-w-4xl text-sm text-muted-foreground">
          {t("Sign in to see your certificate.")}{" "}
          <Link to="/auth" className="underline">
            {t("Sign in")}
          </Link>
        </p>
      ) : !certificate ? (
        <p className="mx-auto mt-10 max-w-4xl text-sm text-muted-foreground">
          {t(
            "No certificate for this month. A certificate is earned by donating more than {kg} kg of food in a month.",
            {
              kg: CERTIFICATE_THRESHOLD_KG,
            },
          )}
        </p>
      ) : (
        <>
          <article
            lang={lang}
            className="mx-auto mt-6 max-w-4xl border-4 border-double border-primary bg-card p-6 text-center text-card-foreground print:mt-0 print:border-black print:bg-white print:text-black sm:p-12"
          >
            <div className="border border-border-strong px-4 py-8 print:border-black sm:px-10 sm:py-12">
              <p className="font-display text-2xl italic">Food Waste Connect</p>
              <img src="/logo-mark.png" alt="" width={96} height={96} className="mx-auto mt-6 size-20" />
              <h1 className="mt-4 font-display text-4xl sm:text-6xl">
                {t("Certificate of Appreciation")}
              </h1>
              <p className="mt-6 text-sm text-muted-foreground print:text-black">
                {t("This certificate is proudly presented to")}
              </p>
              <p className="mt-3 font-display text-3xl break-words italic sm:text-5xl">
                {certificate.recipient_name}
              </p>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7">
                {t(
                  "for donating {kg} kg of surplus food through Food Waste Connect in {month}, across {count} completed donations that served {people} people — helping reduce food waste in the community.",
                  {
                    kg: formatWeight(certificate.total_kg),
                    month: monthLabel(certificate.month, lang),
                    count: formatCount(certificate.donations),
                    people: formatCount(certificate.people_served),
                  },
                )}
              </p>
              <div className="mx-auto mt-10 grid max-w-2xl gap-6 text-sm sm:grid-cols-3">
                <div>
                  <p className="label-caps text-muted-foreground print:text-black">
                    {t("Food donated")}
                  </p>
                  <p className="mt-1 font-display text-2xl">
                    {formatWeight(certificate.total_kg)} kg
                  </p>
                </div>
                <div>
                  <p className="label-caps text-muted-foreground print:text-black">
                    {t("Issued on")}
                  </p>
                  <p className="mt-1">{issued}</p>
                </div>
                <div>
                  <p className="label-caps text-muted-foreground print:text-black">
                    {t("Certificate no.")}
                  </p>
                  <p className="mt-1 font-mono">{certificate.certificate_no}</p>
                </div>
              </div>
            </div>
          </article>
          <p className="mx-auto mt-4 max-w-4xl text-center text-xs leading-5 text-muted-foreground print:text-black">
            {t(
              "A certificate of appreciation based on completed donations recorded on Food Waste Connect. It is not a tax (80G) receipt.",
            )}
          </p>
          <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-muted-foreground print:hidden">
            {t('Tip: in the print window choose "Save as PDF" to download it.')}
          </p>
        </>
      )}
    </div>
  );
}
