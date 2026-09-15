import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Clock3, MapPin, NotebookPen, Phone, Scale, Utensils, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { displayStatus } from "@/lib/donation-status";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/donation/$donationId")({
  head: () => ({
    meta: [
      { title: "Donation Details | Food Waste Connect" },
      { name: "description", content: "See the full details of a food donation: quantity, pickup window, location, contact and current status." },
      { property: "og:title", content: "Donation Details | Food Waste Connect" },
      { property: "og:description", content: "Full details of a surplus food donation and its pickup status." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DonationDetailsPage,
});

type Donation = Tables<"donations">;
type PickupEvent = Tables<"pickup_events">;
type Parties = {
  donor_name: string | null;
  donor_organization: string | null;
  donor_phone: string | null;
  receiver_name: string | null;
  receiver_organization: string | null;
  receiver_phone: string | null;
};

function formatStamp(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function DonationDetailsPage() {
  const { donationId } = useParams({ from: "/donation/$donationId" });
  const { user } = useProfile();
  const [donation, setDonation] = useState<Donation | null>(null);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const [parties, setParties] = useState<Parties | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("donations")
      .select(
        "id,donor_id,food_type,diet,quantity,servings,weight_kg,prepared_at,pickup_deadline,notes,status,pickup_address,pickup_latitude,pickup_longitude,claimed_by,claimed_at,completed_at,created_at,updated_at",
      )
      .eq("id", donationId)
      .maybeSingle();
    setDonation((data as Donation | null) ?? null);

    if (data) {
      const [{ data: eventRows }, { data: partyRows }] = await Promise.all([
        supabase.from("pickup_events").select("*").eq("donation_id", donationId).order("occurred_at", { ascending: true }),
        supabase.rpc("donation_parties", { p_donation_id: donationId }),
      ]);
      setEvents((eventRows as PickupEvent[] | null) ?? []);
      setParties(((partyRows as Parties[] | null) ?? [])[0] ?? null);
    } else {
      setEvents([]);
      setParties(null);
    }
    setLoading(false);
  }, [donationId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, user?.id]);

  // Live updates: the status/timeline reflects real-time changes from the donor or claimant
  // without needing a page refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`donation-${donationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "donations", filter: `id=eq.${donationId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pickup_events", filter: `donation_id=eq.${donationId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [donationId, load]);

  const facts = donation
    ? [
        { label: "Quantity", value: donation.quantity || "Not recorded", icon: Utensils },
        { label: "People served", value: donation.servings != null ? `${donation.servings} people` : "Not recorded", icon: Users },
        { label: "Weight", value: donation.weight_kg != null ? `${donation.weight_kg} kg` : "Not recorded", icon: Scale },
        { label: "Prepared", value: formatStamp(donation.prepared_at) ?? "Not recorded", icon: Clock3 },
        { label: "Pickup deadline", value: formatStamp(donation.pickup_deadline) ?? "No deadline set", icon: Clock3 },
        { label: "Pickup location", value: donation.pickup_address || "Not recorded", icon: MapPin },
      ]
    : [];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Donation / Details"
        title={
          loading ? (
            <>Loading donation…</>
          ) : donation ? (
            <>{donation.food_type}</>
          ) : (
            <>Donation <span className="italic">not found.</span></>
          )
        }
        description={
          loading
            ? "Fetching the latest details for this donation."
            : donation
              ? `${donation.diet} · added ${formatStamp(donation.created_at) ?? ""}`
              : "This donation may have been removed, or you need to sign in to view it."
        }
        action={
          <Button asChild variant="outline" size="wide">
            <Link to="/donations">
              <ArrowLeft className="size-4" />
              Back to donations
            </Link>
          </Button>
        }
      />

      {!loading && donation && (
        <>
          <section className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-5 sm:px-8 lg:px-12">
            <StatusBadge value={displayStatus(donation)} />
            <span className="text-xs text-muted-foreground">
              {donation.claimed_at ? `Claimed ${formatStamp(donation.claimed_at)}` : "Not claimed yet"}
            </span>
          </section>

          <section className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {facts.map(({ label, value, icon: Icon }) => (
              <article key={label} className="min-w-0 bg-background p-5 sm:p-7">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="label-caps truncate text-muted-foreground">{label}</p>
                  <Icon className="size-4 shrink-0 text-accent" />
                </div>
                <p className="mt-4 text-sm leading-6 break-words">{value}</p>
              </article>
            ))}
          </section>

          <section className="grid lg:grid-cols-2">
            <div className="border-b border-border px-4 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
              <h2 className="label-caps">Pickup timeline</h2>
              <div className="mt-6 space-y-5">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pickup activity recorded yet.</p>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{event.status}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatStamp(event.occurred_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-4 py-8 sm:px-8 lg:px-10">
              <h2 className="label-caps">People involved</h2>
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
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Contact details are only shown to the donor and the organization that claimed this donation.
                  </p>
                )}

                <div>
                  <p className="label-caps text-muted-foreground">Notes</p>
                  <p className="mt-2 flex items-start gap-2 leading-6">
                    <NotebookPen className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="break-words">{donation.notes || "No additional notes."}</span>
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
