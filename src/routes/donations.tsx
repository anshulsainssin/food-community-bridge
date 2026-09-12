import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Clock3, Crosshair, HeartHandshake, MapPin, Navigation, Search, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useNearbyNgos, useSearchArea } from "@/hooks/use-nearby";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";


export const Route = createFileRoute("/donations")({
  head: () => ({ meta: [
    { title: "Available Donations | Food Waste Connect" },
    { name: "description", content: "Browse nearby surplus food donations, filter by diet or urgency, and claim food for your community." },
    { property: "og:title", content: "Available Donations | Food Waste Connect" },
    { property: "og:description", content: "Find and claim nearby surplus food donations for your community." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: DonationsPage,
});

const filters = ["All", "Nearby", "Vegetarian", "Non-vegetarian", "Urgent"] as const;
const distanceOptions = [
  { label: "Any distance", value: 0 },
  { label: "Within 2 km", value: 2 },
  { label: "Within 5 km", value: 5 },
  { label: "Within 10 km", value: 10 },
  { label: "Within 25 km", value: 25 },
];

type Donation = Tables<"donations">;

function formatDeadline(iso: string | null) {
  if (!iso) return "No deadline";
  const date = new Date(iso);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isUrgent(iso: string | null) {
  if (!iso) return false;
  const deadline = new Date(iso).getTime();
  const now = Date.now();
  return deadline > now && deadline - now <= 4 * 60 * 60 * 1000;
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function DonationsPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [maxDistance, setMaxDistance] = useState(0);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user, profile } = useProfile();

  const origin =
    profile?.latitude != null && profile?.longitude != null
      ? { lat: profile.latitude, lon: profile.longitude }
      : null;

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("donations")
      .select("*")
      .order("created_at", { ascending: false });
    if (loadError) console.error(loadError);
    setDonations((data as Donation[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim(donationId: string) {
    setError(null);
    setClaiming(donationId);
    const { error: claimError } = await supabase.rpc("claim_donation", { p_donation_id: donationId });
    setClaiming(null);
    if (claimError) {
      setError(claimError.message);
      return;
    }
    await load();
  }

  const withDistance = useMemo(
    () =>
      donations.map((item) => ({
        item,
        distance:
          origin && item.pickup_latitude != null && item.pickup_longitude != null
            ? distanceKm(origin, { lat: item.pickup_latitude, lon: item.pickup_longitude })
            : null,
      })),
    [donations, origin?.lat, origin?.lon],
  );

  const visible = useMemo(
    () =>
      withDistance
        .filter(({ item }) =>
          filter === "All" || filter === "Nearby"
            ? true
            : filter === "Urgent"
              ? isUrgent(item.pickup_deadline)
              : item.diet === filter,
        )
        .filter(({ distance }) => (maxDistance === 0 ? true : distance != null && distance <= maxDistance))
        .sort((a, b) =>
          filter === "Nearby" ? (a.distance ?? Infinity) - (b.distance ?? Infinity) : 0,
        ),
    [withDistance, filter, maxDistance],
  );


  return (
    <AppShell>
      <PageIntro
        eyebrow="Receiver / Available food"
        title={
          <>
            Food ready for <span className="italic">collection.</span>
          </>
        }
        description="Surplus donations shared by nearby kitchens and stores. Claim what your community can collect before the pickup deadline."
      />

      <section className="flex flex-wrap gap-2 border-b border-border px-5 py-5 sm:px-8 lg:px-12">
        {filters.map((option) => (
          <Button key={option} variant={filter === option ? "primary" : "outline"} onClick={() => setFilter(option)}>
            {option}
          </Button>
        ))}
        <select
          aria-label="Distance"
          value={maxDistance}
          onChange={(event) => setMaxDistance(Number(event.target.value))}
          className="h-10 border border-input bg-transparent px-3 text-sm outline-none focus:border-foreground"
        >
          {distanceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center text-xs text-muted-foreground">{visible.length} donations</span>
      </section>

      {error && <p className="border-b border-border px-5 py-4 text-sm text-accent sm:px-8 lg:px-12">{error}</p>}

      <section className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="bg-background p-10 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Loading donations…</p>
        ) : (
          visible.map(({ item, distance }) => {
            const claimedByMe = user != null && item.claimed_by === user.id;
            const isMine = user != null && item.donor_id === user.id;
            const isClaimed = item.claimed_by != null;
            const urgent = isUrgent(item.pickup_deadline) && !isClaimed;
            return (
              <article key={item.id} className="flex flex-col bg-background p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <StatusBadge value={urgent ? "Urgent" : item.status} />
                  {urgent && (
                    <span className="flex items-center gap-1 text-xs text-accent">
                      <AlertTriangle className="size-3.5" />
                      Closing soon
                    </span>
                  )}
                </div>
                <h2 className="mt-5 font-display text-3xl leading-tight">{item.food_type}</h2>
                <p className="mt-2 text-xs text-muted-foreground">{item.diet}</p>
                <div className="mt-6 space-y-3 text-sm">
                  <p className="flex items-center gap-2">
                    <Utensils className="size-4 text-accent" />
                    {item.quantity}
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock3 className="size-4 text-accent" />
                    Pickup by {formatDeadline(item.pickup_deadline)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Navigation className="size-4 text-accent" />
                    {distance == null ? "Distance not available" : `${distance.toFixed(1)} km away`}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4 text-accent" />
                    {item.pickup_address || "Location not available"}
                  </p>
                </div>
                <Button
                  className="mt-7 w-full"
                  variant={isClaimed || isMine ? "outline" : "primary"}
                  disabled={isClaimed || isMine || !user || claiming === item.id}
                  onClick={() => void claim(item.id)}
                >
                  {isMine
                    ? "Your donation"
                    : claimedByMe
                      ? "Claimed by you"
                      : isClaimed
                        ? "Already claimed"
                        : !user
                          ? "Sign in to claim"
                          : claiming === item.id
                            ? "Claiming…"
                            : "Claim food"}
                </Button>
              </article>
            );
          })
        )}

        {!loading && visible.length === 0 && (
          <p className="bg-background p-10 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
            {donations.length === 0 ? "No donations yet." : "No donations match this filter right now."}
          </p>
        )}
      </section>
    </AppShell>
  );
}
