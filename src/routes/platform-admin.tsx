import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  Flag,
  HandHeart,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-admin";
import { useDonationsRealtime } from "@/hooks/use-ngo";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight } from "@/hooks/use-stats";
import { supabase } from "@/integrations/supabase/client";
import { displayStatus } from "@/lib/donation-status";
import { useT } from "@/lib/i18n";
import { ROLE_OPTIONS } from "@/lib/roles";
import type { Database, Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/platform-admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Panel | Food Waste Connect" },
      {
        name: "description",
        content: "Platform administration: verification, donations, users and reports.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformAdminPage,
});

type Overview = Database["public"]["Functions"]["admin_overview"]["Returns"][number];
type AdminUser = Database["public"]["Functions"]["admin_list_users"]["Returns"][number];
type NgoRegistration = Tables<"ngo_registrations">;
type VolunteerVerification = Tables<"volunteer_verifications">;
type Donation = Tables<"donations">;
type Report = Tables<"donation_reports">;

const TABS = ["Overview", "NGOs", "Volunteers", "Donations", "Users", "Reports"] as const;
type Tab = (typeof TABS)[number];
const REVIEW_FILTERS = ["Pending", "Verified", "Rejected", "All"] as const;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function num(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Opens a private verification document through a 60-second signed URL (never a public link). */
async function openDocument(path: string) {
  const win = window.open("", "_blank");
  const { data, error } = await supabase.storage
    .from("verification-docs")
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    win?.close();
    window.alert(error?.message ?? "Could not open the document.");
    return;
  }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

function PlatformAdminPage() {
  const t = useT();
  const { user, loading: loadingUser } = useProfile();
  const { isAdmin, loading: loadingAdmin } = useIsAdmin(user?.id);
  const [tab, setTab] = useState<Tab>("Overview");

  if (loadingUser || (user && loadingAdmin)) {
    return (
      <AppShell>
        <PageIntro
          eyebrow="Admin"
          title={<>{t("Admin panel")}</>}
          description="Checking your access…"
        />
      </AppShell>
    );
  }

  if (!user || !isAdmin) {
    return (
      <AppShell>
        <PageIntro
          eyebrow="Admin"
          title={<>{t("Admin panel")}</>}
          description={
            user
              ? "This page is only for platform admins."
              : "Sign in with a platform admin account."
          }
          action={
            !user ? (
              <Button asChild size="wide">
                <Link to="/auth">{t("Sign in")}</Link>
              </Button>
            ) : undefined
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageIntro
        eyebrow="Admin / Platform"
        title={
          <>
            {t("Platform")} <span className="italic">{t("administration.")}</span>
          </>
        }
        description="Verify NGOs and volunteers, review donations and reported listings, and manage users."
      />
      <section className="border-b border-border px-4 py-4 sm:px-8 lg:px-12">
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="tablist"
        >
          {TABS.map((option) => (
            <Button
              key={option}
              role="tab"
              aria-selected={tab === option}
              className="shrink-0"
              variant={tab === option ? "primary" : "outline"}
              onClick={() => setTab(option)}
            >
              {t(option)}
            </Button>
          ))}
        </div>
      </section>
      {tab === "Overview" && <OverviewTab onOpen={setTab} />}
      {tab === "NGOs" && <NgoTab />}
      {tab === "Volunteers" && <VolunteerTab />}
      {tab === "Donations" && <DonationsTab />}
      {tab === "Users" && <UsersTab currentUserId={user.id} />}
      {tab === "Reports" && <ReportsTab />}
    </AppShell>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">{children}</section>
  );
}

function Message({ text, tone = "muted" }: { text: string | null; tone?: "muted" | "error" }) {
  if (!text) return null;
  return (
    <p className={`mt-4 text-sm ${tone === "error" ? "text-accent" : "text-muted-foreground"}`}>
      {text}
    </p>
  );
}

/** A button that asks for a reason / note before running the action. */
function ReasonAction({
  label,
  placeholder,
  required,
  variant = "outline",
  disabled,
  onConfirm,
}: {
  label: string;
  placeholder: string;
  required: boolean;
  variant?: "outline" | "primary";
  disabled?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (required && !reason.trim()) return;
        void Promise.resolve(onConfirm(reason.trim())).then(() => {
          setOpen(false);
          setReason("");
        });
      }}
    >
      <input
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={300}
        className="h-11 min-w-0 flex-1 border-b border-input bg-transparent text-sm outline-none focus:border-foreground"
      />
      <Button type="submit" disabled={disabled}>
        {label}
      </Button>
      <Button type="button" variant="outline" onClick={() => setOpen(false)}>
        {t("Cancel")}
      </Button>
    </form>
  );
}

function OverviewTab({ onOpen }: { onOpen: (tab: Tab) => void }) {
  const t = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: rows, error: rpcError } = await supabase.rpc("admin_overview");
    setError(rpcError?.message ?? null);
    setData(((rows as Overview[] | null) ?? [])[0] ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useDonationsRealtime(() => void load());

  if (!data)
    return (
      <Panel>
        <Message text={error ?? t("Loading…")} tone={error ? "error" : "muted"} />
      </Panel>
    );

  const tiles: { label: string; value: string; hint: string; icon: typeof Users; tab?: Tab }[] = [
    {
      label: "Users",
      value: formatCount(num(data.total_users)),
      hint: t("{donors} donors · {ngos} NGOs · {vols} volunteers", {
        donors: formatCount(num(data.donors)),
        ngos: formatCount(num(data.ngo_accounts)),
        vols: formatCount(num(data.volunteer_accounts)),
      }),
      icon: Users,
      tab: "Users",
    },
    {
      label: "NGO verification",
      value: formatCount(num(data.ngo_pending)),
      hint: t("pending · {verified} verified · {rejected} rejected", {
        verified: formatCount(num(data.ngo_verified)),
        rejected: formatCount(num(data.ngo_rejected)),
      }),
      icon: ShieldCheck,
      tab: "NGOs",
    },
    {
      label: "Volunteer verification",
      value: formatCount(num(data.volunteer_pending)),
      hint: t("pending · {verified} verified · {rejected} rejected", {
        verified: formatCount(num(data.volunteer_verified)),
        rejected: formatCount(num(data.volunteer_rejected)),
      }),
      icon: UserRound,
      tab: "Volunteers",
    },
    {
      label: "Open reports",
      value: formatCount(num(data.open_reports)),
      hint: t("Reported listings waiting for review"),
      icon: Flag,
      tab: "Reports",
    },
    {
      label: "Donations",
      value: formatCount(num(data.donations_total)),
      hint: t("{kg} kg donated in total", { kg: formatWeight(num(data.food_donated_kg)) }),
      icon: HandHeart,
      tab: "Donations",
    },
    {
      label: "Completed pickups",
      value: formatCount(num(data.donations_completed)),
      hint: t("{kg} kg saved · {people} people fed", {
        kg: formatWeight(num(data.food_saved_kg)),
        people: formatCount(num(data.people_fed)),
      }),
      icon: Truck,
      tab: "Donations",
    },
  ];
  const breakdown = [
    ["Available", data.donations_available],
    ["Claimed", data.donations_claimed],
    ["Pickup Started", data.donations_in_pickup],
    ["Picked Up", data.donations_picked_up],
    ["Completed", data.donations_completed],
    ["Expired", data.donations_expired],
  ] as const;
  const total = Math.max(1, num(data.donations_total));

  return (
    <>
      <section className="grid gap-px border-b border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ label, value, hint, icon: Icon, tab }) => (
          <button
            key={label}
            type="button"
            onClick={() => tab && onOpen(tab)}
            className="min-w-0 bg-background p-5 text-left transition-colors hover:bg-muted/40 sm:p-7"
          >
            <p className="label-caps flex items-center gap-2 text-muted-foreground">
              <Icon className="size-4 text-accent" />
              {t(label)}
            </p>
            <p className="mt-4 font-display text-3xl sm:text-4xl">{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
          </button>
        ))}
      </section>
      <Panel>
        <h2 className="label-caps">{t("Donations by status")}</h2>
        <div className="mt-5 space-y-3">
          {breakdown.map(([label, count]) => (
            <div
              key={label}
              className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm"
            >
              <span className="truncate">{t(label)}</span>
              <span className="h-2 bg-muted">
                <span
                  className="block h-2 bg-primary"
                  style={{ width: `${(num(count) / total) * 100}%` }}
                />
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {formatCount(num(count))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          {t("{admins} admins · {suspended} suspended accounts", {
            admins: formatCount(num(data.admins)),
            suspended: formatCount(num(data.suspended)),
          })}
        </p>
      </Panel>
    </>
  );
}

function ReviewFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: (typeof REVIEW_FILTERS)[number]) => void;
}) {
  const t = useT();
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {REVIEW_FILTERS.map((option) => (
        <Button
          key={option}
          className="h-9 shrink-0 px-3 text-xs"
          variant={value === option ? "primary" : "outline"}
          onClick={() => onChange(option)}
        >
          {t(option)}
        </Button>
      ))}
    </div>
  );
}

