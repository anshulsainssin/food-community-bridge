import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, ChevronRight, ClipboardList, MapPin, PackageOpen, Plus, Truck, Users, UtensilsCrossed } from "lucide-react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useLocationSync, useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight, useMyStats } from "@/hooks/use-stats";
import { displayStatus, donationUrgency } from "@/lib/donation-status";
import { displayName } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddress } from "@/lib/geocode.functions";
import type { Tables } from "@/integrations/supabase/types";


export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Donor Dashboard | Food Waste Connect" },
    { name: "description", content: "Manage food donations, pickups, and community impact with Food Waste Connect." },
    { property: "og:title", content: "Food Waste Connect Donor Dashboard" },
    { property: "og:description", content: "Manage donations and see the impact of rescued food." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});

type Donation = Tables<"donations">;

const howItWorks = [
  { step: "add", label: "Food added", detail: "A donor shares surplus food with a pickup deadline." },
  { step: "claim", label: "NGO / volunteer claims", detail: "A nearby NGO or volunteer claims it." },
  { step: "pickup", label: "Pickup", detail: "They collect it and scan the donor's QR code." },
  { step: "done", label: "Completed", detail: "The food reaches people who need it." },
] as const;

function formatWhen(iso: string | null) {
  if (!iso) return "No pickup deadline";
  return `Pickup by ${new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function Index() {
  const navigate = useNavigate();
  const { user, profile, updateProfile, loading: loadingUser } = useProfile();
  const [diet, setDiet] = useState("Vegetarian");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [myDonations, setMyDonations] = useState<Donation[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const { stats, reload: reloadStats } = useMyStats(user?.id);

  useLocationSync(
    Boolean(user),
    profile?.latitude != null && profile?.longitude != null ? { latitude: profile.latitude, longitude: profile.longitude } : null,
    (coords) => updateProfile({ latitude: coords.latitude, longitude: coords.longitude }),
  );

  const firstName = displayName(profile?.full_name, user?.email)?.split(" ")[0] ?? null;
  const title = loadingUser ? (
    <>Welcome.</>
  ) : !user ? (
    <>Welcome to <span className="italic">Food Waste Connect.</span></>
  ) : firstName ? (
    <>Welcome back, <span className="italic">{firstName}.</span></>
  ) : (
    <>Welcome <span className="italic">back.</span></>
  );

  // These are the signed-in user's own totals; a guest has none, so show a dash instead of 0.
  const mine = (value: string) => (user ? value : "—");
  const statTiles = [
    { label: "Food saved", value: mine(formatWeight(stats.food_saved_kg)), unit: "kg", icon: UtensilsCrossed },
    { label: "People fed", value: mine(formatCount(stats.people_fed)), unit: "people", icon: Users },
    { label: "Active donations", value: mine(formatCount(stats.active_donations)), unit: "in progress", icon: PackageOpen },
    { label: "Completed pickups", value: mine(formatCount(stats.completed_pickups)), unit: "all time", icon: Check },
  ];

  const loadMine = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("donations")
      .select("*")
      .eq("donor_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    setMyDonations((data as Donation[] | null) ?? []);
    setLoadingDonations(false);
  }, []);

  useEffect(() => {
    if (user?.id) void loadMine(user.id);
    else {
      setMyDonations([]);
      setLoadingDonations(false);
    }
  }, [user?.id, loadMine]);

  const today = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const description = !user
    ? "Sign in to share surplus food, track pickups, and see the impact of what you have donated."
    : stats.meals_this_month > 0
      ? `Your completed donations have served ${formatCount(stats.meals_this_month)} people this month.`
      : "No completed donations this month yet. Share surplus food below to get started.";

  async function submitDonation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const address = String(form.get("pickup_location") ?? "").trim();
    const servings = toNumber(form.get("quantity"));
    const weight = toNumber(form.get("weight_kg"));
    const preparedAt = toTimestamp(form.get("prepared_at"));
    const pickupDeadline = toTimestamp(form.get("pickup_deadline"));

    const nowMs = Date.now();
    // Small allowance for clock drift and minute-rounded datetime inputs.
    if (preparedAt && Date.parse(preparedAt) > nowMs + 5 * 60_000) {
      setError("Food prepared time can't be in the future.");
      return;
    }
    if (preparedAt && pickupDeadline && Date.parse(pickupDeadline) <= Date.parse(preparedAt)) {
      setError("Pickup deadline must be after the food prepared time.");
      return;
    }
    const draft = { status: "Available", created_at: new Date(nowMs).toISOString(), prepared_at: preparedAt, pickup_deadline: pickupDeadline };
    if (donationUrgency(draft, nowMs) === "Expired") {
      setError("This food is already past its safe pickup window (the pickup deadline has passed, or it was prepared more than 24 hours ago), so it can't be published.");
      return;
    }

    setSaving(true);
    // The donation's map pin and distances come from the pickup address the donor typed, never from
    // the device (a laptop's browser location can be far off) or the donor's saved profile location.
    let place: { latitude: number; longitude: number } | null = null;
    let lookupFailed = false;
    try {
      place = await geocodeAddress({ data: { address } });
    } catch (lookupError) {
      console.error(lookupError);
      lookupFailed = true;
    }
    if (!place && !lookupFailed) {
      setSaving(false);
      setError("We couldn't find this pickup location on the map. Add the area, city and pincode, for example: \"Civil Lines, Moradabad, 244001\".");
      return;
    }
    const { error: insertError } = await supabase.from("donations").insert({
      donor_id: user.id,
      food_type: String(form.get("food_type") ?? ""),
      diet,
      quantity: servings != null ? `${servings} people served` : String(form.get("quantity") ?? ""),
      servings,
      weight_kg: weight,
      prepared_at: preparedAt,
      pickup_deadline: pickupDeadline,
      contact_info: String(form.get("contact") ?? ""),
      notes: String(form.get("notes") ?? ""),
      pickup_address: address,
      pickup_latitude: place?.latitude ?? null,
      pickup_longitude: place?.longitude ?? null,
    });
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    formEl.reset();
    setDiet("Vegetarian");
    setSubmitted(true);
    await loadMine(user.id);
    await reloadStats();
  }


  return (
    <AppShell>
      <PageIntro
        eyebrow={`Overview / ${today}`}
        title={title}
        description={description}
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="wide" onClick={() => document.querySelector("#donate")?.scrollIntoView({ behavior: "smooth" })}><Plus className="size-4" />New donation</Button>
            <Button variant="outline" size="wide" onClick={() => document.querySelector("#recent")?.scrollIntoView({ behavior: "smooth" })}>View donations</Button>
          </div>
        }
      />

      <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12" aria-labelledby="purpose">
        <p id="purpose" className="font-display text-2xl italic sm:text-3xl">Bacha hua fresh khana waste mat hone do.</p>
        <p className="mt-2 text-sm text-muted-foreground">Extra food ko nearby NGOs aur volunteers tak pahunchao.</p>
        <ol className="mt-5 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          {howItWorks.map(({ step, label, detail }, index) => (
            <li key={step} className="bg-background p-4">
              <p className="label-caps text-accent">Step {index + 1}</p>
              <p className="mt-2 text-sm font-medium">{label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid grid-cols-2 border-b border-border xl:grid-cols-4">{statTiles.map(({ label, value, unit, icon: Icon }, index) => <article key={label} className={`min-w-0 p-4 sm:p-7 ${index % 2 === 0 ? "border-r border-border" : ""} ${index < 2 ? "border-b border-border xl:border-b-0" : ""} ${index === 1 ? "xl:border-r" : ""}`}><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><p className="label-caps truncate text-muted-foreground">{label}</p><Icon className="size-4 shrink-0 text-accent" /></div><p className="mt-4 font-display text-3xl break-words sm:mt-5 sm:text-5xl">{value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{unit}</p></article>)}</section>

      <div className="grid lg:grid-cols-[1fr_1.05fr]">
        <div className="border-b border-border lg:border-b-0 lg:border-r">
          <section className="border-b border-border px-4 py-8 sm:px-8 lg:px-10" id="recent"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3"><h2 className="label-caps truncate text-foreground">Recent donations</h2><span className="shrink-0 text-xs text-muted-foreground">{myDonations.length} entries</span></div><div className="mt-7 divide-y divide-border">{loadingDonations ? <p className="text-sm text-muted-foreground">Loading donations…</p> : !user ? <p className="text-sm text-muted-foreground">Sign in to see your donations.</p> : myDonations.length === 0 ? <p className="text-sm text-muted-foreground">No donations yet. Share your first surplus food below.</p> : myDonations.map((item) => <article key={item.id} className="group py-5 first:pt-0"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><h3 className="font-display text-xl break-words sm:text-2xl"><Link to="/donation/$donationId" params={{ donationId: item.id }} className="hover:underline">{item.food_type}</Link></h3><p className="mt-2 text-xs break-words text-muted-foreground">{item.quantity} · {item.pickup_address || "Location not available"}</p><p className="mt-1 text-xs text-muted-foreground">{formatWhen(item.pickup_deadline)}</p></div><span className="shrink-0"><StatusBadge value={displayStatus(item)} /></span></div></article>)}</div></section>
          <section className="px-4 py-8 sm:px-8 lg:px-10"><h2 className="label-caps">Quick actions</h2><div className="mt-5 grid gap-2 sm:grid-cols-2">{[{label:"Create donation",icon:Plus,target:"#donate"},{label:"Review pickups",icon:Truck,target:"#recent"},{label:"Donation history",icon:ClipboardList,target:"#recent"},{label:"Pickup locations",icon:MapPin,target:"#donate"}].map(({label,icon:Icon,target}) => <Button key={label} variant="outline" className="h-14 w-full justify-between px-4" onClick={() => document.querySelector(target)?.scrollIntoView({behavior:"smooth"})}><span className="flex min-w-0 items-center gap-2"><Icon className="size-4 shrink-0" /><span className="truncate">{label}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></Button>)}</div></section>
        </div>

        <section id="donate" className="bg-muted/25 px-4 py-8 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <p className="label-caps text-accent">Donation registry</p><h2 className="mt-3 font-display text-3xl italic sm:text-4xl">Share surplus food</h2><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Add pickup details so a nearby community partner can collect the food safely and on time.</p>
          {submitted ? <div className="mt-8 border border-border-strong bg-card p-6"><div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-5" /></div><h3 className="mt-5 font-display text-2xl sm:text-3xl">Donation ready</h3><p className="mt-2 text-sm text-muted-foreground">Your donation has been saved with its pickup location.</p><Button className="mt-6" variant="outline" onClick={() => setSubmitted(false)}>Add another</Button></div> : <form className="mt-8 space-y-6" onSubmit={submitDonation}>
            <label className="block"><span className="label-caps text-muted-foreground">Food type</span><select name="food_type" required className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground"><option value="">Select food type</option><option>Cooked meals</option><option>Fresh produce</option><option>Bakery items</option><option>Packaged food</option></select></label>
            <fieldset><legend className="label-caps text-muted-foreground">Dietary type</legend><div className="mt-2 grid grid-cols-2 gap-2">{["Vegetarian","Non-vegetarian"].map((option) => <Button key={option} type="button" variant={diet === option ? "primary" : "outline"} onClick={() => setDiet(option)}>{option}</Button>)}</div></fieldset>
            <div className="grid gap-6 sm:grid-cols-2"><Field name="quantity" label="Quantity / people served" type="number" /><Field name="weight_kg" label="Weight (kg, optional)" type="number" step="0.1" required={false} /></div>
            <div className="grid gap-6 sm:grid-cols-2"><Field name="prepared_at" label="Food prepared time" type="datetime-local" /><Field name="pickup_deadline" label="Pickup deadline" type="datetime-local" /></div>
            <div className="grid gap-6 sm:grid-cols-2"><Field name="contact" label="Contact information" type="tel" /><Field name="pickup_location" label="Pickup location" placeholder="Area, city, pincode" /></div>
            <label className="block"><span className="label-caps text-muted-foreground">Additional notes</span><textarea name="notes" rows={3} placeholder="Packaging details, allergens, or pickup instructions" className="mt-2 w-full resize-none border-b border-input bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 focus:border-foreground" /></label>
            <fieldset>
              <legend className="label-caps text-muted-foreground">Food-safety checklist</legend>
              <div className="mt-3 space-y-3">
                {["Food is freshly prepared", "Food was stored safely", "Food is suitable for donation"].map((item) => (
                  <label key={item} className="flex items-start gap-3 text-sm">
                    <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-primary" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">These are your own confirmations as the donor. They don't guarantee that the food is safe — receivers should still check the food before serving it.</p>
            </fieldset>
            {error && <p className="text-sm text-accent">{error}</p>}
            {user ? (
              <Button type="submit" size="wide" className="w-full" disabled={saving}>{saving ? "Saving…" : "Publish donation"}</Button>
            ) : (
              <Button type="button" size="wide" className="w-full" onClick={() => void navigate({ to: "/auth" })}>Sign in to donate</Button>
            )}
          </form>}
        </section>
      </div>
    </AppShell>
  );
}

function toTimestamp(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : null;
}

function toNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function Field({ label, name, type = "text", step, required = true, placeholder }: { label: string; name: string; type?: string; step?: string; required?: boolean; placeholder?: string }) {
  return <label className="block"><span className="label-caps text-muted-foreground">{label}</span><input required={required} name={name} type={type} step={step} placeholder={placeholder} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 focus:border-foreground" /></label>;
}
