import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in | Food Waste Connect" },
      { name: "description", content: "Sign in to Food Waste Connect to share surplus food and coordinate community pickups." },
      { property: "og:title", content: "Sign in | Food Waste Connect" },
      { property: "og:description", content: "Access your Food Waste Connect account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

// The Fetch API throws a generic "Failed to fetch" / "NetworkError" / "Load failed" error
// (varies by browser) when a request never reaches a server at all — DNS failure, no
// connectivity, a blocked/unreachable host, or a rejected CORS preflight. Supabase's auth
// client also returns this as an `error` object rather than throwing in most cases. Surface
// it plainly either way, without hiding which request failed.
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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
        });
        if (error) return setMessage(networkErrorMessage(error));
        if (!data.session) return setMessage("Check your email to confirm your account.");
        void navigate({ to: "/", replace: true });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return setMessage(networkErrorMessage(error));
      void navigate({ to: "/", replace: true });
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
    // Goes through Supabase Auth's own Google provider (configured in the Supabase/Lovable
    // Cloud dashboard), not the Lovable OAuth broker (lovable.auth.signInWithOAuth), which
    // redirects to /~oauth/initiate — a route that only exists on Lovable's own hosting and
    // 404s anywhere else (including local dev and this Cloudflare deployment). This is a
    // full-page redirect to Google and back; landing back on /auth lets the effect above pick
    // up the new session and redirect home.
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) setMessage(networkErrorMessage(error));
    } catch (err) {
      setMessage(networkErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-display text-3xl italic leading-none">Food Waste Connect</p>
        <p className="label-caps mt-2 text-muted-foreground">Community network</p>
        <h1 className="mt-8 font-display text-4xl">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Use your account to share surplus food and coordinate pickups.</p>

        <form className="mt-8 space-y-6" onSubmit={submit}>
          {mode === "signup" && (
            <label className="block">
              <span className="label-caps text-muted-foreground">Full name</span>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
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
