import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, PackageOpen, UtensilsCrossed, Users } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { formatCount } from "@/hooks/use-stats";

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

  const today = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });

  const tiles = [
    { label: "Meals cooked today", value: formatCount(stats.meals_cooked_today), unit: "meals", icon: UtensilsCrossed },
    { label: "Beneficiary children served", value: formatCount(stats.children_served_today), unit: "children", icon: Users },
    { label: "Active kitchen centers", value: formatCount(stats.active_kitchen_centers), unit: "centers", icon: Building2 },
    { label: "Meals sponsored", value: formatCount(stats.total_meals_sponsored), unit: "all time", icon: PackageOpen },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow={`Ratna Nidhi Central Kitchen · ${today}`}
        title={<>Ratna Nidhi Central Kitchen <span className="italic">&amp; Daily Meal Project.</span></>}
        description="Preparing 2,200+ fresh cooked meals every single day for children at partner schools and distribution centers — raw ration to plate, tracked live."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="wide"><Link to="/sponsor">Sponsor a Meal</Link></Button>
            <Button asChild variant="outline" size="wide"><Link to="/inventory">Live Kitchen Inventory</Link></Button>
          </div>
        }
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

      <section className="grid gap-px bg-border sm:grid-cols-3">
        <article className="bg-background p-6 sm:p-8">
          <UtensilsCrossed className="size-5 text-accent" />
          <h2 className="mt-5 font-display text-2xl">Sponsor a Meal</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">₹500 sponsors 50 fresh cooked meals. Track your sponsorship and get a dynamic impact certificate.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/sponsor">
              Sponsor now <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>
        <article className="bg-background p-6 sm:p-8">
          <PackageOpen className="size-5 text-accent" />
          <h2 className="mt-5 font-display text-2xl">Live Kitchen Inventory</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Daily raw ration stock — grains, pulses, vegetables, and cooking oil — with automatic re-order alerts.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/inventory">
              View inventory <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>
        <article className="bg-background p-6 sm:p-8">
          <Building2 className="size-5 text-accent" />
          <h2 className="mt-5 font-display text-2xl">Distribution Tracker</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">See every school and center receiving meals today, live on the map.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/distribution">
              Track distribution <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>
      </section>
    </AppShell>
  );
}
