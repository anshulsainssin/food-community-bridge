import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Award, Building2, Check, Mail, PackageOpen, ShieldAlert, UsersRound, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsAdmin } from "@/hooks/use-admin";
import { useKitchenStats } from "@/hooks/use-kitchen";
import { useProfile } from "@/hooks/use-profile";
import { formatCount } from "@/hooks/use-stats";
import { formatInr } from "@/lib/kitchen";
import { supabase } from "@/integrations/supabase/client";
import type { Tables as TablesType } from "@/integrations/supabase/types";
import { APP_NAME, pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: pageTitle("Admin Dashboard") },
      { name: "description", content: `Live kitchen metrics, sponsorships, users, and incoming messages for ${APP_NAME} administrators.` },
      { property: "og:title", content: pageTitle("Admin Dashboard") },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Profile = TablesType<"profiles">;
type Sponsorship = TablesType<"sponsorships">;
type ContactMessage = TablesType<"contact_messages">;
type VolunteerSignup = TablesType<"volunteer_signups">;
type AdminStats = {
  total_users: number;
  pending_contact_messages: number;
  pending_volunteer_signups: number;
};

const EMPTY_STATS: AdminStats = {
  total_users: 0,
  pending_contact_messages: 0,
  pending_volunteer_signups: 0,
};

function num(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatStamp(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function AdminPage() {
  const { user, loading: authLoading } = useProfile();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);
  const { stats: kitchen } = useKitchenStats();

  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [signups, setSignups] = useState<VolunteerSignup[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const load = useCallback(async () => {
    setLoadingData(true);
    const [statsResult, profilesResult, sponsorshipsResult, messagesResult, signupsResult] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.rpc("admin_list_profiles"),
      supabase.from("sponsorships").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.rpc("admin_list_contact_messages"),
      supabase.rpc("admin_list_volunteer_signups"),
    ]);
    const statsRow = Array.isArray(statsResult.data) ? statsResult.data[0] : null;
    setStats(
      statsRow
        ? {
            total_users: num(statsRow.total_users),
            pending_contact_messages: num(statsRow.pending_contact_messages),
            pending_volunteer_signups: num(statsRow.pending_volunteer_signups),
          }
        : EMPTY_STATS,
    );
    setProfiles((profilesResult.data as Profile[] | null) ?? []);
    setSponsorships((sponsorshipsResult.data as Sponsorship[] | null) ?? []);
    setMessages((messagesResult.data as ContactMessage[] | null) ?? []);
    setSignups((signupsResult.data as VolunteerSignup[] | null) ?? []);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (authLoading || adminLoading) {
    return (
      <AppShell>
        <PageIntro eyebrow="Admin / Dashboard" title={<>Loading…</>} description="Checking your access." />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <PageIntro eyebrow="Admin / Dashboard" title={<>Sign in <span className="italic">required.</span></>} description="Sign in with an administrator account to view this dashboard." />
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <PageIntro
          eyebrow="Admin / Dashboard"
          title={<>Not <span className="italic">authorized.</span></>}
          description="Your account does not have admin access. Admin access is granted directly in the database and is not self-service."
          action={<ShieldAlert className="size-6 text-accent" />}
        />
      </AppShell>
    );
  }

  const tiles = [
    { label: "Meals cooked today", value: formatCount(kitchen.meals_cooked_today), icon: UtensilsCrossed },
    { label: "Active kitchen centers", value: formatCount(kitchen.active_kitchen_centers), icon: Building2 },
    { label: "Low stock items", value: formatCount(kitchen.low_stock_items), icon: AlertTriangle },
    { label: "Sponsorships raised", value: formatInr(kitchen.total_sponsorships_amount), icon: Award },
    { label: "Total users", value: formatCount(stats.total_users), icon: UsersRound },
    { label: "New contact messages", value: formatCount(stats.pending_contact_messages), icon: Mail },
    { label: "Volunteer sign-ups", value: formatCount(stats.pending_volunteer_signups), icon: Check },
    { label: "Meals sponsored (all time)", value: formatCount(kitchen.total_meals_sponsored), icon: PackageOpen },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Admin / Dashboard"
        title={<>Kitchen <span className="italic">overview.</span></>}
        description="Live metrics for community kitchens, sponsorships, users, and incoming messages. Manage stock and distribution centers directly on their live pages."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/inventory" className="label-caps border border-border-strong px-4 py-2.5 text-center hover:border-foreground">Manage inventory</Link>
            <Link to="/distribution" className="label-caps border border-border-strong px-4 py-2.5 text-center hover:border-foreground">Manage centers</Link>
          </div>
        }
      />

      <section className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }, index) => (
          <article key={label} className={`min-w-0 p-4 sm:p-6 ${index % 4 !== 3 ? "border-r border-border" : ""} ${index < 4 ? "border-b border-border" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="label-caps truncate text-muted-foreground">{label}</p>
              <Icon className="size-4 shrink-0 text-accent" />
            </div>
            <p className="mt-3 font-display text-2xl break-words sm:text-3xl">{value}</p>
          </article>
        ))}
      </section>

      <section className="p-4 sm:p-8 lg:p-12">
        <Tabs defaultValue="sponsorships">
          <TabsList>
            <TabsTrigger value="sponsorships">Sponsorships ({sponsorships.length})</TabsTrigger>
            <TabsTrigger value="users">Users ({profiles.length})</TabsTrigger>
            <TabsTrigger value="messages">Messages ({messages.length})</TabsTrigger>
            <TabsTrigger value="volunteers">Volunteers ({signups.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="sponsorships" className="mt-6">
            {loadingData ? (
              <p className="text-sm text-muted-foreground">Loading sponsorships…</p>
            ) : sponsorships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sponsorships recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sponsor</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Meals</TableHead>
                    <TableHead>Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sponsorships.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-40 truncate">{item.sponsor_name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.sponsor_email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatInr(item.amount_inr)}</TableCell>
                      <TableCell className="text-muted-foreground">{item.meals_sponsored}</TableCell>
                      <TableCell className="text-muted-foreground">{formatStamp(item.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            {loadingData ? (
              <p className="text-sm text-muted-foreground">Loading users…</p>
            ) : profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="max-w-40 truncate">{profile.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{profile.role || "—"}</TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground">{profile.organization || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{profile.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{profile.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatStamp(profile.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="messages" className="mt-6">
            {loadingData ? (
              <p className="text-sm text-muted-foreground">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contact messages yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {messages.map((message) => (
                  <article key={message.id} className="py-4 first:pt-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                      <p className="font-medium">{message.name} · <span className="text-muted-foreground">{message.email}</span></p>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatStamp(message.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{message.message}</p>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="volunteers" className="mt-6">
            {loadingData ? (
              <p className="text-sm text-muted-foreground">Loading volunteer sign-ups…</p>
            ) : signups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No volunteer sign-ups yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {signups.map((signup) => (
                  <article key={signup.id} className="py-4 first:pt-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                      <p className="font-medium">{signup.name} · <span className="text-muted-foreground">{signup.email}</span></p>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatStamp(signup.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[signup.phone, signup.location_label].filter(Boolean).join(" · ") || "No phone or location provided"}
                    </p>
                    {signup.message && <p className="mt-2 text-sm text-muted-foreground">{signup.message}</p>}
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </AppShell>
  );
}
