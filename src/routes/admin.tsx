import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Building2, ClipboardList, Package, Receipt, ShieldCheck, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useDonationsRealtime, useNgoRegistration, useNgoStats } from "@/hooks/use-ngo";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { displayStatus, isExpiredDonation } from "@/lib/donation-status";
import { adminStage, nextAdminAction } from "@/lib/ngo-status";
import { formatCount, formatWeight } from "@/hooks/use-stats";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [
    { title: "NGO Admin Portal | Food Waste Connect" },
    { name: "description", content: "Manage incoming surplus food requests, update pickup statuses and track distribution impact for your organization." },
    { property: "og:title", content: "NGO Admin Portal | Food Waste Connect" },
    { property: "og:description", content: "Registration, verification and live claim management for receiving organizations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AdminPage,
});

type Donation = Tables<"donations">;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function AdminPage() {
  const { user, profile } = useProfile();
  const { registration, loading: loadingRegistration, saving, error: registrationError, save } = useNgoRegistration(user?.id);
  const { stats, reload: reloadStats } = useNgoStats(Boolean(user));

  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("donations").select("*").order("created_at", { ascending: false });
    setDonations((data as Donation[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
    void reloadStats();
  }, [load, reloadStats]);

  useDonationsRealtime(refresh);

  const incoming = useMemo(
    () => donations.filter((item) => item.status === "Available" && !isExpiredDonation(item)),
    [donations],
  );
  const mine = useMemo(() => donations.filter((item) => user != null && item.claimed_by === user.id), [donations, user]);

  async function accept(donationId: string) {
    setActionError(null);
    setWorking(donationId);
    const { error } = await supabase.rpc("claim_donation", { p_donation_id: donationId });
    setWorking(null);
    if (error) setActionError(error.message);
    refresh();
  }

  async function advance(donationId: string, statuses: string[]) {
    setActionError(null);
    setWorking(donationId);
    for (const status of statuses) {
      const { error } = await supabase.rpc("advance_donation_status", { p_donation_id: donationId, p_status: status });
      if (error) {
        setActionError(error.message);
        break;
      }
    }
    setWorking(null);
    refresh();
  }

  function printReceipt(item: Donation) {
    const rows: Array<[string, string]> = [
      ["Receipt number", `FWC-${item.id.slice(0, 8).toUpperCase()}`],
      ["Issued", new Date().toLocaleString()],
      ["Organization", registration?.organization_name ?? profile?.organization ?? profile?.full_name ?? "—"],
      ["80G certificate", registration?.registration_80g ?? "—"],
      ["Contact person", registration?.contact_person ?? profile?.full_name ?? "—"],
      ["Food item", item.food_type],
      ["Dietary", item.diet],
      ["Quantity", item.quantity],
      ["People served", item.servings != null ? String(item.servings) : "—"],
      ["Weight", item.weight_kg != null ? `${item.weight_kg} kg` : "—"],
      ["Pickup address", item.pickup_address],
      ["Claimed at", formatDate(item.claimed_at)],
      ["Completed at", formatDate(item.completed_at)],
      ["Status", adminStage(item.status)],
    ];
    const escape = (value: string) => value.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
    const html = `<!doctype html><html><head><title>Pickup receipt ${escape(item.id.slice(0, 8))}</title>
      <style>body{font-family:ui-sans-serif,system-ui,sans-serif;padding:40px;color:#111}h1{font-size:20px;margin:0 0 4px}
      p.sub{color:#666;font-size:12px;margin:0 0 24px}table{width:100%;border-collapse:collapse;font-size:13px}
      td{padding:8px 0;border-bottom:1px solid #eee;vertical-align:top}td.k{color:#666;width:40%}</style></head>
      <body><h1>Food Waste Connect — Pickup receipt</h1><p class="sub">Generated from live donation records.</p>
      <table>${rows.map(([k, v]) => `<tr><td class="k">${escape(k)}</td><td>${escape(v)}</td></tr>`).join("")}</table>
      </body></html>`;
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) {
      setActionError("Allow pop-ups to generate the receipt.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await save({
      organization_name: String(form.get("organization_name") ?? "").trim(),
      registration_80g: String(form.get("registration_80g") ?? "").trim(),
      contact_person: String(form.get("contact_person") ?? "").trim(),
      contact_phone: String(form.get("contact_phone") ?? "").trim(),
      contact_email: String(form.get("contact_email") ?? "").trim(),
      pincode: String(form.get("pincode") ?? "").trim(),
    });
    setShowForm(false);
  }

  const metrics = [
    { label: "Total food claimed", value: `${formatWeight(stats.food_claimed_kg)} kg`, hint: `${formatCount(stats.meals_claimed)} meals claimed`, icon: Package },
    { label: "Active distributions", value: formatCount(stats.active_distributions), hint: "Accepted, not yet delivered", icon: Truck },
    { label: "Pending pickups", value: formatCount(stats.pending_pickups), hint: "Awaiting collection", icon: ClipboardList },
    { label: "Impact analytics", value: `${formatCount(stats.people_served)} people`, hint: `${formatCount(stats.delivered)} deliveries completed`, icon: BadgeCheck },
  ];

  if (!user) {
    return (
      <AppShell>
        <PageIntro eyebrow="NGO / Admin portal" title={<>Organization <span className="italic">control room.</span></>} description="Sign in with your organization account to manage incoming surplus food requests." />
        <section className="px-4 py-10 sm:px-8 lg:px-12">
          <Button asChild><Link to="/auth">Sign in</Link></Button>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageIntro
        eyebrow="NGO / Admin portal"
        title={<>Organization <span className="italic">control room.</span></>}
        description="Live metrics, incoming surplus food requests and pickup management for your registered organization."
        action={
          <Button variant="outline" onClick={() => setShowForm((open) => !open)}>
            <Building2 className="size-4" />
            {registration ? "Edit registration" : "Register your NGO"}
          </Button>
        }
      />

      <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
        {loadingRegistration ? (
          <p className="text-sm text-muted-foreground">Loading registration…</p>
        ) : registration ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="truncate font-display text-2xl">{registration.organization_name}</p>
                <StatusBadge value={registration.status} />
              </div>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <p className="break-words">80G certificate · {registration.registration_80g}</p>
                <p className="break-words">Contact · {registration.contact_person} · {registration.contact_phone}</p>
                <p className="break-words">Operating pincode · {registration.pincode}</p>
                <p className="break-words">
                  {registration.area_label
                    ? `Verified area · ${registration.area_label}`
                    : "Area not verified yet — the pincode could not be located."}
                </p>
              </div>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-accent" />
              {registration.status === "Verified" ? "Location verified" : "Verification pending"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No organization registered on this account yet.</p>
        )}

        {(showForm || (!registration && !loadingRegistration)) && (
          <form onSubmit={submitRegistration} className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { name: "organization_name", label: "Organization name", value: registration?.organization_name ?? "", required: true },
              { name: "registration_80g", label: "80G certificate number", value: registration?.registration_80g ?? "", required: true },
              { name: "contact_person", label: "Contact person", value: registration?.contact_person ?? profile?.full_name ?? "", required: true },
              { name: "contact_phone", label: "Contact phone", value: registration?.contact_phone ?? profile?.phone ?? "", required: true },
              { name: "contact_email", label: "Contact email", value: registration?.contact_email ?? profile?.email ?? "", required: false },
              { name: "pincode", label: "Operating pincode", value: registration?.pincode ?? "", required: true },
            ].map((field) => (
              <label key={field.name} className="block min-w-0">
                <span className="label-caps text-muted-foreground">{field.label}</span>
                <input
                  name={field.name}
                  defaultValue={field.value}
                  required={field.required}
                  className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground"
                />
              </label>
            ))}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Verifying location…" : registration ? "Save registration" : "Register organization"}</Button>
              {registrationError && <p className="mt-3 text-xs text-accent">{registrationError}</p>}
            </div>
          </form>
        )}
      </section>

      <section className="grid gap-px border-b border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, hint, icon: Icon }) => (
          <article key={label} className="bg-background p-5 sm:p-7">
            <p className="label-caps flex items-center gap-2 text-muted-foreground"><Icon className="size-4 text-accent" />{label}</p>
            <p className="mt-4 font-display text-3xl sm:text-4xl">{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
          </article>
        ))}
      </section>

      {actionError && <p className="border-b border-border px-4 py-4 text-sm text-accent sm:px-8 lg:px-12">{actionError}</p>}

      <ManagementTable
        title="Incoming surplus food requests"
        empty="No open requests right now."
        rows={incoming}
        loading={loading}
        working={working}
        onAccept={accept}
        onAdvance={advance}
        onReceipt={printReceipt}
      />

      <ManagementTable
        title="Your distributions"
        empty="No claims yet."
        rows={mine}
        loading={loading}
        working={working}
        onAccept={accept}
        onAdvance={advance}
        onReceipt={printReceipt}
      />
    </AppShell>
  );
}

