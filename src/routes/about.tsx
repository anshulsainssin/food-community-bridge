import { createFileRoute } from "@tanstack/react-router";
import { Building2, HeartHandshake, UtensilsCrossed, Users } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { formatCount } from "@/hooks/use-stats";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us | Ratna Nidhi Central Kitchen" },
      { name: "description", content: "How the Ratna Nidhi Central Kitchen prepares and delivers 2,200+ fresh cooked meals daily for children, and the impact so far." },
      { property: "og:title", content: "About Us | Ratna Nidhi Central Kitchen" },
      { property: "og:description", content: "Our mission and the community impact so far." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { stats, loading } = useKitchenStats();
  const { t } = useLanguage();

  const steps = [
    { titleKey: "about.step1.title", bodyKey: "about.step1.body" },
    { titleKey: "about.step2.title", bodyKey: "about.step2.body" },
    { titleKey: "about.step3.title", bodyKey: "about.step3.body" },
  ];

  const tiles = [
    { labelKey: "about.tile.mealsToday", value: formatCount(stats.meals_cooked_today), unitKey: "about.unit.meals", icon: UtensilsCrossed },
    { labelKey: "about.tile.childrenToday", value: formatCount(stats.children_served_today), unitKey: "about.unit.children", icon: Users },
    { labelKey: "about.tile.centers", value: formatCount(stats.active_kitchen_centers), unitKey: "about.unit.centers", icon: Building2 },
    { labelKey: "about.tile.mealsMonth", value: formatCount(stats.meals_cooked_this_month), unitKey: "about.unit.meals", icon: HeartHandshake },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow={t("about.eyebrow")}
        title={<>{t("about.titleMain")} <span className="italic">{t("about.titleEmphasis")}</span></>}
        description={t("about.description")}
      />

      <section className="grid border-b border-border md:grid-cols-3">
        {steps.map(({ titleKey, bodyKey }, index) => (
          <article key={titleKey} className={`min-w-0 p-4 sm:p-8 ${index < steps.length - 1 ? "border-b border-border md:border-b-0 md:border-r" : ""}`}>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{index + 1}</div>
            <h2 className="mt-5 font-display text-xl">{t(titleKey)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(bodyKey)}</p>
          </article>
        ))}
      </section>

      <section className="border-b border-border px-4 py-8 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2">
          <HeartHandshake className="size-4 text-accent" />
          <h2 className="label-caps text-foreground">{t("about.impactSoFar")}</h2>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("about.loadingImpact")}</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {tiles.map(({ labelKey, value, unitKey, icon: Icon }) => (
              <article key={labelKey} className="min-w-0 bg-background p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="label-caps truncate text-muted-foreground">{t(labelKey)}</p>
                  <Icon className="size-4 shrink-0 text-accent" />
                </div>
                <p className="mt-3 font-display text-3xl break-words">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t(unitKey)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