function ReviewActions({
  status,
  working,
  onSet,
}: {
  status: string;
  working: boolean;
  onSet: (status: "Pending" | "Verified" | "Rejected", reason?: string) => Promise<void>;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "Verified" && (
        <Button disabled={working} onClick={() => void onSet("Verified")}>
          <ShieldCheck className="size-4" />
          {t("Verify")}
        </Button>
      )}
      {status !== "Rejected" && (
        <ReasonAction
          label={t("Reject")}
          placeholder={t("Reason for rejection (shown to the user)")}
          required
          disabled={working}
          onConfirm={(reason) => onSet("Rejected", reason)}
        />
      )}
      {status !== "Pending" && (
        <Button variant="outline" disabled={working} onClick={() => void onSet("Pending")}>
          {t("Mark pending")}
        </Button>
      )}
    </div>
  );
}

function NgoTab() {
  const t = useT();
  const [filter, setFilter] = useState<(typeof REVIEW_FILTERS)[number]>("Pending");
  const [rows, setRows] = useState<NgoRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let query = supabase
      .from("ngo_registrations")
      .select("*")
      .order("created_at", { ascending: false });
    if (filter !== "All") query = query.eq("status", filter);
    const { data, error: loadError } = await query;
    setError(loadError?.message ?? null);
    setRows((data as NgoRegistration[] | null) ?? []);
    setLoading(false);
  }, [filter]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function setStatus(id: string, status: string, reason?: string) {
    setWorking(id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_set_ngo_status", {
      p_registration_id: id,
      p_status: status,
      ...(reason ? { p_reason: reason } : {}),
    });
    setWorking(null);
    if (rpcError) setError(rpcError.message);
    await load();
  }

  return (
    <Panel>
      <ReviewFilter value={filter} onChange={setFilter} />
      <Message text={error} tone="error" />
      {loading ? (
        <Message text={t("Loading…")} />
      ) : rows.length === 0 ? (
        <Message text={t("No NGO registrations here.")} />
      ) : (
        <div className="mt-5 grid gap-px bg-border">
          {rows.map((row) => (
            <article
              key={row.id}
              className="grid gap-4 bg-background p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-display text-2xl break-words">{row.organization_name}</p>
                  <StatusBadge value={row.status} />
                </div>
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <p className="break-words">
                    {t("80G certificate")} · {row.registration_80g}
                  </p>
                  <p className="break-words">
                    {t("Registration number")} · {row.registration_number || "—"}
                  </p>
                  <p className="break-words">
                    {t("Contact")} · {row.contact_person} · {row.contact_phone}
                    {row.contact_email ? ` · ${row.contact_email}` : ""}
                  </p>
                  <p className="break-words">
                    {t("Operating pincode")} · {row.pincode}
                    {row.area_label ? ` (${row.area_label})` : ` (${t("not located")})`}
                  </p>
                  <p>
                    {t("Submitted")} · {formatDate(row.created_at)}
                  </p>
                  <p>
                    {t("Reviewed")} · {formatDate(row.reviewed_at)}
                  </p>
                  {row.rejection_reason && (
                    <p className="break-words sm:col-span-2">
                      {t("Reason")} · {row.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="mt-3">
                  {row.document_path ? (
                    <Button
                      variant="outline"
                      className="h-9 px-3 text-xs"
                      onClick={() => void openDocument(row.document_path!)}
                    >
                      <FileText className="size-3.5" />
                      {t("View document")} ({row.document_name ?? "file"})
                    </Button>
                  ) : (
                    <span className="text-xs text-accent">
                      {t("No verification document uploaded")}
                    </span>
                  )}
                </div>
              </div>
              <ReviewActions
                status={row.status}
                working={working === row.id}
                onSet={(status, reason) => setStatus(row.id, status, reason)}
              />
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function VolunteerTab() {
  const t = useT();
  const [filter, setFilter] = useState<(typeof REVIEW_FILTERS)[number]>("Pending");
  const [rows, setRows] = useState<VolunteerVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let query = supabase
      .from("volunteer_verifications")
      .select("*")
      .order("updated_at", { ascending: false });
    if (filter !== "All") query = query.eq("status", filter);
    const { data, error: loadError } = await query;
    setError(loadError?.message ?? null);
    setRows((data as VolunteerVerification[] | null) ?? []);
    setLoading(false);
  }, [filter]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function setStatus(userId: string, status: string, reason?: string) {
    setWorking(userId);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_set_volunteer_status", {
      p_user_id: userId,
      p_status: status,
      ...(reason ? { p_reason: reason } : {}),
    });
    setWorking(null);
    if (rpcError) setError(rpcError.message);
    await load();
  }

  return (
    <Panel>
      <ReviewFilter value={filter} onChange={setFilter} />
      <Message text={error} tone="error" />
      {loading ? (
        <Message text={t("Loading…")} />
      ) : rows.length === 0 ? (
        <Message text={t("No volunteer verifications here.")} />
      ) : (
        <div className="mt-5 grid gap-px bg-border">
          {rows.map((row) => (
            <article
              key={row.user_id}
              className="grid gap-4 bg-background p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-display text-2xl break-words">{row.full_name}</p>
                  <StatusBadge value={row.status} />
                </div>
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <p className="break-words">
                    {t("Contact")} · {row.contact_phone}
                  </p>
                  <p className="break-words">
                    {t("Area")} · {row.area}
                    {row.pincode ? `, ${row.pincode}` : ""}
                  </p>
                  <p>
                    {t("ID")} · {t(row.id_type)} ••••{row.id_last4}
                  </p>
                  <p>
                    {t("Submitted")} · {formatDate(row.created_at)}
                  </p>
                  {row.rejection_reason && (
                    <p className="break-words sm:col-span-2">
                      {t("Reason")} · {row.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="mt-3">
                  {row.document_path ? (
                    <Button
                      variant="outline"
                      className="h-9 px-3 text-xs"
                      onClick={() => void openDocument(row.document_path!)}
                    >
                      <FileText className="size-3.5" />
                      {t("View document")} ({row.document_name ?? "file"})
                    </Button>
                  ) : (
                    <span className="text-xs text-accent">
                      {t("No verification document uploaded")}
                    </span>
                  )}
                </div>
              </div>
              <ReviewActions
                status={row.status}
                working={working === row.user_id}
                onSet={(status, reason) => setStatus(row.user_id, status, reason)}
              />
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

const DONATION_FILTERS = [
  "All",
  "Available",
  "Claimed",
  "Pickup in Progress",
  "Picked Up",
  "Completed",
  "Expired",
] as const;

function DonationsTab() {
  const t = useT();
  const [filter, setFilter] = useState<(typeof DONATION_FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("donations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setError(loadError?.message ?? null);
    setRows((data as Donation[] | null) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useDonationsRealtime(() => void load());

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "All" && displayStatus(row) !== filter && row.status !== filter) return false;
      if (!term) return true;
      return [row.food_type, row.food_name, row.pickup_address, row.quantity].some((value) =>
        (value ?? "").toLowerCase().includes(term),
      );
    });
  }, [rows, filter, search]);

  async function remove(id: string, reason: string) {
    setWorking(id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_remove_donation", {
      p_donation_id: id,
      p_reason: reason,
    });
    setWorking(null);
    if (rpcError) setError(rpcError.message);
    await load();
  }

  return (
    <Panel>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {DONATION_FILTERS.map((option) => (
            <Button
              key={option}
              className="h-9 shrink-0 px-3 text-xs"
              variant={filter === option ? "primary" : "outline"}
              onClick={() => setFilter(option)}
            >
              {t(option === "Pickup in Progress" ? "Pickup Started" : option)}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 border-b border-input">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search food or location")}
            className="h-10 w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      <Message text={error} tone="error" />
      <p className="mt-3 text-xs text-muted-foreground">
        {t("{count} donations", { count: visible.length })}
      </p>
      {loading ? (
        <Message text={t("Loading…")} />
      ) : (
        <div className="mt-4 grid gap-px bg-border">
          {visible.map((row) => (
            <article
              key={row.id}
              className="grid gap-3 bg-background p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={displayStatus(row)} />
                  <Link
                    to="/donation/$donationId"
                    params={{ donationId: row.id }}
                    className="font-medium break-words hover:underline"
                  >
                    {row.food_type}
                    {row.food_name ? ` · ${row.food_name}` : ""}
                  </Link>
                </div>
                <p className="mt-2 text-xs break-words text-muted-foreground">
                  {row.quantity}
                  {row.weight_kg != null ? ` · ${row.weight_kg} kg` : ""} ·{" "}
                  {row.pickup_address || "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("Posted")} {formatDate(row.created_at)}
                  {row.claimed_at
                    ? ` · ${t("Claimed {time}", { time: formatDate(row.claimed_at) })}`
                    : ""}
                  {row.completed_at ? ` · ${t("Completed")} ${formatDate(row.completed_at)}` : ""}
                </p>
              </div>
              <ReasonAction
                label={t("Remove listing")}
                placeholder={t("Reason (sent to the donor)")}
                required
                disabled={working === row.id}
                onConfirm={(reason) => remove(row.id, reason)}
              />
            </article>
          ))}
          {visible.length === 0 && (
            <p className="bg-background p-5 text-sm text-muted-foreground">
              {t("No donations match.")}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc(
      "admin_list_users",
      query ? { p_search: query } : {},
    );
    setError(rpcError?.message ?? null);
    setRows((data as AdminUser[] | null) ?? []);
    setLoading(false);
  }, [query]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function run(id: string, action: () => PromiseLike<{ error: { message: string } | null }>) {
    setWorking(id);
    setError(null);
    const { error: rpcError } = await action();
    setWorking(null);
    if (rpcError) setError(rpcError.message);
    await load();
  }

  return (
    <Panel>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 border-b border-input">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search name, email or organization")}
            className="h-11 w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <Button type="submit">{t("Search")}</Button>
      </form>
      <Message text={error} tone="error" />
      {loading ? (
        <Message text={t("Loading…")} />
      ) : (
        <div className="mt-5 grid gap-px bg-border">
          {rows.map((row) => {
            const busy = working === row.id;
            const self = row.id === currentUserId;
            return (
              <article
                key={row.id}
                className="grid gap-3 bg-background p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium break-words">
                      {row.full_name || row.email || t("Member")}
                    </p>
                    {row.is_admin && <StatusBadge value="Admin" />}
                    {row.suspended && <StatusBadge value="Suspended" />}
                    {row.ngo_status && (
                      <span className="text-xs text-muted-foreground">
                        NGO: {t(row.ngo_status)}
                      </span>
                    )}
                    {row.volunteer_status && (
                      <span className="text-xs text-muted-foreground">
                        {t("Volunteer")}: {t(row.volunteer_status)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs break-words text-muted-foreground">
                    {row.email ?? "—"}
                    {row.phone ? ` · ${row.phone}` : ""}
                    {row.organization ? ` · ${row.organization}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Joined")} {formatDate(row.created_at)} ·{" "}
                    {t("{count} donations posted", { count: num(row.donations_posted) })} ·{" "}
                    {t("{count} pickups claimed", { count: num(row.pickups_claimed) })}
                  </p>
                  {row.suspended && row.suspension_reason && (
                    <p className="mt-1 text-xs text-accent">
                      {t("Reason")}: {row.suspension_reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={t("Role")}
                    value={
                      (ROLE_OPTIONS as readonly string[]).includes(row.role ?? "")
                        ? (row.role ?? "")
                        : ""
                    }
                    disabled={busy}
                    onChange={(event) =>
                      void run(row.id, () =>
                        supabase.rpc("admin_set_user_role", {
                          p_user_id: row.id,
                          p_role: event.target.value,
                        }),
                      )
                    }
                    className="h-11 border border-input bg-transparent px-3 text-sm outline-none focus:border-foreground"
                  >
                    <option value="" disabled>
                      {row.role || t("No role")}
                    </option>
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(option)}
                      </option>
                    ))}
                  </select>
                  {!self &&
                    (row.suspended ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(row.id, () =>
                            supabase.rpc("admin_set_suspension", {
                              p_user_id: row.id,
                              p_suspend: false,
                            }),
                          )
                        }
                      >
                        {t("Unsuspend")}
                      </Button>
                    ) : (
                      <ReasonAction
                        label={t("Suspend")}
                        placeholder={t("Reason for suspension")}
                        required
                        disabled={busy}
                        onConfirm={(reason) =>
                          run(row.id, () =>
                            supabase.rpc("admin_set_suspension", {
                              p_user_id: row.id,
                              p_suspend: true,
                              p_reason: reason,
                            }),
                          )
                        }
                      />
                    ))}
                  {!self && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !row.is_admin &&
                          !window.confirm(t("Give this user full admin access?"))
                        )
                          return;
                        void run(row.id, () =>
                          supabase.rpc("admin_set_admin", {
                            p_user_id: row.id,
                            p_make_admin: !row.is_admin,
                          }),
                        );
                      }}
                    >
                      {row.is_admin ? t("Remove admin") : t("Make admin")}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          {rows.length === 0 && (
            <p className="bg-background p-5 text-sm text-muted-foreground">
              {t("No users found.")}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

const REPORT_FILTERS = ["Open", "Resolved", "Dismissed", "All"] as const;

function ReportsTab() {
  const t = useT();
  const [filter, setFilter] = useState<(typeof REPORT_FILTERS)[number]>("Open");
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let query = supabase
      .from("donation_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (filter !== "All") query = query.eq("status", filter);
    const { data, error: loadError } = await query;
    setError(loadError?.message ?? null);
    setRows((data as Report[] | null) ?? []);
    setLoading(false);
  }, [filter]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function review(id: string, status: "Resolved" | "Dismissed" | "Open", note: string) {
    setWorking(id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_review_report", {
      p_report_id: id,
      p_status: status,
      ...(note ? { p_note: note } : {}),
    });
    setWorking(null);
    if (rpcError) setError(rpcError.message);
    await load();
  }

  async function removeListing(report: Report, reason: string) {
    if (!report.donation_id) return;
    setWorking(report.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_remove_donation", {
      p_donation_id: report.donation_id,
      p_reason: reason,
    });
    setWorking(null);
    if (rpcError) setError(rpcError.message);
    await load();
  }

  return (
    <Panel>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {REPORT_FILTERS.map((option) => (
          <Button
            key={option}
            className="h-9 shrink-0 px-3 text-xs"
            variant={filter === option ? "primary" : "outline"}
            onClick={() => setFilter(option)}
          >
            {t(option)}
          </Button>
        ))}
      </div>
      <Message text={error} tone="error" />
      {loading ? (
        <Message text={t("Loading…")} />
      ) : rows.length === 0 ? (
        <Message text={t("No reports here.")} />
      ) : (
        <div className="mt-5 grid gap-px bg-border">
          {rows.map((row) => {
            const busy = working === row.id;
            return (
              <article key={row.id} className="grid gap-3 bg-background p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={row.status} />
                  <p className="font-medium">{t(row.reason)}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(row.created_at)}
                  </span>
                </div>
                <p className="text-sm break-words">
                  {row.donation_id ? (
                    <Link
                      to="/donation/$donationId"
                      params={{ donationId: row.donation_id }}
                      className="underline"
                    >
                      {row.donation_label ?? t("View listing")}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      {row.donation_label ?? "—"} ({t("listing removed")})
                    </span>
                  )}
                </p>
                {row.details && (
                  <p className="text-sm break-words text-muted-foreground">“{row.details}”</p>
                )}
                {row.admin_note && (
                  <p className="text-xs break-words text-muted-foreground">
                    {t("Admin note")}: {row.admin_note}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {row.status === "Open" ? (
                    <>
                      <ReasonAction
                        label={t("Resolve")}
                        placeholder={t("Note (optional)")}
                        required={false}
                        variant="primary"
                        disabled={busy}
                        onConfirm={(note) => review(row.id, "Resolved", note)}
                      />
                      <ReasonAction
                        label={t("Dismiss")}
                        placeholder={t("Note (optional)")}
                        required={false}
                        disabled={busy}
                        onConfirm={(note) => review(row.id, "Dismissed", note)}
                      />
                      {row.donation_id && (
                        <ReasonAction
                          label={t("Remove listing")}
                          placeholder={t("Reason (sent to the donor)")}
                          required
                          disabled={busy}
                          onConfirm={(reason) => removeListing(row, reason)}
                        />
                      )}
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void review(row.id, "Open", "")}
                    >
                      {t("Reopen")}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
