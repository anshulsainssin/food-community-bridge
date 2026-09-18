import { createFileRoute } from "@tanstack/react-router";
import { Check, Mail, PackageOpen, ShieldAlert, UsersRound, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageIntro, StatusBadge } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsAdmin } from "@/hooks/use-admin";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, formatWeight } from "@/hooks/use-stats";
import { displayStatus } from "@/lib/donation-status";
import { supabase } from "@/integrations/supabase/client";
import type { Tables as TablesType } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard | Food Waste Connect" },
      { name: "description", content: "Live network metrics, user and pickup management for Food Waste Connect administrators." },
      { property: "og:title", content: "Admin Dashboard | Food Waste Connect" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Profile = TablesType<"profiles">;
type Donation = TablesType<"donations">;
type ContactMessage = TablesType<"contact_messages">;
type VolunteerSignup = TablesType<"volunteer_signups">;
type AdminStats = {
  total_users: number;
  total_donations: number;
  active_requests: number;
  meals_delivered: number;
  food_saved_kg: number;
  expired_donations: number;
  pending_contact_messages: number;
  pending_volunteer_signups: number;
};

const EMPTY_STATS: AdminStats = {
  total_users: 0,
  total_donations: 0,
  active_requests: 0,
  meals_delivered: 0,
  food_saved_kg: 0,
  expired_donations: 0,
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

  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [signups, setSignups] = useState<VolunteerSignup[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const load = useCallback(async () => {
    setLoadingData(true);
    const [statsResult, profilesResult, donationsResult, messagesResult, signupsResult] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.rpc("admin_list_profiles"),
      supabase.rpc("admin_list_donations"),
      supabase.rpc("admin_list_contact_messages"),
      supabase.rpc("admin_list_volunteer_signups"),
    ]);
    const statsRow = Array.isArray(statsResult.data) ? statsResult.data[0] : null;
    setStats(
      statsRow
        ? {
            total_users: num(statsRow.total_users),
            total_donations: num(statsRow.total_donations),
            active_requests: num(statsRow.active_requests),
            meals_delivered: num(statsRow.meals_delivered),
            food_saved_kg: num(statsRow.food_saved_kg),
            expired_donations: num(statsRow.expired_donations),
            pending_contact_messages: num(statsRow.pending_contact_messages),
            pending_volunteer_signups: num(statsRow.pending_volunteer_signups),
          }
        : EMPTY_STATS,
    );
    setProfiles((profilesResult.data as Profile[] | null) ?? []);
    setDonations((donationsResult.data as Donation[] | null) ?? []);
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
    { label: "Total users", value: formatCount(stats.total_users), icon: UsersRound },
    { label: "Total donations", value: formatCount(stats.total_donations), icon: PackageOpen },
    { label: "Active requests", value: formatCount(stats.active_requests), icon: PackageOpen },
    { label: "Meals delivered", value: formatCount(stats.meals_delivered), icon: UtensilsCrossed },
    { label: "Food saved (kg)", value: formatWeight(stats.food_saved_kg), icon: UtensilsCrossed },
    { label: "Expired donations", value: formatCount(stats.expired_donations), icon: PackageOpen },
    { label: "New contact messages", value: formatCount(stats.pending_contact_messages), icon: Mail },
    { label: "Volunteer sign-ups", value: formatCount(stats.pending_volunteer_signups), icon: Check },
  ];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Admin / Dashboard"
        title={<>Network <span className="italic">overview.</span></>}
        description="Live metrics and management for users, donations, and incoming messages across the network."
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
        <Tabs defaultValue="donations">
          <TabsList>
            <TabsTrigger value="donations">Donations ({donations.length})</TabsTrigger>
            <TabsTrigger value="users">Users ({profiles.length})</TabsTrigger>
            <TabsTrigger value="messages">Messages ({messages.length})</TabsTrigger>
            <TabsTrigger value="volunteers">Volunteers ({signups.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="donations" className="mt-6">
            {loadingData ? (
              <p className="text-sm text-muted-foreground">Loading donations…</p>
            ) : donations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No donations yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Food</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pickup address</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donations.map((donation) => (
                    <TableRow key={donation.id}>
                      <TableCell className="max-w-40 truncate">{donation.food_type}</TableCell>
                      <TableCell><StatusBadge value={displayStatus(donation)} /></TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">{donation.pickup_address || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{donation.contact_info || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatStamp(donation.created_at)}</TableCell>
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
