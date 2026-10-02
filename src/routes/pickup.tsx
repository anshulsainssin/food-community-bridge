import { ClientOnly, createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  CircleHelp,
  Clock3,
  Crosshair,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Radio,
  Route as RouteIcon,
  Truck,
  UserRound,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { PickupCodeCard, PickupVerifier } from "@/components/pickup-qr";
import { Button } from "@/components/ui/button";
import { usePickupLocation, useShareLiveLocation } from "@/hooks/use-live-location";
import { useDonationsRealtime } from "@/hooks/use-ngo";
import { useNow } from "@/hooks/use-now";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { displayStatus, PICKUP_STEPS, statusLabel } from "@/lib/donation-status";
import { distanceKm } from "@/lib/geo";
import { pickupLink } from "@/lib/pickup-link";
import type { Tables } from "@/integrations/supabase/types";

type PickupSearch = { id?: string };

export const Route = createFileRoute("/pickup")({
  // ?id= picks which donation to track (links from History). The QR link also carries &code=, which is
  // read from the raw URL: the router would turn an all-digit code into a number.
  validateSearch: (search: Record<string, unknown>): PickupSearch =>
    typeof search["id"] === "string" && search["id"] ? { id: search["id"] } : {},
  head: () => ({
    meta: [
      { title: "Pickup Tracking | Food Waste Connect" },
      { name: "description", content: "Track a community food donation pickup live on the map, from claim to completion." },
      { property: "og:title", content: "Pickup Tracking | Food Waste Connect" },
      { property: "og:description", content: "Live pickup location, status and coordination details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PickupPage,
});

const steps: readonly string[] = PICKUP_STEPS;
const AWAITING_PICKUP = new Set(["Claimed", "Pickup in Progress"]);
// A shared position older than this is shown as "last seen", not "live".
const LIVE_WINDOW_MS = 60_000;
// Rough city travel speed for the arrival estimate (straight-line distance, so it is only a guide).
const CITY_SPEED_KMH = 20;

const LiveTrackingMap = lazy(() => import("@/components/live-tracking-map"));

function MapFallback() {
  return <div className="h-72 w-full animate-pulse bg-muted sm:h-96" aria-hidden="true" />;
}

type Donation = Tables<"donations">;
type PickupEvent = Tables<"pickup_events">;
type Parties = {
  donor_name: string | null;
  donor_organization: string | null;
  donor_phone: string | null;
  receiver_name: string | null;
  receiver_organization: string | null;
  receiver_phone: string | null;
  // Pickup point → the claiming NGO/volunteer's area (null when not claimed or a location is unknown).
  pickup_to_receiver_km?: number | null;
};

function formatMoment(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function personLine(name: string | null, organization: string | null) {
  const parts = [name, organization].filter((value) => value && value.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : "Not provided";
}

function agoLabel(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function PickupPage() {
  const { user, loading: loadingUser } = useProfile();
  const search = Route.useSearch();
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const navigate = useNavigate();
  const [rows, setRows] = useState<Donation[]>([]);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const [parties, setParties] = useState<Parties | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const now = useNow(5_000);

  // Opened from the donor's QR link (/pickup?id=…&code=…).
  const qrLink = useMemo(() => {
    const params = new URLSearchParams(searchStr);
    const id = params.get("id");
    const code = params.get("code");
    return id && code ? { donationId: id, input: pickupLink(id, code) } : null;
  }, [searchStr]);
  const wantedId = qrLink?.donationId ?? search.id ?? null;

  const active = useMemo(() => rows.filter((row) => row.status !== "Completed" && row.status !== "Expired"), [rows]);
  const donation = useMemo(
    () => (wantedId ? rows.find((row) => row.id === wantedId) : undefined) ?? active[0] ?? rows[0] ?? null,
    [rows, active, wantedId],
  );
  const notMine = !loading && wantedId != null && donation?.id !== wantedId;

  const loadRows = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("donations")
      .select("*")
      .or(`donor_id.eq.${user.id},claimed_by.eq.${user.id}`)
      .order("updated_at", { ascending: false })
      .limit(30);
    let list = (data as Donation[] | null) ?? [];
    // A pickup opened by link (History, QR) may be older than the 30 most recent.
    if (wantedId && !list.some((row) => row.id === wantedId)) {
      const { data: one } = await supabase
        .from("donations")
        .select("*")
        .eq("id", wantedId)
        .or(`donor_id.eq.${user.id},claimed_by.eq.${user.id}`)
        .maybeSingle();
      if (one) list = [one as Donation, ...list];
    }
    setRows(list);
    setLoading(false);
  }, [user?.id, wantedId]);

  useEffect(() => {
    if (loadingUser) return;
    void loadRows();
  }, [loadRows, loadingUser]);

  const donationId = donation?.id ?? null;
  const loadDetails = useCallback(async () => {
    if (!donationId) {
      setEvents([]);
      setParties(null);
      return;
    }
    const [eventsResult, partiesResult] = await Promise.all([
      supabase.from("pickup_events").select("*").eq("donation_id", donationId).order("occurred_at", { ascending: true }),
      supabase.rpc("donation_parties", { p_donation_id: donationId }),
    ]);
    setEvents((eventsResult.data as PickupEvent[] | null) ?? []);
    const row = Array.isArray(partiesResult.data) ? (partiesResult.data[0] as Parties | undefined) : undefined;
    setParties(row ?? null);
  }, [donationId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const load = useCallback(async () => {
    await loadRows();
    await loadDetails();
  }, [loadRows, loadDetails]);

  // The other party's step (claim, QR scan, completion) shows up here without a manual refresh.
  useDonationsRealtime(() => void load());

  const status = donation?.status ?? "Available";
  const expired = status === "Expired";
  const awaitingPickup = AWAITING_PICKUP.has(status);
  const stage = Math.max(0, steps.indexOf(status));
  const nextStatus = expired ? undefined : steps[stage + 1];
  const isDonor = user != null && donation?.donor_id === user.id;
  const isClaimer = user != null && donation?.claimed_by === user.id;
  // "Picked Up" can only be reached by the claimer scanning the donor's one-time pickup QR code.
  const needsQr = nextStatus === "Picked Up";
  const showDonorCode = isDonor && awaitingPickup;
  const qrForThis = qrLink != null && donation != null && qrLink.donationId === donation.id;

  // Live GPS: the claimer shares, both sides watch.
  const share = useShareLiveLocation(donationId, isClaimer && awaitingPickup);
  const { location } = usePickupLocation((isDonor || isClaimer) && awaitingPickup ? donationId : null);

  const pickupPoint =
    donation?.pickup_latitude != null && donation.pickup_longitude != null
      ? { latitude: donation.pickup_latitude, longitude: donation.pickup_longitude, label: donation.pickup_address || donation.food_type }
      : null;
  const collectorName = parties?.receiver_organization || parties?.receiver_name || "NGO / volunteer";
  // The claimer sees their own phone's position straight away; everyone else sees the last saved one.
  const ownFix = isClaimer && share.sharing ? share.position : null;
  const collector = !awaitingPickup
    ? null
    : ownFix
      ? { latitude: ownFix.lat, longitude: ownFix.lon, accuracyM: ownFix.accuracy, label: "You" }
      : location
        ? { latitude: location.latitude, longitude: location.longitude, accuracyM: location.accuracy_m, label: collectorName }
        : null;
  const updatedAt = ownFix ? share.lastSentAt : location ? Date.parse(location.updated_at) : null;
  const isLive = updatedAt != null && now - updatedAt <= LIVE_WINDOW_MS;
  const remainingKm =
    collector && pickupPoint
      ? distanceKm({ lat: collector.latitude, lon: collector.longitude }, { lat: pickupPoint.latitude, lon: pickupPoint.longitude })
      : null;
  const etaMinutes = remainingKm != null ? Math.max(1, Math.round((remainingKm / CITY_SPEED_KMH) * 60)) : null;

  // The claimer can scan / upload the donor's QR any time before pickup (the database accepts it from
  // 'Claimed' too), so the scanner is always on screen for them — no extra button to find.
  const canVerify = isClaimer && awaitingPickup;

  function clearQrFromUrl() {
    if (qrLink) void navigate({ to: "/pickup", search: { id: qrLink.donationId }, replace: true });
  }

  async function advance() {
    if (!donation || !nextStatus) return;
    if (needsQr) return;
    setError(null);
    setWorking(true);
    const { error: rpcError } = await supabase.rpc("advance_donation_status", {
      p_donation_id: donation.id,
      p_status: nextStatus,
    });
    setWorking(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    // Heading out to collect: start sharing the live location with the donor.
    if (nextStatus === "Pickup in Progress" && isClaimer && !share.sharing) share.start();
    await load();
  }

  if (!loading && !donation) {
    return (
      <AppShell>
        <PageIntro
          eyebrow="Pickup / Tracking"
          title={<>No pickup <span className="italic">in progress.</span></>}
          description={
            user
              ? "Claim a donation or publish one of your own, and its pickup will be tracked here."
              : qrLink
                ? "Sign in as the NGO / volunteer who claimed this donation, then open the QR link again to confirm the pickup."
                : "Sign in to track a pickup."
          }
          action={
            <Button asChild variant="outline" size="wide">
              <Link to="/qr-guide">
                <CircleHelp className="size-4" />
                How the pickup QR works
              </Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const eventByStatus = new Map(events.map((event) => [event.status, event] as const));
  const showMap = donation != null && status !== "Available" && (pickupPoint != null || collector != null);

  return (
    <AppShell>
      <PageIntro
        eyebrow={`Pickup / ${donation ? donation.id.slice(0, 8).toUpperCase() : "Loading"}`}
        title={donation ? <>{donation.food_type}</> : <>Loading…</>}
        description={
          donation
            ? `${donation.quantity}${donation.weight_kg != null ? ` · ${donation.weight_kg} kg` : ""} · ${donation.diet}.`
            : "Loading pickup details."
        }
        action={<StatusBadge value={donation ? displayStatus(donation) : "Available"} />}
      />

      {notMine && (
        <p className="border-b border-border px-4 py-4 text-sm text-accent sm:px-8 lg:px-12">
          {qrLink
            ? "This QR link is for a donation you are not part of. Only the NGO / volunteer who claimed it can confirm its pickup."
            : "That pickup isn't one of yours, so your latest pickup is shown instead."}
        </p>
      )}

      {active.length > 1 && (
        <section className="border-b border-border px-4 py-4 sm:px-8 lg:px-12">
          <p className="label-caps text-muted-foreground">Your active pickups</p>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {active.map((row) => (
              <Button key={row.id} asChild className="shrink-0" variant={row.id === donation?.id ? "primary" : "outline"}>
                <Link to="/pickup" search={{ id: row.id }}>
                  <span className="max-w-[12rem] truncate">{row.food_type}</span>
                  <span className="text-[10px] opacity-70">{statusLabel(row.status)}</span>
                </Link>
              </Button>
            ))}
          </div>
        </section>
      )}

      {showMap && donation && (
        <section className="border-b border-border">
          <div className="relative">
            <ClientOnly fallback={<MapFallback />}>
              <Suspense fallback={<MapFallback />}>
                <LiveTrackingMap className="h-72 w-full sm:h-96" pickup={pickupPoint} collector={collector} recenterKey={recenter} />
              </Suspense>
            </ClientOnly>
            {collector && pickupPoint && (
              <Button
                type="button"
                variant="outline"
                className="absolute right-3 top-3 z-[500] bg-card"
                onClick={() => setRecenter((value) => value + 1)}
              >
                <LocateFixed className="size-4" />
                Show both
              </Button>
            )}
          </div>

          <div className="grid gap-px bg-border sm:grid-cols-3">
            <TrackFact
              icon={Radio}
              label={awaitingPickup ? "Live location" : "Live tracking"}
              value={
                !awaitingPickup
                  ? status === "Picked Up" || status === "Completed"
                    ? "Ended — food picked up"
                    : "Not active"
                  : updatedAt == null
                    ? isClaimer
                      ? share.sharing
                        ? "Finding your GPS position…"
                        : "You are not sharing yet"
                      : `Waiting for ${collectorName} to share`
                    : isLive
                      ? `Live · updated ${agoLabel(now - updatedAt)}`
                      : `Last seen ${agoLabel(now - updatedAt)}`
              }
              live={awaitingPickup && isLive}
            />
            <TrackFact
              icon={RouteIcon}
              label="Distance to pickup point"
              value={
                remainingKm == null
                  ? awaitingPickup
                    ? pickupPoint
                      ? "Shown once the location is shared"
                      : "Pickup point has no map location"
                    : "—"
                  : remainingKm < 0.05
                    ? "Arrived at the pickup point"
                    : `${formatKm(remainingKm)} away (straight line)`
              }
            />
            <TrackFact
              icon={Clock3}
              label="Estimated arrival"
              value={
                remainingKm == null || etaMinutes == null
                  ? "—"
                  : remainingKm < 0.05
                    ? "Now"
                    : `About ${etaMinutes} min (estimate)`
              }
            />
          </div>

          {isClaimer && awaitingPickup && (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
              <p className="text-xs leading-5 text-muted-foreground">
                {share.sharing
                  ? "Your live location is shared with the donor. Keep this page open on your phone while you travel."
                  : "Share your live GPS location so the donor can see you coming. It is only shown to the donor, and stops when the food is picked up."}
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                {pickupPoint && (
                  <Button asChild variant="outline">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${pickupPoint.latitude},${pickupPoint.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation className="size-4" />
                      Directions
                    </a>
                  </Button>
                )}
                {share.sharing ? (
                  <Button variant="outline" onClick={() => void share.stop()}>
                    Stop sharing
                  </Button>
                ) : (
                  <Button onClick={share.start}>
                    <Crosshair className="size-4" />
                    Share live location
                  </Button>
                )}
              </div>
            </div>
          )}
          {isClaimer && share.error && (
            <p className="border-t border-border px-4 py-3 text-sm text-accent sm:px-8 lg:px-12">{share.error}</p>
          )}
        </section>
      )}

      <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
        <section className="border-b border-border p-4 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <h2 className="label-caps">Status timeline</h2>
          <div className="mt-8">
            {steps.map((step, index) => {
              const moment = formatMoment(eventByStatus.get(step)?.occurred_at ?? null);
              return (
                <div key={step} className="relative flex min-h-20 gap-4">
                  <div
                    className={`z-10 flex size-8 shrink-0 items-center justify-center rounded-full border ${
                      index <= stage
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border-strong bg-background text-muted-foreground"
                    }`}
                  >
                    {index < stage ? <Check className="size-4" /> : <span className="text-xs">{index + 1}</span>}
                  </div>
                  {index < steps.length - 1 && (
                    <span className={`absolute left-[15px] top-8 h-12 w-px ${index < stage ? "bg-primary" : "bg-border"}`} />
                  )}
                  <div className="pt-1">
                    <p className="font-medium">{statusLabel(step)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {moment ?? (index === stage ? "Current status" : index < stage ? "Completed" : "Pending")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {error && <p className="mt-3 text-sm text-accent">{error}</p>}
          {qrForThis && isDonor && (
            <p className="mt-3 text-sm text-muted-foreground">
              This is your own pickup QR link. Show the QR code below to the NGO / volunteer when they arrive.
            </p>
          )}
          {qrForThis && isClaimer && !needsQr && !expired && stage >= steps.indexOf("Picked Up") && (
            <p className="mt-3 text-sm text-muted-foreground">This pickup is already verified.</p>
          )}
          {expired ? (
            <Button size="wide" className="mt-3 w-full" disabled>
              Donation expired
            </Button>
          ) : nextStatus ? (
            <>
              {!(needsQr && isClaimer) && (
                <Button size="wide" className="mt-3 w-full" onClick={() => void advance()} disabled={working || stage === 0 || (needsQr && !isClaimer)}>
                  {stage === 0
                    ? "Waiting to be claimed"
                    : working
                      ? "Updating…"
                      : nextStatus === "Pickup in Progress"
                        ? "Start pickup"
                        : nextStatus === "Picked Up"
                          ? "Waiting for QR verification"
                          : "Mark completed"}
                </Button>
              )}
              {canVerify && donation && (
                <PickupVerifier
                  donationId={donation.id}
                  initialInput={qrForThis ? qrLink?.input : undefined}
                  onVerified={() => {
                    clearQrFromUrl();
                    void load();
                  }}
                />
              )}
            </>
          ) : (
            <Button size="wide" className="mt-3 w-full" disabled>
              Pickup completed
            </Button>
          )}
          {showDonorCode && donation && <PickupCodeCard donationId={donation.id} />}
          {awaitingPickup && (isClaimer || isDonor) && (
            <Link to="/qr-guide" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4">
              <CircleHelp className="size-3.5 text-accent" />
              QR scan confusing? See the step-by-step guide
            </Link>
          )}
        </section>
        <section className="bg-muted/25 p-4 sm:p-8 lg:p-10">
          <h2 className="font-display text-2xl italic sm:text-3xl">Pickup details</h2>
          <div className="mt-7 divide-y divide-border">
            <Detail icon={MapPin} label="Pickup area" value={donation?.pickup_address || "Location not available"} />
            <Detail icon={Clock3} label="Pickup deadline" value={formatMoment(donation?.pickup_deadline ?? null) ?? "No deadline set"} />
            <Detail icon={UserRound} label="Donor" value={personLine(parties?.donor_name ?? null, parties?.donor_organization ?? null)} />
            <Detail icon={Phone} label="Donor contact" value={parties?.donor_phone || donation?.contact_info || "Not provided"} />
            <Detail
              icon={Truck}
              label="NGO / volunteer"
              value={donation?.claimed_by ? personLine(parties?.receiver_name ?? null, parties?.receiver_organization ?? null) : "Not claimed yet"}
            />
            <Detail
              icon={Phone}
              label="NGO / volunteer contact"
              value={donation?.claimed_by ? parties?.receiver_phone || "Not provided" : "Not claimed yet"}
            />
            <Detail
              icon={Navigation}
              label="Distance to NGO / volunteer"
              value={
                !donation?.claimed_by
                  ? "Not claimed yet"
                  : parties?.pickup_to_receiver_km != null
                    ? `${parties.pickup_to_receiver_km.toFixed(1)} km between the pickup point and the NGO / volunteer's area`
                    : "Not available (the NGO / volunteer hasn't shared a location)"
              }
            />
          </div>
          <div className="mt-8 border border-border-strong bg-card p-5">
            <p className="label-caps text-muted-foreground">Donation information</p>
            <p className="mt-3 font-display text-2xl break-words">{donation?.quantity || "Quantity not recorded"}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {donation?.diet ?? ""}
              {donation?.prepared_at ? `. Prepared ${formatMoment(donation.prepared_at)}` : ""}
              {donation?.notes ? `. ${donation.notes}` : "."}
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function TrackFact({ icon: Icon, label, value, live = false }: { icon: typeof MapPin; label: string; value: string; live?: boolean }) {
  return (
    <div className="flex min-w-0 gap-3 bg-background px-4 py-4 sm:px-6">
      <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="label-caps text-muted-foreground">{label}</p>
        <p className="mt-1 flex items-center gap-2 text-sm break-words">
          {live && <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
          {value}
        </p>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex gap-3 py-5 first:pt-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="label-caps text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm break-words">{value}</p>
      </div>
    </div>
  );
}
