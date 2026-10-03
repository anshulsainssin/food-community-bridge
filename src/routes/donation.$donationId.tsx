import { ClientOnly, createFileRoute, Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Clock3, Flag, MapPin, Navigation, NotebookPen, Package, Phone, Scale, ShieldCheck, Thermometer, Utensils, Users } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { useProfile } from "@/hooks/use-profile";
import { displayStatus, donationUrgency, formatTimeLeft, safeUntil, statusLabel, stepIndex } from "@/lib/donation-status";
import { directionsUrl } from "@/lib/food-details";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/donation/$donationId")({
  head: () => ({
    meta: [
      { title: "Donation Details | FoodBridge" },
      { name: "description", content: "See the full details of a food donation: quantity, pickup window, location, contact and current status." },
      { property: "og:title", content: "Donation Details | FoodBridge" },
      { property: "og:description", content: "Full details of a surplus food donation and its pickup status." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DonationDetailsPage,
});

type Donation = Tables<"donations">;
type PickupEvent = Tables<"pickup_events">;

const DonationMap = lazy(() => import("@/components/donation-map"));

function MapFallback() {
  return <div className="h-72 w-full animate-pulse bg-muted sm:h-96" aria-hidden="true" />;
}
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

function formatStamp(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const REPORT_REASONS = ["Unsafe or spoiled food", "Wrong or misleading details", "Spam or fake listing", "Donor did not hand over food", "Other"] as const;

/** Signed-in users (other than the donor) can flag a problematic listing for the admins. */
function ReportListing({ donationId, userId }: { donationId: string; userId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("donation_reports")
      .select("id")
      .eq("donation_id", donationId)
      .eq("reporter_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setReported(Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [donationId, userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(null);
    const { error: insertError } = await supabase.from("donation_reports").insert({
      donation_id: donationId,
      reporter_id: userId,
      reason: String(form.get("reason") ?? ""),
      details: String(form.get("details") ?? "").trim().slice(0, 1000) || null,
    });
    setSending(false);
    if (insertError) {
      setError(insertError.code === "23505" ? t("You have already reported this listing.") : insertError.message);
      return;
    }
    setReported(true);
    setOpen(false);
  }

  if (reported) {
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Flag className="size-3.5 shrink-0" />{t("You reported this listing. An admin will review it.")}</span>;
  }
  return (
    <div className="w-full sm:w-auto">
      <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => setOpen((value) => !value)}>
        <Flag className="size-3.5" />
        {t("Report listing")}
      </Button>
      {open && (
        <form onSubmit={submit} className="mt-3 grid gap-3 border border-border-strong bg-card p-4 sm:min-w-[22rem]">
          <label className="block">
            <span className="label-caps text-muted-foreground">{t("What's wrong?")}</span>
            <select name="reason" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground">
              {REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{t(reason)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label-caps text-muted-foreground">{t("Details (optional)")}</span>
            <textarea name="details" rows={2} maxLength={1000} className="mt-2 w-full resize-none border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
          </label>
          {error && <p className="text-xs text-accent">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={sending}>{sending ? t("Sending…") : t("Send report")}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function UrgencyNote({ donation, now }: { donation: Donation; now: number }) {
  const t = useT();
  const urgency = donationUrgency(donation, now);
  const until = safeUntil(donation);
  if (!urgency || until == null) return null;
  const pressing = urgency === "Urgent" || urgency === "Critical";
  const ends = formatStamp(new Date(until).toISOString());
  return (
    <span className={`flex items-center gap-1 text-xs ${pressing || urgency === "Expired" ? "text-accent" : "text-muted-foreground"}`}>
      {(pressing || urgency === "Expired") && <AlertTriangle className="size-3.5 shrink-0" />}
      {urgency === "Expired"
        ? t("Urgency: Expired · safe pickup window ended {time}", { time: ends ?? "" })
        : t("Urgency: {urgency} · {left} (safe pickup window ends {time})", { urgency: t(urgency), left: formatTimeLeft(until - now), time: ends ?? "" })}
    </span>
  );
}

function DonationDetailsPage() {
  const { donationId } = useParams({ from: "/donation/$donationId" });
  const { user } = useProfile();
  const [donation, setDonation] = useState<Donation | null>(null);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const [parties, setParties] = useState<Parties | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useNow();
  const t = useT();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("donations").select("*").eq("id", donationId).maybeSingle();
    setDonation((data as Donation | null) ?? null);

    if (data) {
      const [{ data: eventRows }, { data: partyRows }] = await Promise.all([
        supabase.from("pickup_events").select("*").eq("donation_id", donationId).order("occurred_at", { ascending: true }),
        supabase.rpc("donation_parties", { p_donation_id: donationId }),
      ]);
      // Oldest first; events recorded at the same moment keep the pickup order (Claimed before Pickup Started).
      setEvents(
        [...((eventRows as PickupEvent[] | null) ?? [])].sort(
          (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || stepIndex(a.status) - stepIndex(b.status),
        ),
      );
      setParties(((partyRows as Parties[] | null) ?? [])[0] ?? null);
    } else {
      setEvents([]);
      setParties(null);
    }
    setLoading(false);
  }, [donationId]);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  const facts = donation
    ? [
        { label: "Food name", value: donation.food_name || "Not recorded", icon: Utensils },
        { label: "Quantity", value: donation.quantity || "Not recorded", icon: Utensils },
        { label: "People served", value: donation.servings != null ? `${donation.servings} people` : "Not recorded", icon: Users },
        { label: "Weight", value: donation.weight_kg != null ? `${donation.weight_kg} kg` : "Not recorded", icon: Scale },
        { label: "Prepared", value: formatStamp(donation.prepared_at) ?? "Not recorded", icon: Clock3 },
        { label: "Pickup deadline", value: formatStamp(donation.pickup_deadline) ?? "No deadline set", icon: Clock3 },
        { label: "Pickup location", value: donation.pickup_address || "Not recorded", icon: MapPin },
        { label: "Storage condition", value: donation.storage_condition || "Not recorded", icon: Thermometer },
        { label: "Packaging", value: donation.packaging || "Not recorded", icon: Package },
      ]
    : [];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Donation / Details"
        title={
          loading ? (
            <>{t("Loading donation…")}</>
          ) : donation ? (
            <>{donation.food_type}</>
          ) : (
            <>{t("Donation")} <span className="italic">{t("not found.")}</span></>
          )
        }
        description={
          loading
            ? "Fetching the latest details for this donation."
            : donation
              ? `${t(donation.diet)} · ${t("added {time}", { time: formatStamp(donation.created_at) ?? "" })}`
              : "This donation may have been removed, or you need to sign in to view it."
        }
        action={
          <Button asChild variant="outline" size="wide">
            <Link to="/donations">
              <ArrowLeft className="size-4" />
              {t("Back to donations")}
            </Link>
          </Button>
        }
      />

      {!loading && donation && (
        <>
          <section className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-5 sm:px-8 lg:px-12">
            <StatusBadge value={displayStatus(donation, now)} />
            <span className="text-xs text-muted-foreground">
              {donation.claimed_at ? t("Claimed {time}", { time: formatStamp(donation.claimed_at) ?? "" }) : t("Not claimed yet")}
            </span>
            <UrgencyNote donation={donation} now={now} />
            {directionsUrl(donation) && (
              <Button asChild variant="outline" className="h-9 px-3 text-xs">
                <a href={directionsUrl(donation)!} target="_blank" rel="noreferrer">
                  <Navigation className="size-3.5" />
                  {t("Get Directions")}
                </a>
              </Button>
            )}
            {user && user.id !== donation.donor_id && <ReportListing donationId={donation.id} userId={user.id} />}
          </section>

          <section className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {facts.map(({ label, value, icon: Icon }) => (
              <article key={label} className="min-w-0 bg-background p-5 sm:p-7">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="label-caps truncate text-muted-foreground">{t(label)}</p>
                  <Icon className="size-4 shrink-0 text-accent" />
                </div>
                <p className="mt-4 text-sm leading-6 break-words">{t(value)}</p>
              </article>
            ))}
          </section>

          <section className="border-b border-border px-4 py-4 sm:px-8 lg:px-12">
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                {t("Food safety: the donor's details are their own declaration. Check the food (look, smell, temperature, packaging) before accepting it, keep hot food hot and cold food cold, and distribute it quickly.")}{" "}
                <Link to="/terms" className="underline">{t("Food safety guidelines & terms")}</Link>
              </span>
            </p>
          </section>

          {donation.pickup_latitude != null && donation.pickup_longitude != null && (
            <section className="border-b border-border">
              <ClientOnly fallback={<MapFallback />}>
                <Suspense fallback={<MapFallback />}>
                  <DonationMap
                    className="h-72 w-full sm:h-96"
                    markers={[
                      {
                        id: donation.id,
                        latitude: donation.pickup_latitude,
                        longitude: donation.pickup_longitude,
                        title: donation.food_type,
                        subtitle: donation.pickup_address || undefined,
                      },
                    ]}
                  />
                </Suspense>
              </ClientOnly>
            </section>
          )}

          <section className="grid lg:grid-cols-2">
            <div className="border-b border-border px-4 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
              <h2 className="label-caps">{t("Pickup timeline")}</h2>
              <div className="mt-6 space-y-5">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No pickup activity recorded yet.")}</p>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{t(statusLabel(event.status))}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatStamp(event.occurred_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-4 py-8 sm:px-8 lg:px-10">
              <h2 className="label-caps">{t("People involved")}</h2>
              <div className="mt-6 space-y-6 text-sm">
                {parties ? (
                  <>
                    <div>
                      <p className="label-caps text-muted-foreground">Donor</p>
                      <p className="mt-2 break-words">{parties.donor_name || parties.donor_organization || "Not recorded"}</p>
                      {parties.donor_organization && parties.donor_name && (
                        <p className="text-xs break-words text-muted-foreground">{parties.donor_organization}</p>
                      )}
                      {parties.donor_phone && (
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="size-3.5 shrink-0 text-accent" />
                          <span className="break-words">{parties.donor_phone}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="label-caps text-muted-foreground">Receiver</p>
                      <p className="mt-2 break-words">
                        {parties.receiver_name || parties.receiver_organization || "Not claimed yet"}
                      </p>
                      {parties.receiver_phone && (
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="size-3.5 shrink-0 text-accent" />
                          <span className="break-words">{parties.receiver_phone}</span>
                        </p>
                      )}
                      {parties.pickup_to_receiver_km != null && (
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Navigation className="size-3.5 shrink-0 text-accent" />
                          <span className="break-words">{parties.pickup_to_receiver_km.toFixed(1)} km from the pickup point</span>
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Contact details are only shown to the donor and the organization that claimed this donation.
                  </p>
                )}

                <div>
                  <p className="label-caps text-muted-foreground">{t("Notes")}</p>
                  <p className="mt-2 flex items-start gap-2 leading-6">
                    <NotebookPen className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="break-words">{donation.notes || t("No additional notes.")}</span>
                  </p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {!loading && !donation && (
        <section className="px-4 py-10 sm:px-8 lg:px-12">
          <p className="text-sm text-muted-foreground">No donation found for this link.</p>
        </section>
      )}
    </AppShell>
  );
}
