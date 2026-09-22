import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, PackageOpen, UtensilsCrossed, Users } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { formatCount } from "@/hooks/use-stats";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ratna Nidhi Central Kitchen & Daily Meal Project" },
      { name: "description", content: "The Ratna Nidhi Central Kitchen prepares 2,200+ fresh cooked meals every day for children at partner schools and distribution centers. Sponsor a meal or track live kitchen operations." },
      { property: "og:title", content: "Ratna Nidhi Central Kitchen & Daily Meal Project" },
      { property: "og:description", content: "2,200+ fresh meals cooked daily for children. Sponsor a meal or view live kitchen inventory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { stats, loading } = useKitchenStats();
  const { language, t } = useLanguage();

  const locale = language === "hi" ? "hi-IN" : undefined;
  const today = new Date().toLocaleDateString(locale, { month: "long", day: "numeric" });

  const tiles = [
    { labelKey: "home.tile.mealsToday", value: formatCount(stats.meals_cooked_today), unitKey: "home.tile.mealsUnit", icon: UtensilsCrossed },
    { labelKey: "home.tile.children", value: formatCount(stats.children_served_today), unitKey: "home.tile.childrenUnit", icon: Users },
    { labelKey: "home.tile.centers", value: formatCount(stats.active_kitchen_centers), unitKey: "home.tile.centersUnit", icon: Building2 },
    { labelKey: "home.tile.sponsored", value: formatCount(stats.total_meals_sponsored), unitKey: "home.tile.allTime", icon: PackageOpen },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow={`${t("home.eyebrow")} · ${today}`}
        title={<>{t("home.titleMain")} <span className="italic">{t("home.titleEmphasis")}</span></>}
        description={t("home.description")}
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="wide"><Link to="/sponsor">{t("home.sponsorBtn")}</Link></Button>
            <Button asChild variant="outline" size="wide"><Link to="/inventory">{t("home.inventoryBtn")}</Link></Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 border-b border-border xl:grid-cols-4">
        {tiles.map(({ labelKey, value, unitKey, icon: Icon }, index) => (
          <article key={labelKey} className={`min-w-0 p-4 sm:p-7 ${index % 2 === 0 ? "border-r border-border" : ""} ${index < 2 ? "border-b border-border xl:border-b-0" : ""} ${index === 1 ? "xl:border-r" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{t(labelKey)}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-4 font-display text-3xl break-words sm:mt-5 sm:text-5xl">{loading ? "…" : value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{t(unitKey)}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-px bg-border sm:grid-cols-3">
        <article className="bg-background p-6 sm:p-8">
          <UtensilsCrossed className="size-5 text-accent" />
          <h2 className="mt-5 font-display text-2xl">{t("home.card.sponsor.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("home.card.sponsor.desc")}</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/sponsor">
              {t("home.card.sponsor.cta")} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>
        <article className="bg-background p-6 sm:p-8">
          <PackageOpen className="size-5 text-accent" />
          <h2 className="mt-5 font-display text-2xl">{t("home.card.inventory.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("home.card.inventory.desc")}</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/inventory">
              {t("home.card.inventory.cta")} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>
        <article className="bg-background p-6 sm:p-8">
          <Building2 className="size-5 text-accent" />
          <h2 className="mt-5 font-display text-2xl">{t("home.card.distribution.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("home.card.distribution.desc")}</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/distribution">
              {t("home.card.distribution.cta")} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>
      </section>
    </AppShell>
  );
}
