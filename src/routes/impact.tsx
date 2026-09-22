import { createFileRoute } from "@tanstack/react-router";
import { Building2, HeartHandshake, PackageOpen, UtensilsCrossed, Users } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { formatCount } from "@/hooks/use-stats";
import { formatInr } from "@/lib/kitchen";

export const Route = createFileRoute("/impact")({
  head: () => ({
    meta: [
      { title: "Impact | Ratna Nidhi Central Kitchen" },
      { name: "description", content: "Meals cooked, children served, and sponsorships raised through the Ratna Nidhi Central Kitchen & Daily Meal Project." },
      { property: "og:title", content: "Impact | Ratna Nidhi Central Kitchen" },
      { property: "og:description", content: "Track meals cooked, children served, and sponsorship totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImpactPage,
});

function ImpactPage() {
  const { stats, loading } = useKitchenStats();

  const tiles = [
    { label: "Meals cooked today", value: formatCount(stats.meals_cooked_today), unit: "meals", icon: UtensilsCrossed },
    { label: "Children served today", value: formatCount(stats.children_served_today), unit: "children", icon: Users },
    { label: "Active kitchen centers", value: formatCount(stats.active_kitchen_centers), unit: "centers", icon: Building2 },
    { label: "Meals cooked this month", value: formatCount(stats.meals_cooked_this_month), unit: "meals", icon: HeartHandshake },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Impact / Kitchen totals"
        title={<>Every meal, <span className="italic">measured and tracked.</span></>}
        description="A live view of the meals cooked, children served, and sponsorships raised through the Ratna Nidhi Central Kitchen & Daily Meal Project."
      />
      <section className="grid grid-cols-2 border-b border-border xl:grid-cols-4">
        {tiles.map(({ label, value, unit, icon: Icon }, index) => (
          <article key={label} className={`min-w-0 p-4 sm:p-7 ${index % 2 === 0 ? "border-r border-border" : ""} ${index < 2 ? "border-b border-border xl:border-b-0" : ""} ${index === 1 ? "xl:border-r" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{label}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-4 font-display text-3xl break-words sm:mt-5 sm:text-5xl">{loading ? "…" : value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{unit}</p>
          </article>
        ))}
      </section>

      <section className="p-4 sm:p-8 lg:p-12">
        <div className="max-w-2xl border border-border-strong bg-card p-6">
          <div className="flex items-center gap-2 text-accent">
            <PackageOpen className="size-4" />
            <p className="label-caps">Sponsorships</p>
          </div>
          <p className="mt-4 font-display text-4xl">{loading ? "…" : formatInr(stats.total_sponsorships_amount)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            raised through {formatCount(stats.total_meals_sponsored)} meals sponsored so far.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
