import { Link } from "@tanstack/react-router";
import { Award, BadgeCheck, ClipboardList, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-admin";
import { useNgoRegistration } from "@/hooks/use-ngo";
import { formatCount, formatWeight } from "@/hooks/use-stats";
import { useMyVerification, useVolunteerVerification } from "@/hooks/use-verification";
import { supabase } from "@/integrations/supabase/client";
import { displayStatus } from "@/lib/donation-status";
import { useT } from "@/lib/i18n";
import { roleKind } from "@/lib/roles";
import type { Tables } from "@/integrations/supabase/types";

type Donation = Tables<"donations">;
type Badge = { badge: string; detail: string };

const ID_TYPES = ["Aadhaar", "PAN", "Voter ID", "Driving Licence", "Passport", "Other"] as const;

const fieldClass =
  "mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground";

/** Small "Verified" mark shown next to verified NGOs / volunteers. */
export function VerifiedMark({ label }: { label: string }) {
  return (
    <span className="label-caps inline-flex items-center gap-1 rounded-sm bg-primary/10 px-2 py-1 text-primary">
      <BadgeCheck className="size-3.5" />
      {label}
    </span>
  );
}

/**
 * Extra profile sections, below the existing profile: verification (volunteers), verified badge,
 * admin access, badges and the user's own activity.
 */
export function ProfileExtras({
  userId,
  role,
  defaults,
}: {
  userId: string;
  role: string | null | undefined;
  defaults: { full_name: string; phone: string; area: string };
}) {
  const t = useT();
  const kind = roleKind(role);
  const isVolunteer = /volunteer/i.test(role ?? "");
  const { isAdmin } = useIsAdmin(userId);
  const verification = useMyVerification(userId);
  const { registration } = useNgoRegistration(kind === "Receiver" && !isVolunteer ? userId : null);

  return (
    <>
      {(verification.suspended || isAdmin || (kind === "Receiver" && verification.verified)) && (
        <section className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-5 sm:px-8 lg:px-10">
          {verification.suspended && (
            <p className="flex items-center gap-2 text-sm text-accent">
              <ShieldAlert className="size-4 shrink-0" />
              {t(
                "Your account is suspended. You can't post or claim food. Contact the platform admin.",
              )}
            </p>
          )}
          {kind === "Receiver" && verification.verified && (
            <VerifiedMark
              label={
                verification.ngoStatus === "Verified" ? t("Verified NGO") : t("Verified volunteer")
              }
            />
          )}
          {isAdmin && (
            <>
              <VerifiedMark label={t("Platform admin")} />
              <Link to="/platform-admin" className="text-xs underline">
                {t("Open admin panel")}
              </Link>
            </>
          )}
        </section>
      )}

      {kind === "Receiver" && !isVolunteer && (
        <section className="border-t border-border px-4 py-6 sm:px-8 lg:px-10">
          <h2 className="label-caps flex items-center gap-2">
            <ShieldCheck className="size-4 text-accent" />
            {t("NGO verification")}
          </h2>
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {registration ? (
              <StatusBadge value={registration.status} />
            ) : (
              <span className="text-muted-foreground">{t("Not registered yet.")}</span>
            )}
            {registration?.status === "Rejected" && registration.rejection_reason && (
              <span className="text-xs text-muted-foreground">
                {t("Reason")}: {registration.rejection_reason}
              </span>
            )}
            <Link to="/admin" className="text-xs underline">
              {registration ? t("Open NGO portal") : t("Register your NGO")}
            </Link>
          </p>
        </section>
      )}

      {isVolunteer && (
        <VolunteerVerificationSection
          userId={userId}
          defaults={defaults}
          onSaved={verification.reload}
        />
      )}

      <BadgesAndActivity userId={userId} />
    </>
  );
}

function VolunteerVerificationSection({
  userId,
  defaults,
  onSaved,
}: {
  userId: string;
  defaults: { full_name: string; phone: string; area: string };
  onSaved: () => void;
}) {
  const t = useT();
  const { record, loading, saving, error, save } = useVolunteerVerification(userId);
  const [editing, setEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const showForm = editing || (!loading && !record);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const form = new FormData(event.currentTarget);
    const last4 = String(form.get("id_last4") ?? "").trim();
    if (!/^[0-9A-Za-z]{4}$/.test(last4)) {
      setLocalError(t("Enter only the last 4 characters of your ID number."));
      return;
    }
    const pincode = String(form.get("pincode") ?? "").trim();
    if (pincode && !/^[0-9]{6}$/.test(pincode)) {
      setLocalError(t("Pincode must be 6 digits."));
      return;
    }
    const file = form.get("document");
    const ok = await save(
      {
        full_name: String(form.get("full_name") ?? "").trim(),
        contact_phone: String(form.get("contact_phone") ?? "").trim(),
        area: String(form.get("area") ?? "").trim(),
        pincode: pincode || null,
        id_type: String(form.get("id_type") ?? "Other"),
        id_last4: last4.toUpperCase(),
      },
      file instanceof File && file.size > 0 ? file : null,
    );
    if (ok) {
      setEditing(false);
      onSaved();
    }
  }

  return (
    <section className="border-t border-border px-4 py-6 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label-caps flex items-center gap-2">
          <ShieldCheck className="size-4 text-accent" />
          {t("Volunteer verification")}
        </h2>
        {record && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {record.status === "Rejected" ? t("Update and resubmit") : t("Edit details")}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("Loading…")}</p>
      ) : record && !editing ? (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge value={record.status} />
            {record.status === "Verified" && <VerifiedMark label={t("Verified volunteer")} />}
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <p className="break-words">
              {t("Name")} · {record.full_name}
            </p>
            <p className="break-words">
              {t("Contact")} · {record.contact_phone}
            </p>
            <p className="break-words">
              {t("Area")} · {record.area}
              {record.pincode ? `, ${record.pincode}` : ""}
            </p>
            <p className="break-words">
              {t("ID")} · {t(record.id_type)} ••••{record.id_last4}
            </p>
            <p className="break-words">
              {t("Verification document")} ·{" "}
              {record.document_name
                ? t("uploaded ({name})", { name: record.document_name })
                : t("not uploaded yet")}
            </p>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {record.status === "Verified"
              ? t("You're verified and can claim food.")
              : record.status === "Rejected"
                ? `${t("Reason")}: ${record.rejection_reason ?? "—"}. ${t("Update your details to resubmit.")}`
                : t(
                    "An admin will review your details. Claiming food unlocks once you're verified.",
                  )}
          </p>
        </div>
      ) : null}

      {showForm && (
        <form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="label-caps text-muted-foreground">{t("Full name (as on ID)")}</span>
            <input
              name="full_name"
              required
              minLength={2}
              defaultValue={record?.full_name ?? defaults.full_name}
              className={fieldClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="label-caps text-muted-foreground">{t("Contact phone")}</span>
            <input
              name="contact_phone"
              type="tel"
              required
              minLength={6}
              maxLength={20}
              defaultValue={record?.contact_phone ?? defaults.phone}
              className={fieldClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="label-caps text-muted-foreground">{t("Area you volunteer in")}</span>
            <input
              name="area"
              required
              minLength={2}
              defaultValue={record?.area ?? defaults.area}
              placeholder={t("Area, city")}
              className={fieldClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="label-caps text-muted-foreground">{t("Pincode (optional)")}</span>
            <input
              name="pincode"
              inputMode="numeric"
              maxLength={6}
              defaultValue={record?.pincode ?? ""}
              className={fieldClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="label-caps text-muted-foreground">{t("Government ID type")}</span>
            <select
              name="id_type"
              required
              defaultValue={record?.id_type ?? "Aadhaar"}
              className={fieldClass}
            >
              {ID_TYPES.map((option) => (
                <option key={option} value={option}>
                  {t(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="label-caps text-muted-foreground">
              {t("Last 4 characters of the ID number")}
            </span>
            <input
              name="id_last4"
              required
              minLength={4}
              maxLength={4}
              autoComplete="off"
              defaultValue={record?.id_last4 ?? ""}
              className={`${fieldClass} font-mono uppercase`}
            />
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className="label-caps text-muted-foreground">
              {t("ID document (PDF/JPG/PNG, max 5 MB)")}
            </span>
            <input
              name="document"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required={!record?.document_path}
              className="mt-2 block w-full text-sm file:mr-3 file:border file:border-border-strong file:bg-transparent file:px-3 file:py-2 file:text-sm"
            />
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {t(
                "Stored privately — only platform admins can see it. For Aadhaar, upload a masked Aadhaar (only the last 4 digits visible).",
              )}
              {record?.document_name
                ? ` ${t("Current document: {name}. Choose a new file only to replace it.", { name: record.document_name })}`
                : ""}
            </span>
          </label>
          {(localError || error) && (
            <p className="text-sm text-accent sm:col-span-2">{localError ?? error}</p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving
                ? t("Saving…")
                : record
                  ? t("Save and resubmit")
                  : t("Submit for verification")}
            </Button>
            {record && (
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                {t("Cancel")}
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function BadgesAndActivity({ userId }: { userId: string }) {
  const t = useT();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [rows, setRows] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [badgeResult, rowResult] = await Promise.all([
      supabase.rpc("my_badges"),
      supabase
        .from("donations")
        .select("*")
        .or(`donor_id.eq.${userId},claimed_by.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setBadges(((badgeResult.data as Badge[] | null) ?? []).filter((item) => item.badge));
    setRows((rowResult.data as Donation[] | null) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const donated = rows.filter((row) => row.donor_id === userId);
  const claimed = rows.filter((row) => row.claimed_by === userId);
  const summary = [
    { label: "Donations posted", value: formatCount(donated.length) },
    {
      label: "Donations completed",
      value: formatCount(donated.filter((row) => row.status === "Completed").length),
    },
    { label: "Pickups claimed", value: formatCount(claimed.length) },
    {
      label: "Pickups completed",
      value: formatCount(claimed.filter((row) => row.status === "Completed").length),
    },
    {
      label: "Food saved",
      value: `${formatWeight(rows.filter((row) => row.status === "Completed").reduce((sum, row) => sum + (row.weight_kg ?? 0), 0))} kg`,
    },
  ];

  return (
    <>
      <section className="border-t border-border px-4 py-6 sm:px-8 lg:px-10">
        <h2 className="label-caps flex items-center gap-2">
          <Award className="size-4 text-accent" />
          {t("Badges")}
        </h2>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("Loading…")}</p>
        ) : badges.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t(
              "No badges yet. Complete 5 donations with none expiring for Zero Food Waste Champion, or reach the top 5 on the leaderboard for Top Donor / Top Volunteer.",
            )}{" "}
            <Link to="/impact" className="underline">
              {t("See the leaderboard")}
            </Link>
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {badges.map((item) => (
              <article key={item.badge} className="border border-border-strong bg-card px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Award className="size-4 text-accent" />
                  {t(item.badge)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-border px-4 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label-caps flex items-center gap-2">
            <ClipboardList className="size-4 text-accent" />
            {t("Your activity")}
          </h2>
          <Link to="/history" className="text-xs underline">
            {t("Full history")}
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
          {summary.map(({ label, value }) => (
            <article key={label} className="min-w-0 bg-background p-4">
              <p className="label-caps truncate text-muted-foreground">{t(label)}</p>
              <p className="mt-2 font-display text-2xl">{loading ? "—" : value}</p>
            </article>
          ))}
        </div>
        {!loading && rows.length > 0 && (
          <ul className="mt-4 divide-y divide-border">
            {rows.slice(0, 5).map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm"
              >
                <Link
                  to="/donation/$donationId"
                  params={{ donationId: row.id }}
                  className="min-w-0 truncate hover:underline"
                >
                  {row.food_type}
                  {row.food_name ? ` · ${row.food_name}` : ""}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {row.donor_id === userId ? t("You donated") : t("You claimed")}
                  </span>
                </Link>
                <StatusBadge value={displayStatus(row)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
