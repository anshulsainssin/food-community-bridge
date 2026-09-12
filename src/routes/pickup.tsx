import { createFileRoute } from "@tanstack/react-router";
import { Check, Clock3, MapPin, Phone, Truck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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

function PickupPage() {
  const [stage, setStage] = useState(1);
  const [donation, setDonation] = useState<Donation | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("donations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setDonation(data as Donation | null);
    }
    void load();
  }, []);

  const advance = () => setStage((current) => Math.min(current + 1, steps.length - 1));
  return (
    <AppShell>
      <PageIntro
        eyebrow="Pickup / FWC-2048"
        title={
          <>
            Vegetable biryani <span className="italic">& dal.</span>
          </>
        }
        description="A 40-meal donation from Maya’s Kitchen, scheduled for collection today."
        action={<StatusBadge value={steps[stage] ?? "Claimed"} />}
      />
      <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
        <section className="border-b border-border p-5 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <h2 className="label-caps">Status timeline</h2>
          <div className="mt-8">
            {steps.map((step, index) => (
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
                  <span
                    className={`absolute left-[15px] top-8 h-12 w-px ${index < stage ? "bg-primary" : "bg-border"}`}
                  />
                )}
                <div className="pt-1">
                  <p className="font-medium">{step}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {index === stage ? "Current status" : index < stage ? "Completed" : "Pending"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {stage < steps.length - 1 ? (
            <Button size="wide" className="mt-3 w-full" onClick={advance}>
              {stage === 1 ? "Start pickup" : stage === 2 ? "Confirm pickup" : "Mark completed"}
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
            <Detail icon={Clock3} label="Pickup deadline" value="Today, 1:30 PM" />
            <Detail icon={UserRound} label="Donor" value="Maya Sharma · Maya’s Kitchen" />
            <Detail icon={Phone} label="Donor contact" value="+91 98765 43210" />
            <Detail icon={Truck} label="NGO / volunteer" value="Seva Community Trust · Arjun Mehta" />
          </div>
          <div className="mt-8 border border-border-strong bg-card p-5">
            <p className="label-caps text-muted-foreground">Donation information</p>
            <p className="mt-3 font-display text-2xl">40 sealed meal portions</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Vegetarian. Prepared today at 8:30 AM. Collect from the service entrance.
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
