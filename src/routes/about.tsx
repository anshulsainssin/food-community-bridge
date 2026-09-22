import { createFileRoute } from "@tanstack/react-router";
import { Building2, HeartHandshake, UtensilsCrossed, Users } from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { formatCount } from "@/hooks/use-stats";

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

const steps = [
  { title: "Raw rations arrive daily", body: "Grains, pulses, vegetables, and cooking oil are tracked into the central kitchen's inventory every day." },
  { title: "2,200+ meals are cooked fresh", body: "The central kitchen prepares fresh cooked meals at scale, every single day, for children at partner schools and centers." },
  { title: "Meals reach every center", body: "Distribution is tracked live — meals cooked, children served, and active centers, visible to everyone." },
];

function AboutPage() {
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
        eyebrow="About / Our mission"
        title={<>Fresh meals, <span className="italic">every single day.</span></>}
        description="The Ratna Nidhi Central Kitchen & Daily Meal Project prepares 2,200+ fresh cooked meals daily for children, from raw ration through to delivery at partner schools and distribution centers."
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
          <h2 className="label-caps text-foreground">Impact so far</h2>
        </div>
        {loading ? (
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