function ManagementTable({
  title,
  empty,
  rows,
  loading,
  working,
  onAccept,
  onAdvance,
  onReceipt,
}: {
  title: string;
  empty: string;
  rows: Donation[];
  loading: boolean;
  working: string | null;
  onAccept: (id: string) => void;
  onAdvance: (id: string, statuses: string[]) => void;
  onReceipt: (item: Donation) => void;
}) {
  return (
    <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="label-caps truncate text-foreground">{title}</h2>
        <span className="shrink-0 text-xs text-muted-foreground">{rows.length}</span>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading requests…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-5 grid gap-px bg-border">
          {rows.map((item) => {
            const status = displayStatus(item);
            const action = nextAdminAction(status);
            return (
              <article key={item.id} className="grid gap-4 bg-background p-4 sm:p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <Link to="/donation/$donationId" params={{ donationId: item.id }} className="block truncate font-medium hover:underline">
                    {item.food_type}
                  </Link>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.quantity} · {item.diet}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{item.pickup_address || "Location not available"}</p>
                </div>
                <div className="min-w-0 text-xs text-muted-foreground">
                  <StatusBadge value={adminStage(status)} />
                  <p className="mt-2">Requested {formatDate(item.created_at)}</p>
                  <p>Pickup by {formatDate(item.pickup_deadline)}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {action && (
                    <Button
                      variant="primary"
                      disabled={working === item.id}
                      onClick={() => (action.kind === "claim" ? onAccept(item.id) : onAdvance(item.id, action.statuses))}
                    >
                      {working === item.id ? "Updating…" : action.label}
                    </Button>
                  )}
                  {item.status === "Completed" && (
                    <Button variant="outline" onClick={() => onReceipt(item)}>
                      <Receipt className="size-4" />
                      Receipt
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
