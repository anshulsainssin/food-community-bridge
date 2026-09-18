import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, MapPin, Navigation, Phone, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useLocationSync, useProfile } from "@/hooks/use-profile";
import { DONOR_ROLE, NGO_ROLE } from "@/lib/roles";

export const Route = createFileRoute("/profile")({ ssr: false, head: () => ({ meta: [{ title: "Community Profile | Food Waste Connect" }, { name: "description", content: "View and edit your Food Waste Connect community profile." }, { property: "og:title", content: "Community Profile | Food Waste Connect" }, { property: "og:description", content: "Community member and organization profile details." }, { property: "og:type", content: "profile" }, { name: "twitter:card", content: "summary_large_image" }] }), component: ProfilePage });

function ProfilePage() {
  const { user, profile, updateProfile, loading } = useProfile();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [roleDraft, setRoleDraft] = useState(DONOR_ROLE);

  const { status: locationStatus, request: requestLocation } = useLocationSync(
    Boolean(user),
    profile?.latitude != null && profile?.longitude != null,
    (coords) => updateProfile({ latitude: coords.latitude, longitude: coords.longitude }),
  );

  const coordsLabel = profile?.latitude != null && profile?.longitude != null
    ? `${profile.latitude.toFixed(5)}, ${profile.longitude.toFixed(5)}`
    : locationStatus === "denied" ? "Location permission not granted" : "Waiting for location…";

  const details = [
    { key: "full_name", label: "Name", value: profile?.full_name ?? "", icon: UserRound, editable: true },
    { key: "role", label: "Role", value: profile?.role ?? "", icon: UserRound, editable: true },
    { key: "organization", label: "Organization", value: profile?.organization ?? "", icon: Building2, editable: true },
    { key: "phone", label: "Phone", value: profile?.phone ?? "", icon: Phone, editable: true },
    { key: "email", label: "Email", value: profile?.email ?? user?.email ?? "", icon: Mail, editable: true },
    { key: "location_label", label: "Location", value: profile?.location_label ?? "", icon: MapPin, editable: true },
    { key: "coordinates", label: "Coordinates", value: coordsLabel, icon: Navigation, editable: false },
  ] as const;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateProfile({
      full_name: String(form.get("full_name") ?? ""),
      role: roleDraft,
      organization: String(form.get("organization") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      location_label: String(form.get("location_label") ?? ""),
    });
    setEditing(false);
    setSaved(true);
  }

  const displayName = profile?.full_name ?? user?.email?.split("@")[0] ?? (loading ? "" : "Your profile");
  const [first, ...rest] = displayName.split(" ");

  return <AppShell><PageIntro eyebrow="Profile / Community member" title={<>{first} <span className="italic">{rest.join(" ")}</span></>} description="Manage the contact and organization information shown during donation coordination." action={!editing ? <Button size="wide" onClick={() => { setRoleDraft(profile?.role || DONOR_ROLE); setEditing(true); setSaved(false); }}>Edit profile</Button> : undefined} />
    <section className="grid lg:grid-cols-[0.7fr_1.3fr]"><div className="border-b border-border p-4 sm:p-8 lg:border-b-0 lg:border-r lg:p-10"><div className="flex size-24 items-center justify-center rounded-full bg-primary font-display text-4xl text-primary-foreground">{initials(displayName)}</div><h2 className="mt-6 font-display text-2xl break-words sm:text-3xl">{profile?.organization || "Your organization"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Community food distribution and neighborhood support.</p>{locationStatus === "denied" && <Button variant="outline" className="mt-6" onClick={requestLocation}>Enable location</Button>}{saved && <p className="mt-6 border border-border-strong bg-card p-4 text-sm">Profile details saved.</p>}</div><div className="bg-muted/25 p-4 sm:p-8 lg:p-10">{editing ? <form className="grid gap-6 sm:grid-cols-2" onSubmit={submit}><fieldset className="sm:col-span-2"><legend className="label-caps text-muted-foreground">Role</legend><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" variant={roleDraft === DONOR_ROLE ? "primary" : "outline"} onClick={() => setRoleDraft(DONOR_ROLE)}>Food donor</Button><Button type="button" variant={roleDraft === NGO_ROLE ? "primary" : "outline"} onClick={() => setRoleDraft(NGO_ROLE)}>NGO / Volunteer</Button></div></fieldset>{details.filter((item) => item.editable && item.key !== "role").map(({ key, label, value }) => <label key={key} className="block"><span className="label-caps text-muted-foreground">{label}</span><input name={key} defaultValue={value} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" /></label>)}<div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row"><Button type="submit" className="w-full sm:flex-1">Save profile</Button><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div></form> : <div className="grid gap-px bg-border sm:grid-cols-2">{details.map(({ key, label, value, icon: Icon }) => <article key={key} className="bg-background p-5"><Icon className="size-4 text-accent" /><p className="label-caps mt-5 text-muted-foreground">{label}</p><p className="mt-2 text-sm font-medium break-words">{value || "—"}</p></article>)}</div>}</div></section>
  </AppShell>;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}
