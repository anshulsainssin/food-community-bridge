import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CalendarClock,
  HandHeart,
  MapPin,
  PackageCheck,
  Scale,
  Truck,
  Users,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useDonationsRealtime } from "@/hooks/use-ngo";
import { useNow } from "@/hooks/use-now";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight } from "@/hooks/use-stats";
import { supabase } from "@/integrations/supabase/client";
import { displayStatus } from "@/lib/donation-status";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History | Food Waste Connect" },
      {
        name: "description",
        content: "Every donation you posted or claimed, with its status and pickup dates.",
      },
      { property: "og:title", content: "History | Food Waste Connect" },
      { property: "og:description", content: "Your past and current food donations and pickups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

type Donation = Tables<"donations">;

const ROLE_TABS = ["All", "Donated", "Claimed"] as const;
const STATUS_FILTERS = ["All", "Active", "Completed", "Expired"] as const;
type RoleTab = (typeof ROLE_TABS)[number];
type StatusFilter = (typeof STATUS_FILTERS)[number];

function formatMoment(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function HistoryPage() {
  const { user, loading: loadingUser } = useProfile();
  const [rows, setRows] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleTab, setRoleTab] = useState<RoleTab>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const now = useNow();

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("donations")
      .select("*")
      .or(`donor_id.eq.${user.id},claimed_by.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data as Donation[] | null) ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (loadingUser) return;
    void load();
  }, [load, loadingUser]);

  useDonationsRealtime(() => void load());

  const withStatus = useMemo(
    () =>
      rows.map((row) => {
        const status = displayStatus(row, now);
        return {
          row,
          status,
          donated: row.donor_id === user?.id,
          claimed: row.claimed_by === user?.id,
        };
      }),
    [rows, now, user?.id],
  );

  const visible = withStatus.filter(({ status, donated, claimed }) => {
    if (roleTab === "Donated" && !donated) return false;
    if (roleTab === "Claimed" && !claimed) return false;
    if (statusFilter === "Active") return status !== "Completed" && status !== "Expired";
    if (statusFilter === "Completed") return status === "Completed";
    if (statusFilter === "Expired") return status === "Expired";
    return true;
  });

  const completed = withStatus.filter((item) => item.status === "Completed");
  const totals = {
    all: withStatus.length,
    completed: completed.length,
    kg: completed.reduce((sum, item) => sum + (item.row.weight_kg ?? 0), 0),
    people: completed.reduce((sum, item) => sum + (item.row.servings ?? 0), 0),
  };

  // Group the list by the month the donation was posted.
  const groups: { month: string; items: typeof visible }[] = [];
  for (const item of visible) {
    const month = monthLabel(item.row.created_at);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }

  if (!loadingUser && !user) {
    return (
      <AppShell>
        <PageIntro
          eyebrow="History"
          title={
            <>
              Your <span className="italic">history.</span>
            </>
          }
          description="Sign in to see every donation you posted or claimed."
          action={
            <Button asChild size="wide">
              <Link to="/auth">Sign in</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const tiles = [
    { label: "Donations & pickups", value: formatCount(totals.all), icon: HandHeart },
    { label: "Completed", value: formatCount(totals.completed), icon: PackageCheck },
    { label: "Food saved", value: `${formatWeight(totals.kg)} kg`, icon: Scale },
    { label: "People served", value: formatCount(totals.people), icon: Users },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow="History / All activity"
        title={
          <>
            Everything you've <span className="italic">shared and collected.</span>
          </>
        }
        description="Every donation you posted and every donation you claimed, newest first. Open one to see its full details and pickup timeline."
      />

      <section className="grid grid-cols-2 gap-px border-b border-border bg-border xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <article key={label} className="min-w-0 bg-background p-4 sm:p-7">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{label}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-4 font-display text-3xl sm:text-4xl">{loading ? "—" : value}</p>
          </article>
        ))}
      </section>

      <section className="space-y-3 border-b border-border px-4 py-4 sm:px-8 lg:px-12">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {ROLE_TABS.map((option) => (
            <Button
              key={option}
              className="shrink-0"
              variant={roleTab === option ? "primary" : "outline"}
              onClick={() => setRoleTab(option)}
            >
              {option === "Donated" ? "I donated" : option === "Claimed" ? "I claimed" : "All"}
            </Button>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {STATUS_FILTERS.map((option) => (
            <Button
              key={option}
              className="h-9 shrink-0 px-3 text-xs"
              variant={statusFilter === option ? "primary" : "outline"}
              onClick={() => setStatusFilter(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {loading ? "Loading…" : `${visible.length} ${visible.length === 1 ? "entry" : "entries"}`}
        </p>
      </section>

      {loading ? (
        <p className="px-4 py-10 text-sm text-muted-foreground sm:px-8 lg:px-12">
          Loading your history…
        </p>
      ) : visible.length === 0 ? (
        <div className="px-4 py-10 sm:px-8 lg:px-12">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Nothing here yet. Donations you post or claim will show up in this list."
              : "Nothing matches these filters."}
          </p>
          {rows.length === 0 && (
            <Button asChild variant="outline" className="mt-4">
              <Link to="/donations">Find food</Link>
            </Button>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.month} className="border-b border-border">
            <h2 className="label-caps bg-muted/40 px-4 py-3 text-muted-foreground sm:px-8 lg:px-12">
              {group.month}
            </h2>
            <ul className="divide-y divide-border">
              {group.items.map(({ row, status, donated, claimed }) => {
                const open =
                  status !== "Completed" && status !== "Expired" && status !== "Available";
                return (
                  <li
                    key={row.id}
                    className="grid gap-4 px-4 py-5 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:px-12"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={status} />
                        <span className="label-caps rounded-sm border border-border px-2 py-1 text-muted-foreground">
                          {donated && claimed
                            ? "Donated & claimed"
                            : donated
                              ? "You donated"
                              : "You claimed"}
                        </span>
                      </div>
                      <h3 className="mt-3 font-display text-2xl leading-tight break-words">
                        {row.food_type}
                      </h3>
                      <div className="mt-3 grid gap-x-6 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <p className="flex items-start gap-2">
                          <Utensils className="mt-0.5 size-3.5 shrink-0 text-accent" />
                          <span className="min-w-0 break-words">
                            {row.quantity}
                            {row.weight_kg != null ? ` · ${row.weight_kg} kg` : ""}
                            {row.servings != null ? ` · ${row.servings} people` : ""}
                          </span>
                        </p>
                        <p className="flex items-start gap-2">
                          <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent" />
                          <span className="min-w-0 break-words">
                            {row.pickup_address || "Location not recorded"}
                          </span>
                        </p>
                        <p className="flex items-start gap-2">
                          <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-accent" />
                          <span className="min-w-0">Posted {formatMoment(row.created_at)}</span>
                        </p>
                        <p className="flex items-start gap-2">
                          <Truck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                          <span className="min-w-0">
                            {row.completed_at
                              ? `Completed ${formatMoment(row.completed_at)}`
                              : row.claimed_at
                                ? `Claimed ${formatMoment(row.claimed_at)}`
                                : "Not claimed"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {open && (
                        <Button asChild>
                          <Link to="/pickup" search={{ id: row.id }}>
                            <Truck className="size-4" />
                            Track
                          </Link>
                        </Button>
                      )}
                      <Button asChild variant="outline">
                        <Link to="/donation/$donationId" params={{ donationId: row.id }}>
                          Details
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </AppShell>
  );
}
