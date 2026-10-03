import { createFileRoute } from "@tanstack/react-router";
import { Award, BadgeCheck, HandHeart, Leaf, PackageCheck, PackageOpen, Truck, Users, UtensilsCrossed } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight, useLeaderboard, useNetworkStats, usePlatformImpact, type LeaderboardRow } from "@/hooks/use-stats";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/impact")({
  head: () => ({ meta: [
    { title: "Community Impact | FoodBridge" },
    { name: "description", content: "See food rescue and community meal impact totals." },
    { property: "og:title", content: "Community Impact | FoodBridge" },
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
  const { stats, available, loading } = useNetworkStats();
  const t = useT();

  // Real totals for everyone, signed in or not; a dash only if the database didn't return them.
  const shown = (value: string) => (available ? value : "—");
  const tiles = [
    { label: "Total food saved", value: shown(formatWeight(stats.food_saved_kg)), unit: "kg", icon: UtensilsCrossed },
    { label: "People fed", value: shown(formatCount(stats.people_fed)), unit: "people served", icon: Users },
    { label: "Active donations", value: shown(formatCount(stats.active_donations)), unit: "not yet completed", icon: PackageOpen },
    { label: "Pickups completed", value: shown(formatCount(stats.pickups_completed)), unit: "pickups", icon: PackageCheck },
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
        title={<>{t("Shared effort,")} <span className="italic">{t("measurable change.")}</span></>}
        description="A simple view of the food rescued and community support delivered through the network."
      />
      <section className="grid grid-cols-2 border-b border-border xl:grid-cols-4">
        {tiles.map(({ label, value, unit, icon: Icon }, index) => (
          <article key={label} className={`min-w-0 p-4 sm:p-7 ${index % 2 === 0 ? "border-r border-border" : ""} ${index < 2 ? "border-b border-border xl:border-b-0" : ""} ${index === 1 ? "xl:border-r" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{t(label)}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-4 font-display text-3xl break-words sm:mt-5 sm:text-5xl">{value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{t(unit)}</p>
          </article>
        ))}
      </section>

      <section className="p-4 sm:p-8 lg:p-12">
        <div className="max-w-4xl">
          <h2 className="font-display text-3xl italic">{t("Progress")}</h2>
          {loading ? (
            <p className="mt-8 text-sm text-muted-foreground">{t("Loading impact…")}</p>
          ) : !available ? (
            <p className="mt-8 text-sm text-muted-foreground">{t("Impact figures aren't available right now.")}</p>
          ) : stats.total_donations === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">{t("No donations recorded yet, so there is nothing to measure.")}</p>
          ) : (
            <div className="mt-8 space-y-8">
              {progress.map((item) => (
                <div key={item.label}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">{t(item.label)}</span>
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

      <PlatformImpactSection />
      <LeaderboardSection />
    </AppShell>
  );
}

/** Platform-wide totals, calculated live from the database (nothing hardcoded). */
function PlatformImpactSection() {
  const t = useT();
  const { stats, available, loading } = usePlatformImpact();
  const shown = (value: string) => (loading ? "…" : available ? value : "—");
  const tiles = [
    { label: "Total food donated", value: shown(formatWeight(stats.food_donated_kg)), unit: "kg · all donations with a recorded weight", icon: HandHeart },
    { label: "Total food saved", value: shown(formatWeight(stats.food_saved_kg)), unit: "kg · completed pickups", icon: UtensilsCrossed },
    { label: "Total completed pickups", value: shown(formatCount(stats.completed_pickups)), unit: "pickups", icon: Truck },
    { label: "Total verified NGOs", value: shown(formatCount(stats.verified_ngos)), unit: "verified by admins", icon: BadgeCheck },
    { label: "Total active volunteers", value: shown(formatCount(stats.active_volunteers)), unit: "claimed a pickup in the last 30 days", icon: Users },
    { label: "Estimated food waste reduced", value: shown(formatWeight(stats.waste_reduced_kg)), unit: "kg · estimate (0.4 kg per person served when no weight was recorded)", icon: Leaf },
  ];
  return (
    <>
      <section className="border-t border-border px-4 pt-8 sm:px-8 lg:px-12">
        <h2 className="font-display text-3xl italic">{t("Platform impact")}</h2>
      </section>
      <section className="mt-6 grid grid-cols-2 gap-px border-y border-border bg-border xl:grid-cols-3">
        {tiles.map(({ label, value, unit, icon: Icon }) => (
          <article key={label} className="min-w-0 bg-background p-4 sm:p-7">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{t(label)}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-4 font-display text-3xl break-words sm:mt-5 sm:text-5xl">{value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(unit)}</p>
          </article>
        ))}
      </section>
    </>
  );
}

/** Top 5 donors and top 5 volunteers by completed donations / pickups. */
function LeaderboardSection() {
  const t = useT();
  const { rows, loading } = useLeaderboard();
  const boards = [
    { key: "donors" as const, title: "Top 5 donors", badge: "Top Donor", unit: "completed donations", icon: Award },
    { key: "volunteers" as const, title: "Top 5 volunteers", badge: "Top Volunteer", unit: "completed pickups", icon: Truck },
  ];
  return (
    <section className="p-4 sm:p-8 lg:p-12">
      <h2 className="font-display text-3xl italic">{t("Leaderboard")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("Ranked by completed donations and pickups. Updates automatically.")}</p>
      <div className="mt-6 grid gap-px border border-border bg-border lg:grid-cols-2">
        {boards.map(({ key, title, badge, unit, icon: Icon }) => {
          const list = rows.filter((row) => row.board === key);
          return (
            <div key={key} className="min-w-0 bg-background p-4 sm:p-6">
              <h3 className="label-caps flex items-center gap-2">
                <Icon className="size-4 text-accent" />
                {t(title)}
              </h3>
              {loading ? (
                <p className="mt-4 text-sm text-muted-foreground">{t("Loading…")}</p>
              ) : list.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">{t("No completed pickups yet — the leaderboard fills up as food is delivered.")}</p>
              ) : (
                <ol className="mt-4 divide-y divide-border">
                  {list.map((row: LeaderboardRow) => (
                    <li key={`${key}-${row.rank}`} className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3 ${row.is_me ? "font-medium" : ""}`}>
                      <span className="font-display text-2xl text-accent">{row.rank}</span>
                      <span className="min-w-0">
                        <span className="block truncate">
                          {row.display_name}
                          {row.is_me ? ` (${t("you")})` : ""}
                        </span>
                        <span className="label-caps text-muted-foreground">{t(badge)}</span>
                      </span>
                      <span className="text-right text-xs text-muted-foreground">
                        {formatCount(row.completed)} {t(unit)}
                        {row.food_kg > 0 ? <><br />{formatWeight(row.food_kg)} kg</> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {t("Badges: Top Donor / Top Volunteer for the top 5, and Zero Food Waste Champion for donors with 5+ completed donations and none expired. See yours on your profile.")}
      </p>
    </section>
  );
}
