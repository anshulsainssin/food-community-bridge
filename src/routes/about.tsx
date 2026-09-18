import { createFileRoute } from "@tanstack/react-router";
import { Check, HeartHandshake, PackageCheck, Users, UtensilsCrossed } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight, useNetworkStats } from "@/hooks/use-stats";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us | Food Waste Connect" },
      { name: "description", content: "How Food Waste Connect links surplus food donors with NGOs and volunteers, and the real impact of the network." },
      { property: "og:title", content: "About Us | Food Waste Connect" },
      { property: "og:description", content: "Our mission and the community impact so far." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const steps = [
  { title: "Donors share surplus food", body: "Restaurants, kitchens, and households post a donation with pickup details in minutes." },
  { title: "NGOs and volunteers claim it", body: "Nearby community partners see it on the map, claim it, and coordinate pickup directly with the donor." },
  { title: "Every step is tracked", body: "Claimed, pickup started, picked up, completed — both sides see the real status live, with notifications along the way." },
];

function AboutPage() {
  const { user } = useProfile();
  const { stats, loading } = useNetworkStats(Boolean(user));

  const tiles = [
    { label: "Food saved", value: formatWeight(stats.food_saved_kg), unit: "kg", icon: UtensilsCrossed },
    { label: "People fed", value: formatCount(stats.people_fed), unit: "people", icon: Users },
    { label: "Donations completed", value: formatCount(stats.donations_completed), unit: "donations", icon: Check },
    { label: "Pickups completed", value: formatCount(stats.pickups_completed), unit: "pickups", icon: PackageCheck },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow="About / Our mission"
        title={<>Rescuing food, <span className="italic">one pickup at a time.</span></>}
        description="Food Waste Connect is a community network that turns surplus food into meals instead of waste, by connecting donors directly with the NGOs and volunteers who can collect it."
      />

      <section className="grid border-b border-border md:grid-cols-3">
        {steps.map(({ title, body }, index) => (
          <article key={title} className={`min-w-0 p-4 sm:p-8 ${index < steps.length - 1 ? "border-b border-border md:border-b-0 md:border-r" : ""}`}>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{index + 1}</div>
            <h2 className="mt-5 font-display text-xl">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>

      <section className="border-b border-border px-4 py-8 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2">
          <HeartHandshake className="size-4 text-accent" />
          <h2 className="label-caps text-foreground">Network impact so far</h2>
        </div>
        {!user ? (
          <p className="mt-4 text-sm text-muted-foreground">Sign in to see real-time community impact numbers.</p>
        ) : loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading impact…</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {tiles.map(({ label, value, unit, icon: Icon }) => (
              <article key={label} className="min-w-0 bg-background p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="label-caps truncate text-muted-foreground">{label}</p>
                  <Icon className="size-4 shrink-0 text-accent" />
                </div>
                <p className="mt-3 font-display text-3xl break-words">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{unit}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
