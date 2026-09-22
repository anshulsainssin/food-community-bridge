import { createFileRoute } from "@tanstack/react-router";
import { Building2, PackageCheck, Plus, UtensilsCrossed, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DonationMap, type MapPoint } from "@/components/donation-map";
import { useIsAdmin } from "@/hooks/use-admin";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { useProfile } from "@/hooks/use-profile";
import { formatCount } from "@/hooks/use-stats";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/distribution")({
  head: () => ({
    meta: [
      { title: "Live Beneficiary & Distribution Tracker | Ratna Nidhi Central Kitchen" },
      { name: "description", content: "Live map of distribution centers and schools receiving daily fresh cooked meals from the Ratna Nidhi Central Kitchen." },
      { property: "og:title", content: "Live Beneficiary & Distribution Tracker" },
      { property: "og:description", content: "Meals cooked today, children served, and active kitchen centers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DistributionPage,
});

type Center = Tables<"distribution_centers">;

function DistributionPage() {
  const { user } = useProfile();
  const { isAdmin } = useIsAdmin(user?.id);
  const { stats } = useKitchenStats();
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCenter, setShowAddCenter] = useState(false);
  const [showLogMeal, setShowLogMeal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("distribution_centers").select("*").order("name");
    setCenters((data as Center[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("distribution-centers")
      .on("postgres_changes", { event: "*", schema: "public", table: "distribution_centers" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  async function addCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const lat = form.get("latitude");
    const lon = form.get("longitude");
    const { error: insertError } = await supabase.from("distribution_centers").insert({
      name: String(form.get("name") ?? "").trim(),
      center_type: String(form.get("center_type") ?? "School").trim() || "School",
      address: String(form.get("address") ?? "").trim() || null,
      latitude: lat ? Number(lat) : null,
      longitude: lon ? Number(lon) : null,
      daily_meal_target: Number(form.get("daily_meal_target") ?? 0),
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    (event.target as HTMLFormElement).reset();
    setShowAddCenter(false);
    await load();
  }

  async function logMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const { error: insertError } = await supabase.from("meal_logs").insert({
      center_id: String(form.get("center_id") ?? ""),
      meals_cooked: Number(form.get("meals_cooked") ?? 0),
      children_served: Number(form.get("children_served") ?? 0),
      logged_by: user?.id ?? null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    (event.target as HTMLFormElement).reset();
    setShowLogMeal(false);
  }

  const mapPoints: MapPoint[] = centers
    .filter((center) => center.latitude != null && center.longitude != null)
    .map((center) => ({
      id: `center-${center.id}`,
      lat: center.latitude as number,
      lon: center.longitude as number,
      title: center.name,
      detail: `${center.center_type} · Target ${formatCount(center.daily_meal_target)} meals/day`,
      kind: "center",
    }));

  const tiles = [
    { label: "Meals cooked today", value: formatCount(stats.meals_cooked_today), icon: UtensilsCrossed },
    { label: "Beneficiary children served", value: formatCount(stats.children_served_today), icon: Users },
    { label: "Active kitchen centers", value: formatCount(stats.active_kitchen_centers), icon: Building2 },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Live Beneficiary & Distribution Tracker"
        title={<>Meals, delivered <span className="italic">where they're needed.</span></>}
        description="Distribution centers and schools receiving daily fresh cooked meals from the Ratna Nidhi Central Kitchen, tracked live."
        action={
          isAdmin ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" size="wide" onClick={() => setShowAddCenter((v) => !v)}>
                <Plus className="size-4" />
                {showAddCenter ? "Cancel" : "Add center"}
              </Button>
              <Button size="wide" onClick={() => setShowLogMeal((v) => !v)} disabled={centers.length === 0}>
                <PackageCheck className="size-4" />
                {showLogMeal ? "Cancel" : "Log a delivery"}
              </Button>
            </div>
          ) : undefined
        }
      />

      <section className="grid grid-cols-1 border-b border-border sm:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon }, index) => (
          <article key={label} className={`min-w-0 p-4 sm:p-7 ${index < 2 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{label}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-4 font-display text-3xl break-words sm:text-5xl">{value}</p>
          </article>
        ))}
      </section>

      {isAdmin && showAddCenter && (
        <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
          <form onSubmit={addCenter} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="label-caps text-muted-foreground">Center name</span>
              <input name="name" required placeholder="e.g. Municipal School 12" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Type</span>
              <input name="center_type" defaultValue="School" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Daily meal target</span>
              <input name="daily_meal_target" type="number" min="0" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="label-caps text-muted-foreground">Address</span>
              <input name="address" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Latitude</span>
              <input name="latitude" type="number" step="any" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Longitude</span>
              <input name="longitude" type="number" step="any" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              {error && <p className="mb-3 text-sm text-accent">{error}</p>}
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save center"}</Button>
            </div>
          </form>
        </section>
      )}

      {isAdmin && showLogMeal && (
        <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
          <form onSubmit={logMeal} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block lg:col-span-2">
              <span className="label-caps text-muted-foreground">Center</span>
              <select name="center_id" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground">
                {centers.map((center) => (
                  <option key={center.id} value={center.id}>{center.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Meals delivered</span>
              <input name="meals_cooked" type="number" min="0" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Children served</span>
              <input name="children_served" type="number" min="0" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              {error && <p className="mb-3 text-sm text-accent">{error}</p>}
              <Button type="submit" disabled={saving}>{saving ? "Logging…" : "Log delivery"}</Button>
            </div>
          </form>
        </section>
      )}

      <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="label-caps truncate text-foreground">Distribution map</h2>
          <span className="shrink-0 text-xs text-muted-foreground">{mapPoints.length} centers</span>
        </div>
        <div className="mt-4">
          <DonationMap center={null} points={mapPoints} />
        </div>
      </section>

      <section className="px-4 py-6 sm:px-8 lg:px-12">
        <h2 className="label-caps text-foreground">Centers · {centers.length}</h2>
        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground">Loading centers…</p>
        ) : centers.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">No distribution centers recorded yet.</p>
        ) : (
          <div className="mt-5 grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {centers.map((center) => (
              <article key={center.id} className="bg-background p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <p className="min-w-0 truncate font-medium">{center.name}</p>
                  <span className={`label-caps shrink-0 rounded-sm px-2 py-1 ${center.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {center.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{center.center_type}</p>
                <p className="mt-3 text-sm break-words text-muted-foreground">{center.address || "Address not recorded"}</p>
                <p className="mt-3 text-sm">Target: {formatCount(center.daily_meal_target)} meals/day</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
