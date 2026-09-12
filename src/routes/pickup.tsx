import { createFileRoute } from "@tanstack/react-router";
import { Check, Clock3, MapPin, Phone, Truck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/pickup")({
  head: () => ({
    meta: [
      { title: "Pickup Tracking | Food Waste Connect" },
      { name: "description", content: "Track a community food donation pickup from claim to completion." },
      { property: "og:title", content: "Pickup Tracking | Food Waste Connect" },
      { property: "og:description", content: "Track food pickup status and coordination details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PickupPage,
});

const steps = ["Available", "Claimed", "Pickup in Progress", "Picked Up", "Completed"];

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

function formatMoment(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function personLine(name: string | null, organization: string | null) {
  const parts = [name, organization].filter((value) => value && value.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : "Not provided";
}

function PickupPage() {
  const { user } = useProfile();
  const [donation, setDonation] = useState<Donation | null>(null);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const [parties, setParties] = useState<Parties | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setDonation(null);
      setEvents([]);
      setParties(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("donations")
      .select("*")
      .or(`donor_id.eq.${user.id},claimed_by.eq.${user.id}`)
      .order("updated_at", { ascending: false })
      .limit(20);

    const rows = (data as Donation[] | null) ?? [];
    const active = rows.find((row) => row.status !== "Completed") ?? rows[0] ?? null;
    setDonation(active);

    if (active) {
      const [eventsResult, partiesResult] = await Promise.all([
        supabase.from("pickup_events").select("*").eq("donation_id", active.id).order("occurred_at", { ascending: true }),
        supabase.rpc("donation_parties", { p_donation_id: active.id }),
      ]);
      setEvents((eventsResult.data as PickupEvent[] | null) ?? []);
      const row = Array.isArray(partiesResult.data) ? (partiesResult.data[0] as Parties | undefined) : undefined;
      setParties(row ?? null);
    } else {
      setEvents([]);
      setParties(null);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const stage = Math.max(0, steps.indexOf(donation?.status ?? "Available"));
  const nextStatus = steps[stage + 1];

  async function advance() {
    if (!donation || !nextStatus) return;
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
    await load();
  }

  if (!loading && !donation) {
    return (
      <AppShell>
        <PageIntro
          eyebrow="Pickup / Tracking"
          title={<>No pickup <span className="italic">in progress.</span></>}
          description={user ? "Claim a donation or publish one of your own, and its pickup will be tracked here." : "Sign in to track a pickup."}
        />
      </AppShell>
    );
  }

  const eventByStatus = new Map(events.map((event) => [event.status, event] as const));

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
        action={<StatusBadge value={donation?.status ?? "Available"} />}
      />
      <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
        <section className="border-b border-border p-5 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
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
                    <p className="font-medium">{step}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {moment ?? (index === stage ? "Current status" : index < stage ? "Completed" : "Pending")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {error && <p className="mt-3 text-sm text-accent">{error}</p>}
          {nextStatus ? (
            <Button size="wide" className="mt-3 w-full" onClick={() => void advance()} disabled={working || stage === 0}>
              {stage === 0
                ? "Waiting to be claimed"
                : working
                  ? "Updating…"
                  : nextStatus === "Pickup in Progress"
                    ? "Start pickup"
                    : nextStatus === "Picked Up"
                      ? "Confirm pickup"
                      : "Mark completed"}
            </Button>
          ) : (
            <Button size="wide" className="mt-3 w-full" disabled>
              Pickup completed
            </Button>
          )}
        </section>
        <section className="bg-muted/25 p-5 sm:p-8 lg:p-10">
          <h2 className="font-display text-3xl italic">Pickup details</h2>
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
          </div>
          <div className="mt-8 border border-border-strong bg-card p-5">
            <p className="label-caps text-muted-foreground">Donation information</p>
            <p className="mt-3 font-display text-2xl">{donation?.quantity || "Quantity not recorded"}</p>
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

function Detail({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex gap-3 py-5 first:pt-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
      <div>
        <p className="label-caps text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm">{value}</p>
      </div>
    </div>
  );
}
