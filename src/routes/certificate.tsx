import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { CertificateDesign } from "@/components/certificate-design";
import { CertificatesSection } from "@/components/certificates";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight } from "@/hooks/use-stats";
import {
  CERTIFICATE_THRESHOLD_KG,
  loadMyCertificates,
  monthLabel,
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
    meta: [{ title: "Donor Certificate | FoodBridge" }, { name: "robots", content: "noindex" }],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Great+Vibes&display=swap",
      },
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
    void loadMyCertificates(user.id).then((all) => {
      if (cancelled) return;
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
      <div className="mx-auto flex max-w-[1123px] flex-wrap items-center justify-between gap-3 print:hidden">
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
          <div className="mx-auto mt-6 max-w-[1123px] print:mt-0">
            <CertificateDesign
              lang={lang}
              t={t}
              recipient={certificate.recipient_name}
              kg={formatWeight(certificate.total_kg)}
              month={monthLabel(certificate.month, lang)}
              donations={formatCount(certificate.donations)}
              people={formatCount(certificate.people_served)}
              issued={issued}
              certificateNo={certificate.certificate_no}
            />
          </div>
          <p className="mx-auto mt-4 max-w-4xl text-center text-xs leading-5 text-muted-foreground print:hidden">
            {t(
              "A certificate of appreciation based on completed donations recorded on FoodBridge. It is not a tax (80G) receipt.",
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
