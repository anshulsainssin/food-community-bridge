import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, Bell, HandHeart, Home, LogOut, Menu, Truck, UserRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { useProfile } from "@/hooks/use-profile";
import { formatCount, useNetworkStats } from "@/hooks/use-stats";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { label: "Overview", to: "/", icon: Home },
  { label: "Find food", to: "/donations", icon: HandHeart },
  { label: "Pickup", to: "/pickup", icon: Truck },
  { label: "Impact", to: "/impact", icon: BarChart3 },
  { label: "Profile", to: "/profile", icon: UserRound },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { user, profile } = useProfile();
  const { items: notifications, unread, markAllRead } = useNotifications(user?.id);
  const { stats: network } = useNetworkStats(Boolean(user));

  async function signOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  const navigation = (mobile = false) => navItems.map(({ label, to, icon: Icon }) => (
    <Button key={to} asChild variant="nav" className={mobile ? "w-full justify-start" : "w-full justify-start"} data-active={pathname === to} onClick={() => mobile && setMobileMenu(false)}>
      <Link to={to}><Icon className="size-4" />{label}</Link>
    </Button>
  ));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4 md:px-7">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label="Open menu" onClick={() => setMobileMenu(true)}><Menu className="size-5" /></Button>
          <Link to="/" className="min-w-0"><p className="truncate font-display text-xl italic leading-none sm:text-2xl">Food Waste Connect</p><p className="label-caps mt-1 truncate text-muted-foreground">Community network</p></Link>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative"
              onClick={() => {
                setShowNotifications((open) => !open);
                if (!showNotifications && unread > 0) void markAllRead();
              }}
            >
              <Bell className="size-4" />
              {unread > 0 && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" />}
            </Button>
            {showNotifications && (
              <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] border border-border-strong bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="label-caps text-muted-foreground">Notifications</p>
                  <Button variant="ghost" size="icon" aria-label="Close notifications" onClick={() => setShowNotifications(false)}><X className="size-4" /></Button>
                </div>
                <div className="max-h-80 divide-y divide-border overflow-y-auto">
                  {!user ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">Sign in to see your notifications.</p>
                  ) : notifications.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">No notifications</p>
                  ) : (
                    notifications.map((item) => (
                      <article key={item.id} className="px-4 py-3">
                        <p className="text-sm font-medium">{item.title}</p>
                        {item.body && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          {user ? (
            <>
              <div className="hidden min-w-0 items-center gap-3 border-l border-border pl-4 sm:flex">
                <div className="min-w-0 max-w-[9rem] lg:max-w-[14rem]"><p className="truncate text-sm font-medium">{profile?.full_name ?? user.email}</p><p className="truncate text-xs text-muted-foreground">{profile?.role ?? profile?.organization ?? "Member"}</p></div>
                <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut className="size-4" /></Button>
              </div>
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Sign out" onClick={signOut}><LogOut className="size-4" /></Button>
            </>
          ) : (
            <Button asChild variant="outline" className="ml-1"><Link to="/auth">Sign in</Link></Button>
          )}

        </div>
      </header>

      {mobileMenu && <div className="fixed inset-0 z-50 bg-background p-5 md:hidden"><div className="flex items-center justify-between"><p className="font-display text-2xl italic">Food Waste Connect</p><Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileMenu(false)}><X className="size-5" /></Button></div><nav className="mt-10 space-y-2">{navigation(true)}</nav></div>}

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-sidebar p-4 md:flex md:flex-col">
          <nav className="space-y-1">{navigation()}</nav>
          <div className="mt-auto border-t border-sidebar-border pt-5">
            <p className="label-caps text-muted-foreground">Network impact</p>
            <p className="mt-2 font-display text-3xl">{formatCount(network.people_fed)} people</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {network.people_fed > 0 ? "Fed through completed community pickups." : "No completed pickups recorded yet."}
            </p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-24 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">{navItems.map(({ label, to, icon: Icon }) => <Button key={to} asChild variant="ghost" className={`h-16 min-w-0 flex-col gap-1 px-0 text-[9px] ${pathname === to ? "text-foreground" : ""}`}><Link to={to}><Icon className="size-4 shrink-0" /><span className="w-full truncate px-1 text-center">{label}</span></Link></Button>)}</nav>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: string; action?: ReactNode }) {
  return <section className="reveal border-b border-border px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14"><p className="label-caps text-accent">{eyebrow}</p><div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between"><div className="min-w-0"><h1 className="font-display text-4xl leading-[0.98] break-words sm:text-5xl lg:text-6xl">{title}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:mt-5 sm:text-base">{description}</p></div>{action}</div></section>;
}

export function StatusBadge({ value }: { value: string }) {
  const style = value === "Urgent" || value === "Available" ? "bg-accent/15 text-accent" : value === "Completed" || value === "Picked Up" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary";
  return <span className={`label-caps inline-flex rounded-sm px-2 py-1 ${style}`}>{value}</span>;
}
