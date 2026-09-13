import { createFileRoute } from "@tanstack/react-router";
import { Check, PackageCheck, Users, UtensilsCrossed } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight, useNetworkStats } from "@/hooks/use-stats";

export const Route = createFileRoute("/impact")({
  head: () => ({ meta: [
    { title: "Community Impact | Food Waste Connect" },
    { name: "description", content: "See food rescue and community meal impact totals." },
    { property: "og:title", content: "Community Impact | Food Waste Connect" },
    { property: "og:description", content: "Track food saved, people fed, and completed pickups." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ImpactPage,
});

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function ImpactPage() {
  const { user } = useProfile();
  const { stats, loading } = useNetworkStats(Boolean(user));

  const tiles = [
    { label: "Total food saved", value: formatWeight(stats.food_saved_kg), unit: "kg", icon: UtensilsCrossed },
    { label: "People fed", value: formatCount(stats.people_fed), unit: "people", icon: Users },
    { label: "Donations completed", value: formatCount(stats.donations_completed), unit: "donations", icon: Check },
    { label: "Pickups completed", value: formatCount(stats.pickups_completed), unit: "pickups", icon: PackageCheck },
  ];

  const progress = [
    {
      label: "Donations matched with a receiver",
      value: percent(stats.claimed_donations, stats.total_donations),
      detail: `${formatCount(stats.claimed_donations)} of ${formatCount(stats.total_donations)}`,
    },
    {
      label: "Matched donations completed",
      value: percent(stats.donations_completed, stats.claimed_donations),
      detail: `${formatCount(stats.donations_completed)} of ${formatCount(stats.claimed_donations)}`,
    },
    {
      label: "Collected before the deadline",
      value: percent(stats.on_time_pickups, stats.donations_completed),
      detail: `${formatCount(stats.on_time_pickups)} of ${formatCount(stats.donations_completed)}`,
    },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Impact / Network totals"
        title={<>Shared effort, <span className="italic">measurable change.</span></>}
        description="A simple view of the food rescued and community support delivered through the network."
      />
      <section className="grid grid-cols-2 border-b border-border xl:grid-cols-4">
        {tiles.map(({ label, value, unit, icon: Icon }, index) => (
          <article key={label} className={`min-w-0 p-4 sm:p-7 ${index % 2 === 0 ? "border-r border-border" : ""} ${index < 2 ? "border-b border-border xl:border-b-0" : ""} ${index === 1 ? "xl:border-r" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{label}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-4 font-display text-3xl break-words sm:mt-5 sm:text-5xl">{value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{unit}</p>
          </article>
        ))}
      </section>

      <section className="p-4 sm:p-8 lg:p-12">
        <div className="max-w-4xl">
          <h2 className="font-display text-3xl italic">Progress</h2>
          {!user ? (
            <p className="mt-8 text-sm text-muted-foreground">Sign in to see community progress.</p>
          ) : loading ? (
            <p className="mt-8 text-sm text-muted-foreground">Loading impact…</p>
          ) : stats.total_donations === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">No donations recorded yet, so there is nothing to measure.</p>
          ) : (
            <div className="mt-8 space-y-8">
              {progress.map((item) => (
                <div key={item.label}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">{item.label}</span>
                    <span className="shrink-0 text-muted-foreground">{item.detail}</span>
                  </div>

                  <div className="mt-3 h-2 bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
