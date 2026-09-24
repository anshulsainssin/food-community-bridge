import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, MapPin, PackageCheck, Plus, ShieldCheck, UtensilsCrossed, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DonationMap, type MapPoint } from "@/components/donation-map";
import { useIsAdmin } from "@/hooks/use-admin";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { useProfile } from "@/hooks/use-profile";
import { useNgoRegistration } from "@/hooks/use-registration";
import { formatCount } from "@/hooks/use-stats";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import type { Tables } from "@/integrations/supabase/types";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/distribution")({
  head: () => ({
    meta: [
      { title: pageTitle("Live Distribution Tracker") },
      { name: "description", content: "Live map of community kitchens, food banks, and drop-off points receiving surplus food and fresh meals." },
      { property: "og:title", content: pageTitle("Live Distribution Tracker") },
      { property: "og:description", content: "Meals cooked today, people served, and active community kitchens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DistributionPage,
});

type Center = Tables<"distribution_centers">;

function DistributionPage() {
  const { user, profile } = useProfile();
  const { isAdmin } = useIsAdmin(user?.id);
  const { stats } = useKitchenStats();
  const { t } = useLanguage();
  const { registration, loading: loadingRegistration, saving: savingRegistration, error: registrationError, save: saveRegistration } = useNgoRegistration(user?.id);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCenter, setShowAddCenter] = useState(false);
  const [showLogMeal, setShowLogMeal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  // Request geolocation on mount to center the map on the user's position.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocationDenied(false);
      },
      () => {
        setLocationDenied(true);
      },
      { timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  function requestLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocationDenied(false);
      },
      () => {
        setLocationDenied(true);
      },
      { timeout: 8000 },
    );
  }

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
      center_type: String(form.get("center_type") ?? "Community kitchen").trim() || "Community kitchen",
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

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await saveRegistration({
      organization_name: String(form.get("organization_name") ?? "").trim(),
      registration_80g: String(form.get("registration_80g") ?? "").trim(),
      contact_person: String(form.get("contact_person") ?? "").trim(),
      contact_phone: String(form.get("contact_phone") ?? "").trim(),
      contact_email: String(form.get("contact_email") ?? "").trim(),
      pincode: String(form.get("pincode") ?? "").trim(),
    });
    if (saved) setShowRegistrationForm(false);
  }

  const mapPoints: MapPoint[] = centers
    .filter((center) => center.latitude != null && center.longitude != null)
    .map((center) => ({
      id: `center-${center.id}`,
      lat: center.latitude as number,
      lon: center.longitude as number,
      title: center.name,
      detail: `${center.center_type} · ${t("distribution.target")} ${formatCount(center.daily_meal_target)} ${t("distribution.mealsPerDay")}`,
      kind: "center",
    }));

  const tiles = [
    { labelKey: "distribution.tile.meals", value: formatCount(stats.meals_cooked_today), icon: UtensilsCrossed },
    { labelKey: "distribution.tile.children", value: formatCount(stats.children_served_today), icon: Users },
    { labelKey: "distribution.tile.centers", value: formatCount(stats.active_kitchen_centers), icon: Building2 },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow={t("distribution.eyebrow")}
        title={<>{t("distribution.titleMain")} <span className="italic">{t("distribution.titleEmphasis")}</span></>}
        description={t("distribution.description")}
        action={
          isAdmin ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" size="wide" onClick={() => setShowAddCenter((v) => !v)}>
                <Plus className="size-4" />
                {showAddCenter ? t("distribution.cancel") : t("distribution.addCenter")}
              </Button>
              <Button size="wide" onClick={() => setShowLogMeal((v) => !v)} disabled={centers.length === 0}>
                <PackageCheck className="size-4" />
                {showLogMeal ? t("distribution.cancel") : t("distribution.logDelivery")}
              </Button>
            </div>
          ) : undefined
        }
      />

      <section className="grid grid-cols-1 border-b border-border sm:grid-cols-3">
        {tiles.map(({ labelKey, value, icon: Icon }, index) => (
          <article key={labelKey} className={`min-w-0 p-4 sm:p-7 ${index < 2 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{t(labelKey)}</p>
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
              <input name="name" required placeholder="e.g. Riverside Community Kitchen" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Type</span>
              <input name="center_type" defaultValue="Community kitchen" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
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
              <Button type="submit" disabled={saving}>{saving ? t("distribution.saving") : t("distribution.savingCenter")}</Button>
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
              <span className="label-caps text-muted-foreground">People served</span>
              <input name="children_served" type="number" min="0" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              {error && <p className="mb-3 text-sm text-accent">{error}</p>}
              <Button type="submit" disabled={saving}>{saving ? t("distribution.logging") : t("distribution.logDeliveryBtn")}</Button>
            </div>
          </form>
        </section>
      )}

      <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="label-caps truncate text-foreground">{t("distribution.map")}</h2>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">{mapPoints.length} {t("distribution.centersLabel").toLowerCase()}</span>
            {locationDenied && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                onClick={requestLocation}
              >
                <MapPin className="size-3" />
                {t("distribution.locationBtn")}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <DonationMap center={userLocation} points={mapPoints} />
        </div>
      </section>

      <section className="px-4 py-6 sm:px-8 lg:px-12">
        <h2 className="label-caps text-foreground">{t("distribution.centersLabel")} · {centers.length}</h2>
        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground">{t("distribution.loading")}</p>
        ) : centers.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">{t("distribution.noCenters")}</p>
        ) : (
          <div className="mt-5 grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {centers.map((center) => (
              <article key={center.id} className="bg-background p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <p className="min-w-0 truncate font-medium">{center.name}</p>
                  <span className={`label-caps shrink-0 rounded-sm px-2 py-1 ${center.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {center.active ? t("distribution.active") : t("distribution.inactive")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{center.center_type}</p>
                <p className="mt-3 text-sm break-words text-muted-foreground">{center.address || t("distribution.noAddress")}</p>
                <p className="mt-3 text-sm">{t("distribution.target")} {formatCount(center.daily_meal_target)} {t("distribution.mealsPerDay")}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-border px-4 py-6 sm:px-8 lg:px-12">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="label-caps text-foreground">{t("registration.title")}</h2>
          {!isAdmin && registration && (
            <Button variant="outline" className="h-9 shrink-0 px-3 text-xs" onClick={() => setShowRegistrationForm((v) => !v)}>
              {showRegistrationForm ? t("registration.cancel") : t("registration.edit")}
            </Button>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("registration.intro")}</p>

        {!user ? (
          <div className="mt-6 border border-border-strong bg-card p-6">
            <p className="text-sm text-muted-foreground">{t("registration.signInPrompt")}</p>
            <Button asChild className="mt-4"><Link to="/auth">{t("registration.signIn")}</Link></Button>
          </div>
        ) : loadingRegistration ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("registration.loading")}</p>
        ) : (
          <>
            {registration && (
              <div className="mt-6 grid gap-4 border border-border-strong bg-card p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="truncate font-display text-2xl">{registration.organization_name}</p>
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <p className="break-words">{t("registration.summary.regId")} · {registration.registration_80g}</p>
                    <p className="break-words">{t("registration.summary.contact")} · {registration.contact_person} · {registration.contact_phone}</p>
                    <p className="break-words">{t("registration.summary.pincode")} · {registration.pincode}</p>
                    <p className="break-words">
                      {registration.area_label ? `${t("registration.summary.area")} · ${registration.area_label}` : t("registration.areaUnverified")}
                    </p>
                  </div>
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-4 shrink-0 text-accent" />
                  {registration.distribution_center_id
                    ? t("registration.status.approved")
                    : registration.status === "Verified"
                      ? t("registration.status.verified")
                      : t("registration.status.pending")}
                </p>
              </div>
            )}

            {(showRegistrationForm || !registration) && (
              <form onSubmit={submitRegistration} className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  { name: "organization_name", labelKey: "registration.field.orgName", value: registration?.organization_name ?? profile?.organization ?? "", required: true },
                  { name: "registration_80g", labelKey: "registration.field.regId", value: registration?.registration_80g ?? "", required: true },
                  { name: "contact_person", labelKey: "registration.field.contactPerson", value: registration?.contact_person ?? profile?.full_name ?? "", required: true },
                  { name: "contact_phone", labelKey: "registration.field.contactPhone", value: registration?.contact_phone ?? profile?.phone ?? "", required: true },
                  { name: "contact_email", labelKey: "registration.field.contactEmail", value: registration?.contact_email ?? profile?.email ?? "", required: false },
                  { name: "pincode", labelKey: "registration.field.pincode", value: registration?.pincode ?? "", required: true },
                ].map((field) => (
                  <label key={field.name} className="block min-w-0">
                    <span className="label-caps text-muted-foreground">{t(field.labelKey)}</span>
                    <input
                      name={field.name}
                      defaultValue={field.value}
                      required={field.required}
                      className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground"
                    />
                  </label>
                ))}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={savingRegistration}>
                    {savingRegistration ? t("registration.verifying") : registration ? t("registration.save") : t("registration.submit")}
                  </Button>
                  {registrationError && <p className="mt-3 text-xs text-accent">{registrationError}</p>}
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
