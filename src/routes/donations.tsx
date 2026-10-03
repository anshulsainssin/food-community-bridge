import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Clock3, Crosshair, HeartHandshake, MapPin, Navigation, Search, Utensils } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useNearbyNgos, useSearchArea } from "@/hooks/use-nearby";
import { useNow } from "@/hooks/use-now";
import { useProfile } from "@/hooks/use-profile";
import { useMyVerification } from "@/hooks/use-verification";
import { supabase } from "@/integrations/supabase/client";
import { displayStatus, donationUrgency, formatTimeLeft, isExpiredDonation, safeUntil } from "@/lib/donation-status";
import { directionsUrl } from "@/lib/food-details";
import { byDistance, donationDistance } from "@/lib/geo";
import { useT } from "@/lib/i18n";
import { roleKind } from "@/lib/roles";
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

const DonationMap = lazy(() => import("@/components/donation-map"));

function formatDeadline(iso: string | null) {
  if (!iso) return "No deadline";
  const date = new Date(iso);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isClaimable(item: Donation, userId: string | undefined, now: number) {
  return item.status === "Available" && item.claimed_by == null && item.donor_id !== userId && !isExpiredDonation(item, now);
}

function DonationsPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [maxDistance, setMaxDistance] = useState(0);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pincode, setPincode] = useState("");
  const { user, profile, loading: loadingUser } = useProfile();
  const navigate = useNavigate();
  const now = useNow();
  const t = useT();
  // Only verified NGOs / volunteers can claim (also enforced in the database).
  const verification = useMyVerification(user?.id);
  const isReceiver = roleKind(profile?.role) === "Receiver";
  const verifyPath = isReceiver && /volunteer/i.test(profile?.role ?? "") ? "/profile" : "/admin";

  const profileCoords =
    profile?.latitude != null && profile?.longitude != null
      ? { latitude: profile.latitude, longitude: profile.longitude }
      : null;

  const {
    area,
    detect,
    detecting,
    searchPincode,
    searching,
    error: areaError,
  } = useSearchArea(profileCoords, profile?.location_label ?? null);

  const origin = area.coords ? { lat: area.coords.latitude, lon: area.coords.longitude } : null;

  const { ngos, loading: loadingNgos } = useNearbyNgos(area.coords, maxDistance, Boolean(user));

  function submitPincode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchPincode(pincode);
  }


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
        distance: donationDistance(origin, item),
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
              ? ["Urgent", "Critical"].includes(donationUrgency(item, now) ?? "")
              : item.diet === filter,
        )
        .filter(({ distance }) => (maxDistance === 0 ? true : distance != null && distance <= maxDistance))
        .sort((a, b) => {
          if (filter === "Nearby") return byDistance(a.distance, b.distance);
          // Once the viewer's location is known, claimable donations come first, nearest first;
          // everything else keeps the newest-first order from the query.
          if (!origin) return 0;
          const claimableA = isClaimable(a.item, user?.id, now);
          const claimableB = isClaimable(b.item, user?.id, now);
          if (claimableA !== claimableB) return claimableA ? -1 : 1;
          return claimableA ? byDistance(a.distance, b.distance) : 0;
        }),
    [withDistance, filter, maxDistance, now, origin == null, user?.id],
  );

  const mapMarkers = useMemo(
    () =>
      visible
        .filter(({ item }) => item.pickup_latitude != null && item.pickup_longitude != null)
        .map(({ item }) => ({
          id: item.id,
          latitude: item.pickup_latitude!,
          longitude: item.pickup_longitude!,
          title: item.food_type,
          subtitle: item.pickup_address || undefined,
        })),
    [visible],
  );


  return (
    <AppShell>
      <PageIntro
        eyebrow="Receiver / Available food"
        title={
          <>
            {t("Food ready for")} <span className="italic">{t("collection.")}</span>
          </>
        }
        description="Surplus donations shared by nearby kitchens and stores. Claim what your community can collect before the pickup deadline."
      />

      {user && !verification.loading && (verification.suspended || (isReceiver && !verification.verified)) && (
        <p className="border-b border-border px-4 py-4 text-sm sm:px-8 lg:px-12">
          {verification.suspended
            ? t("Your account is suspended, so you can't claim food. Contact the platform admin.")
            : verification.ngoStatus === "Pending" || verification.volunteerStatus === "Pending"
              ? t("Your verification is pending admin review. You can browse listings, and claiming unlocks once you're verified.")
              : verification.ngoStatus === "Rejected" || verification.volunteerStatus === "Rejected"
                ? t("Your verification was rejected. Update your details to resubmit; claiming unlocks once you're verified.")
                : t("Only verified NGOs and volunteers can claim food.")}{" "}
          {!verification.suspended && (
            <Link to={verifyPath} className="underline">
              {verifyPath === "/profile" ? t("Volunteer verification") : t("NGO registration")}
            </Link>
          )}
        </p>
      )}

      <section className="border-b border-border px-4 py-5 sm:px-8 lg:px-12">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <form onSubmit={submitPincode} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block min-w-0">
              <span className="label-caps text-muted-foreground">{t("Search by pincode")}</span>
              <div className="mt-2 flex min-w-0 items-center gap-2 border-b border-input">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={pincode}
                  onChange={(event) => setPincode(event.target.value)}
                  inputMode="numeric"
                  placeholder="Enter a postal code"
                  aria-label="Pincode"
                  className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            </label>
            <div className="flex gap-2 sm:items-end">
              <Button type="submit" className="flex-1 sm:flex-none" disabled={searching}>
                {searching ? t("Searching…") : t("Search")}
              </Button>
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={detect} disabled={detecting}>
                <Crosshair className="size-4" />
                {detecting ? t("Locating…") : t("Use my location")}
              </Button>
            </div>
          </form>
          <p className="min-w-0 text-xs leading-5 text-muted-foreground lg:pb-3 lg:text-right">
            {area.label ? <span className="line-clamp-2 break-words">Showing results near {area.label}</span> : "No location set yet"}
          </p>
        </div>
        {areaError && <p className="mt-3 text-xs text-accent">{areaError}</p>}
      </section>

      <section className="border-b border-border px-4 py-4 sm:px-8 lg:px-12">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {filters.map((option) => (
            <Button
              key={option}
              className="shrink-0"
              variant={filter === option ? "primary" : "outline"}
              onClick={() => setFilter(option)}
            >
              {t(option)}
            </Button>
          ))}
          <select
            aria-label="Distance"
            value={maxDistance}
            onChange={(event) => setMaxDistance(Number(event.target.value))}
            className="h-11 shrink-0 border border-input bg-transparent px-3 text-sm outline-none focus:border-foreground"
          >
            {distanceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("{count} donations", { count: visible.length })}</p>
      </section>

      <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="label-caps truncate text-foreground">{t("Nearby urgent NGOs")}</h2>
          <span className="shrink-0 text-xs text-muted-foreground">{ngos.length}</span>
        </div>
        {!user ? (
          <p className="mt-4 text-sm text-muted-foreground">Sign in to see receiving organizations near you.</p>
        ) : loadingNgos ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading nearby organizations…</p>
        ) : ngos.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {area.coords ? "No active NGO listings found in this region yet." : "No NGOs or volunteers registered in this area yet."}
          </p>
        ) : (
          <div className="mt-5 grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {ngos.map((ngo) => (
              <article key={ngo.id} className="bg-background p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ngo.organization || ngo.full_name || "Community partner"}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{ngo.role || "Receiver"}</p>
                  </div>
                  {ngo.urgent_claims > 0 && <StatusBadge value="Urgent" />}
                </div>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    <span className="min-w-0 break-words">{ngo.location_label || "Area not shared"}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Navigation className="size-3.5 shrink-0 text-accent" />
                    {ngo.distance_km == null ? "Distance not available" : `${ngo.distance_km.toFixed(1)} km away`}
                  </p>
                  <p className="flex items-center gap-2">
                    <HeartHandshake className="size-3.5 shrink-0 text-accent" />
                    {ngo.active_claims === 0
                      ? "No pickups in progress"
                      : `${ngo.active_claims} pickup${ngo.active_claims === 1 ? "" : "s"} in progress${ngo.urgent_claims > 0 ? ` · ${ngo.urgent_claims} urgent` : ""}`}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {error && <p className="border-b border-border px-4 py-4 text-sm text-accent sm:px-8 lg:px-12">{error}</p>}

      {!loading && (mapMarkers.length > 0 || area.coords) && (
        <section className="border-b border-border">
          <ClientOnly fallback={<div className="h-72 w-full animate-pulse bg-muted sm:h-96" aria-hidden="true" />}>
            <Suspense fallback={<div className="h-72 w-full animate-pulse bg-muted sm:h-96" aria-hidden="true" />}>
              <DonationMap
                className="h-72 w-full sm:h-96"
                markers={mapMarkers}
                focus={
                  area.coords
                    ? {
                        latitude: area.coords.latitude,
                        longitude: area.coords.longitude,
                        label: area.source === "pincode" ? `Pincode ${pincode.trim()}` : (area.label ?? "Your location"),
                      }
                    : null
                }
              />
            </Suspense>
          </ClientOnly>
        </section>
      )}

      <section className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="bg-background p-10 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Loading donations…</p>
        ) : (
          visible.map(({ item, distance }) => {
            const claimedByMe = user != null && item.claimed_by === user.id;
            const isMine = user != null && item.donor_id === user.id;
            const isClaimed = item.claimed_by != null;
            const expired = isExpiredDonation(item, now);
            const urgency = donationUrgency(item, now);
            const until = safeUntil(item);
            const pressing = urgency === "Urgent" || urgency === "Critical";
            return (
              <article key={item.id} className="flex flex-col bg-background p-4 sm:p-7">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
                  <StatusBadge value={expired ? "Expired" : pressing && !isClaimed && urgency ? urgency : item.status} />
                  {urgency && urgency !== "Expired" && until != null && (
                    <span className={`flex min-w-0 items-center justify-end gap-1 text-xs ${pressing ? "text-accent" : "text-muted-foreground"}`}>
                      {pressing && <AlertTriangle className="size-3.5 shrink-0" />}
                      <span className="truncate">{urgency} · {formatTimeLeft(until - now)}</span>
                    </span>
                  )}
                </div>
                <h2 className="mt-5 font-display text-2xl leading-tight break-words sm:text-3xl">
                  <Link to="/donation/$donationId" params={{ donationId: item.id }} className="hover:underline">{item.food_type}</Link>
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">{item.food_name ? `${item.food_name} · ` : ""}{t(item.diet)}</p>
                <div className="mt-6 space-y-3 text-sm">
                  <p className="flex items-start gap-2">
                    <Utensils className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="min-w-0 break-words">{item.quantity}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Clock3 className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="min-w-0 break-words">{t("Pickup by {time}", { time: formatDeadline(item.pickup_deadline) })}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Navigation className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="min-w-0 break-words">{distance == null ? t("Distance not available") : t("{km} km away", { km: distance.toFixed(1) })}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="min-w-0 break-words">
                      {item.pickup_address || t("Location not available")}
                      {directionsUrl(item) && (
                        <>
                          {" · "}
                          <a href={directionsUrl(item)!} target="_blank" rel="noreferrer" className="whitespace-nowrap underline">
                            {t("Get Directions")}
                          </a>
                        </>
                      )}
                    </span>
                  </p>
                </div>

                <Button
                  className="mt-7 w-full"
                  variant={isClaimed || isMine || expired ? "outline" : "primary"}
                  disabled={isClaimed || isMine || expired || claiming === item.id || (user != null && !verification.loading && (verification.suspended || (!isReceiver && !verification.verified)))}
                  // Visitors can browse; claiming needs an NGO / volunteer account that has been verified.
                  onClick={() =>
                    !user
                      ? void navigate({ to: "/auth", search: { as: "ngo" } as never })
                      : !verification.verified && !verification.loading
                        ? void navigate({ to: verifyPath })
                        : void claim(item.id)
                  }
                >
                  {expired
                    ? t("Expired")
                    : isMine
                    ? t("Your donation")
                    : claimedByMe
                      ? t("Claimed by you")
                      : isClaimed
                        ? t("Already claimed")
                        : !user
                          ? t("Sign in to claim")
                          : claiming === item.id
                            ? t("Claiming…")
                            : !verification.loading && !verification.verified
                              ? isReceiver
                                ? t("Get verified to claim")
                                : t("For verified NGOs / volunteers")
                              : t("Claim food")}
                </Button>
              </article>
            );
          })
        )}

        {!loading && visible.length === 0 && (
          <p className="bg-background p-10 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
            {!user && !loadingUser && donations.length === 0
              ? "No donations to show right now. Sign in to share or claim food."
              : donations.length === 0
                ? "No donations yet."
                : "No donations match this filter right now."}
          </p>
        )}
      </section>
    </AppShell>
  );
}
