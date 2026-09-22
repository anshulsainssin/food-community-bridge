import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, HeartHandshake, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { formatInr, mealsForAmount, SPONSOR_QUICK_AMOUNTS } from "@/lib/kitchen";
import { useLanguage } from "@/lib/i18n";
import { playNotificationSound } from "@/lib/notification-sound";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/sponsor")({
  head: () => ({
    meta: [
      { title: "Sponsor a Meal | Ratna Nidhi Central Kitchen" },
      { name: "description", content: "Sponsor fresh cooked meals for children through the Ratna Nidhi Central Kitchen & Daily Meal Project. ₹500 sponsors 50 meals." },
      { property: "og:title", content: "Sponsor a Meal | Ratna Nidhi Central Kitchen" },
      { property: "og:description", content: "₹500 feeds 50 children. Sponsor a meal today." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SponsorPage,
});

type Sponsorship = Tables<"sponsorships">;

function formatMoment(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function SponsorPage() {
  const { user, profile } = useProfile();
  const { t } = useLanguage();
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

  const effectiveAmount = customAmount ? Number(customAmount) || 0 : amount;
  const meals = mealsForAmount(effectiveAmount);

  const load = useCallback(async () => {
    if (!user) {
      setSponsorships([]);
      setLoadingMine(false);
      return;
    }
    const { data } = await supabase
      .from("sponsorships")
      .select("*")
      .eq("sponsor_id", user.id)
      .order("created_at", { ascending: false });
    setSponsorships((data as Sponsorship[] | null) ?? []);
    setLoadingMine(false);
  }, [user]);

  useEffect(() => {
    setLoadingMine(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`sponsorships-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sponsorships", filter: `sponsor_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, load]);

  async function submitPledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!user) return;
    if (effectiveAmount <= 0) {
      setError("Enter an amount greater than ₹0.");
      return;
    }
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const { error: insertError } = await supabase.from("sponsorships").insert({
      sponsor_id: user.id,
      sponsor_name: String(form.get("sponsor_name") ?? profile?.full_name ?? "").trim() || "Anonymous sponsor",
      sponsor_email: String(form.get("sponsor_email") ?? profile?.email ?? user.email ?? "").trim() || null,
      amount_inr: effectiveAmount,
      meals_sponsored: meals,
      message: message.trim() || null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSuccess(true);
    setMessage("");
    setCustomAmount("");
    playNotificationSound();
    await load();
  }

  return (
    <AppShell>
      <PageIntro
        eyebrow={t("sponsor.eyebrow")}
        title={<>{t("sponsor.titleMain")} <span className="italic">{t("sponsor.titleEmphasis")}</span></>}
        description={t("sponsor.description")}
      />

      <div className="grid lg:grid-cols-[1fr_1fr]">
        <section className="border-b border-border p-4 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <h2 className="font-display text-2xl italic sm:text-3xl">{t("sponsor.chooseAmount")}</h2>
          {!user ? (
            <div className="mt-6 border border-border-strong bg-card p-6">
              <p className="text-sm text-muted-foreground">{t("sponsor.signInPrompt")}</p>
              <Button asChild className="mt-4"><Link to="/auth">{t("sponsor.signIn")}</Link></Button>
            </div>
          ) : (
            <form onSubmit={submitPledge} className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SPONSOR_QUICK_AMOUNTS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={!customAmount && amount === option ? "primary" : "outline"}
                    onClick={() => {
                      setAmount(option);
                      setCustomAmount("");
                    }}
                  >
                    {formatInr(option)}
                  </Button>
                ))}
              </div>
              <label className="block">
                <span className="label-caps text-muted-foreground">{t("sponsor.customAmount")}</span>
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  placeholder="e.g. 1500"
                  className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground"
                />
              </label>

              <div className="flex items-center gap-3 border border-border-strong bg-muted/25 p-4">
                <UtensilsCrossed className="size-5 shrink-0 text-accent" />
                <p className="text-sm">
                  <span className="font-display text-2xl">{meals}</span> {t("home.tile.mealsUnit")}{meals === 1 ? "" : ""} {t("sponsor.submitBtn")} {formatInr(effectiveAmount)}
                </p>
              </div>

              <label className="block">
                <span className="label-caps text-muted-foreground">{t("sponsor.sponsorName")}</span>
                <input name="sponsor_name" defaultValue={profile?.full_name ?? ""} required className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
              </label>
              <label className="block">
                <span className="label-caps text-muted-foreground">{t("sponsor.email")}</span>
                <input name="sponsor_email" type="email" defaultValue={profile?.email ?? user.email ?? ""} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
              </label>
              <label className="block">
                <span className="label-caps text-muted-foreground">{t("sponsor.messageOpt")}</span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="In memory of… / On behalf of…" className="mt-2 w-full resize-none border-b border-input bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 focus:border-foreground" />
              </label>

              {error && <p className="text-sm text-accent">{error}</p>}
              <p className="text-xs text-muted-foreground">{t("sponsor.paymentNote")}</p>
              <Button type="submit" size="wide" className="w-full" disabled={saving || effectiveAmount <= 0}>
                {saving ? t("sponsor.saving") : t("sponsor.submitBtn")}
              </Button>
            </form>
          )}
        </section>

        <section className="bg-muted/25 p-4 sm:p-8 lg:p-10">
          <div className="flex items-center gap-2">
            <HeartHandshake className="size-4 text-accent" />
            <h2 className="label-caps text-foreground">{t("sponsor.mySponsorships")}</h2>
          </div>
          {!user ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("sponsor.signInHistory")}</p>
          ) : loadingMine ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("sponsor.loading")}</p>
          ) : sponsorships.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              {success ? t("sponsor.recorded") : t("sponsor.noSponsorships")}
            </p>
          ) : (
            <div className="mt-6 space-y-5">
              {sponsorships.map((item) => (
                <article key={item.id} className="border border-border-strong bg-card p-6">
                  <div className="flex items-center gap-2 text-accent">
                    <Award className="size-4" />
                    <p className="label-caps">{t("sponsor.certTitle")}</p>
                  </div>
                  <p className="mt-4 font-display text-2xl italic">{item.sponsor_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">sponsored {item.meals_sponsored} meal{item.meals_sponsored === 1 ? "" : "s"} ({formatInr(item.amount_inr)}) for children at the Ratna Nidhi Central Kitchen.</p>
                  {item.message && <p className="mt-3 text-sm italic text-muted-foreground">"{item.message}"</p>}
                  <p className="mt-4 text-xs text-muted-foreground">{formatMoment(item.created_at)}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
