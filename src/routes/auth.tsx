import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DONOR_ROLE, NGO_ROLE, roleHomePath } from "@/lib/roles";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in | Ratna Nidhi Central Kitchen" },
      { name: "description", content: "Sign in to sponsor a meal and track your impact with the Ratna Nidhi Central Kitchen & Daily Meal Project." },
      { property: "og:title", content: "Sign in | Ratna Nidhi Central Kitchen" },
      { property: "og:description", content: "Access your Ratna Nidhi Central Kitchen account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

// The Fetch API throws a generic "Failed to fetch" / "NetworkError" / "Load failed" TypeError
// (varies by browser) when a request never reaches a server at all — DNS failure, no
// connectivity, a blocked/unreachable host, or a rejected CORS preflight. Surface that plainly
// rather than the raw browser string, without hiding which request failed.
function networkErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const isNetworkFailure = /failed to fetch|networkerror|load failed|network request failed/i.test(raw);
  return isNetworkFailure
    ? `Could not reach the authentication server (${raw}). Check your internet connection, and that the Supabase project is online and reachable from this network.`
    : raw;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(DONOR_ROLE);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      void navigate({ to: await destinationForUser(data.session.user.id), replace: true });
    });
  }, [navigate]);

  async function destinationForUser(userId: string) {
    const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    return roleHomePath(data?.role ?? null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName, role } },
        });
        if (error) return setMessage(networkErrorMessage(error));
        if (!data.session) return setMessage("Check your email to confirm your account.");
        void navigate({ to: roleHomePath(role), replace: true });
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return setMessage(networkErrorMessage(error));
      void navigate({ to: data.user ? await destinationForUser(data.user.id) : "/", replace: true });
    } catch (err) {
      // A thrown exception (network/DNS/CORS failure reaching Supabase, not a normal auth
      // rejection) previously left the button stuck disabled with no visible message at all.
      setMessage(networkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setMessage(null);
    // Goes through Supabase Auth's own Google provider (Google Cloud OAuth client configured
    // directly in the Supabase/Lovable Cloud dashboard), not the Lovable OAuth broker. This is
    // a full-page redirect to Google and back — landing back on /auth lets the effect above
    // pick up the new session and route to the right dashboard by role.
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) setMessage(error.message ? networkErrorMessage(error) : "Google sign-in failed. Please try again.");
    } catch (err) {
      setMessage(networkErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-display text-3xl italic leading-none">Ratna Nidhi Central Kitchen</p>
        <p className="label-caps mt-2 text-muted-foreground">Daily Meal Project</p>
        <h1 className="mt-8 font-display text-4xl">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Use your account to sponsor meals and track your impact.</p>

        <form className="mt-8 space-y-6" onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label className="block">
                <span className="label-caps text-muted-foreground">Full name</span>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
              </label>
              <fieldset>
                <legend className="label-caps text-muted-foreground">I am a</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button type="button" variant={role === DONOR_ROLE ? "primary" : "outline"} onClick={() => setRole(DONOR_ROLE)}>
                    Sponsor
                  </Button>
                  <Button type="button" variant={role === NGO_ROLE ? "primary" : "outline"} onClick={() => setRole(NGO_ROLE)}>
                    NGO / Volunteer
                  </Button>
                </div>
              </fieldset>
            </>
          )}
          <label className="block">
            <span className="label-caps text-muted-foreground">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
          </label>
          <label className="block">
            <span className="label-caps text-muted-foreground">Password</span>
            <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
          </label>
          {message && <p className="text-sm text-accent">{message}</p>}
          <Button type="submit" size="wide" className="w-full" disabled={busy}>{mode === "signin" ? "Sign in" : "Create account"}</Button>
        </form>

        <Button variant="outline" size="wide" className="mt-3 w-full" onClick={googleSignIn}>Continue with Google</Button>

        <button type="button" className="mt-6 text-xs text-muted-foreground underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}>
          {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
