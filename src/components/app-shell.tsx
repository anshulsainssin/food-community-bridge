import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, Bell, HandHeart, Home, LogOut, Menu, Truck, UserRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { user, profile } = useProfile();

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
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-7">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMobileMenu(true)}><Menu className="size-5" /></Button>
          <Link to="/"><p className="font-display text-2xl italic leading-none">Food Waste Connect</p><p className="label-caps mt-1 text-muted-foreground">Community network</p></Link>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" /></Button>
          {user ? (
            <div className="hidden items-center gap-3 border-l border-border pl-4 sm:flex">
              <div><p className="text-sm font-medium">{profile?.full_name ?? user.email}</p><p className="text-xs text-muted-foreground">{profile?.role ?? profile?.organization ?? "Member"}</p></div>
              <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut className="size-4" /></Button>
            </div>
          ) : (
            <Button asChild variant="outline" className="ml-1"><Link to="/auth">Sign in</Link></Button>
          )}
        </div>
      </header>

      {mobileMenu && <div className="fixed inset-0 z-50 bg-background p-5 md:hidden"><div className="flex items-center justify-between"><p className="font-display text-2xl italic">Food Waste Connect</p><Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileMenu(false)}><X className="size-5" /></Button></div><nav className="mt-10 space-y-2">{navigation(true)}</nav></div>}

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-sidebar p-4 md:flex md:flex-col">
          <nav className="space-y-1">{navigation()}</nav>
          <div className="mt-auto border-t border-sidebar-border pt-5"><p className="label-caps text-muted-foreground">Network impact</p><p className="mt-2 font-display text-3xl">1,860 people</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Fed through completed community pickups.</p></div>
        </aside>
        <main className="min-w-0 flex-1 pb-24 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">{navItems.map(({ label, to, icon: Icon }) => <Button key={to} asChild variant="ghost" className={`h-16 flex-col gap-1 px-0 text-[9px] ${pathname === to ? "text-foreground" : ""}`}><Link to={to}><Icon className="size-4" />{label}</Link></Button>)}</nav>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: string; action?: ReactNode }) {
  return <section className="reveal border-b border-border px-5 py-10 sm:px-8 lg:px-12 lg:py-14"><p className="label-caps text-accent">{eyebrow}</p><div className="mt-4 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between"><div><h1 className="font-display text-5xl leading-[0.95] sm:text-6xl">{title}</h1><p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p></div>{action}</div></section>;
}

export function StatusBadge({ value }: { value: string }) {
  const style = value === "Urgent" || value === "Available" ? "bg-accent/15 text-accent" : value === "Completed" || value === "Picked Up" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary";
  return <span className={`label-caps inline-flex rounded-sm px-2 py-1 ${style}`}>{value}</span>;
}