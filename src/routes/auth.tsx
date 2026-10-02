import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { fetchProfile, homePathFor, rememberPendingRole } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_OPTIONS, roleKind, type RoleKind } from "@/lib/roles";

// The account type picked before signing in ("Donor" or "Receiver" = NGO/volunteer), kept for this
// tab so it survives the Google redirect.
const LOGIN_AS_KEY = "fwc-login-as";
function readLoginAs(): RoleKind | null {
  try {
    const value = sessionStorage.getItem(LOGIN_AS_KEY);
    return value === "Donor" || value === "Receiver" ? value : null;
  } catch {
    return null;
  }
}
function writeLoginAs(value: RoleKind | null) {
  try {
    if (value) sessionStorage.setItem(LOGIN_AS_KEY, value);
    else sessionStorage.removeItem(LOGIN_AS_KEY);
  } catch {
    // Storage unavailable: the choice then only lasts until the page reloads.
  }
}
const ACCOUNT_TYPE_LABEL: Record<RoleKind, string> = { Donor: "Donor", Receiver: "NGO / Volunteer" };

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

// Supabase answers "Invalid login credentials" for a wrong password, for an account that was
// created with Google (it has no password), and for an email that has no account in this project.
function authErrorMessage(error: { code?: string | undefined; message: string }) {
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
    return "Email or password is incorrect. If you created your account with Google, use Continue with Google. Forgot your password? Use the link below to reset it, or create an account if you don't have one yet.";
  }
  if (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
    return "Please confirm your email first: open the confirmation link we emailed you (check spam too).";
  }
  return networkErrorMessage(error);
}

// Phone keyboards and autofill often add a space after the email; Supabase then answers
// "Invalid login credentials" even though the email and password are right.
function cleanEmail(value: string) {
  return value.trim();
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "role">("signin");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  // Chosen before the sign-in form: Donor or NGO/Volunteer (null = still choosing).
  const [accountType, setAccountTypeState] = useState<RoleKind | null>(null);
  function setAccountType(value: RoleKind | null) {
    setAccountTypeState(value);
    writeLoginAs(value);
    setRole(value === "Donor" ? "Donor" : "");
    setMessage(null);
  }

  // Donors start on the donor dashboard, NGOs and volunteers on the NGO dashboard (role from their profile).
  // Accounts without a role (created before sign-up asked for one) choose it once here.
  // If an account type was chosen before signing in, the account's own role (from its profile) must
  // match it; accounts without a role take the chosen type.
  async function goHome() {
    const { data } = await supabase.auth.getUser();
    const profile = data.user ? await fetchProfile(data.user) : null;
    const chosen = readLoginAs();
    if (data.user && profile && !profile.role?.trim() && chosen === "Donor") {
      const { error } = await supabase.from("profiles").update({ role: "Donor" }).eq("id", data.user.id);
      if (!error) profile.role = "Donor";
    }
    if (data.user && !profile?.role?.trim()) {
      setAccountTypeState(chosen);
      setRole("");
      setMode("role");
      setMessage(null);
      return;
    }
    const kind = roleKind(profile?.role);
    if (chosen && kind && kind !== chosen) {
      await supabase.auth.signOut();
      setAccountTypeState(chosen);
      setMode("signin");
      setMessage(
        kind === "Donor"
          ? "This email is registered as a Donor account. Choose \"Donor\" to sign in with it, or use your NGO / Volunteer account here."
          : "This email is registered as an NGO / Volunteer account. Choose \"NGO / Volunteer\" to sign in with it, or use your Donor account here.",
      );
      return;
    }
    writeLoginAs(null);
    void navigate({ to: homePathFor(profile), replace: true });
  }

  useEffect(() => {
    // A password-reset link signs the user in and lands here; let them choose a new password first.
    const recovering = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") === "recovery";
    if (recovering) {
      setMode("reset");
      setMessage("Choose a new password for your account.");
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
        setMessage("Choose a new password for your account.");
      }
    });

    // A failed Google sign-in returns here with the reason in the query string or the hash.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const oauthError =
      query.get("error_description") ??
      hash.get("error_description") ??
      query.get("error") ??
      hash.get("error");
    if (oauthError) setMessage(`Google sign-in failed: ${oauthError}`);

    // A link can pre-select the account type (/auth?as=donor or ?as=ngo); otherwise keep this tab's choice.
    const requested = query.get("as");
    const initialType: RoleKind | null = requested === "donor" ? "Donor" : requested === "ngo" ? "Receiver" : readLoginAs();
    setAccountTypeState(initialType);
    writeLoginAs(initialType);
    if (initialType === "Donor") setRole("Donor");

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && !recovering) void goHome();
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setUnconfirmed(false);
    try {
      if (mode === "role") {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return setMode("signin");
        const { error } = await supabase.from("profiles").update({ role }).eq("id", data.user.id);
        if (error) return setMessage(networkErrorMessage(error));
        await goHome();
        return;
      }
      if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return setMessage(networkErrorMessage(error));
        await goHome();
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail(email),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth`, data: { full_name: fullName.trim(), role } },
        });
        if (error?.code === "user_already_exists" || (error && /already registered/i.test(error.message))) {
          setMode("signin");
          return setMessage("An account with this email already exists. Sign in with your password, use Continue with Google if you signed up with Google, or reset your password below.");
        }
        if (error) return setMessage(authErrorMessage(error));
        // With email confirmation on, Supabase answers a sign-up for an existing email with a user
        // that has no identities (and sends nothing) instead of an error.
        if (data.user && data.user.identities?.length === 0) {
          setMode("signin");
          return setMessage("An account with this email already exists. Sign in with your password, use Continue with Google if you signed up with Google, or reset your password below.");
        }
        if (!data.session) {
          setUnconfirmed(true);
          return setMessage("Account created. Check your email and open the confirmation link, then sign in.");
        }
        await goHome();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(email), password });
      if (error) {
        setUnconfirmed(error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message));
        return setMessage(authErrorMessage(error));
      }
      await goHome();
    } catch (err) {
      // A thrown exception (network/DNS/CORS failure reaching Supabase, not a normal auth
      // rejection) previously left the button stuck disabled with no visible message at all.
      setMessage(networkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    setMessage(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: cleanEmail(email), options: { emailRedirectTo: `${window.location.origin}/auth` } });
    setMessage(error ? networkErrorMessage(error) : "Confirmation email sent again. Check your inbox and spam folder.");
  }

  async function sendPasswordReset() {
    if (!email) return setMessage("Enter your email above, then choose \"Forgot password?\" again.");
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(email), { redirectTo: `${window.location.origin}/auth` });
    setMessage(error ? networkErrorMessage(error) : "If an account exists for this email, a password reset link is on its way. Check your inbox and spam folder.");
  }

  async function googleSignIn() {
    setMessage(null);
    if (mode === "signup" && role) rememberPendingRole(role);
    else if (accountType === "Donor") rememberPendingRole("Donor");
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

  const choosing = (mode === "signin" || mode === "signup") && accountType === null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-display text-3xl italic leading-none">Food Waste Connect</p>
        <p className="label-caps mt-2 text-muted-foreground">Community network</p>
        <h1 className="mt-8 font-display text-4xl">{choosing ? "Sign in" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "role" ? "How do you use Food Waste Connect?" : "Set a new password"}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{choosing ? "First choose which kind of account you want to use." : "Use your account to share surplus food and coordinate pickups."}</p>

        {choosing ? (
          <div className="mt-8 space-y-3">
            <Button variant="outline" size="wide" className="h-auto w-full flex-col items-start gap-1 py-4 text-left" onClick={() => setAccountType("Donor")}>
              <span className="text-base font-medium normal-case tracking-normal">Donor</span>
              <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground">I want to donate surplus food</span>
            </Button>
            <Button variant="outline" size="wide" className="h-auto w-full flex-col items-start gap-1 py-4 text-left" onClick={() => setAccountType("Receiver")}>
              <span className="text-base font-medium normal-case tracking-normal">NGO / Volunteer</span>
              <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground">I collect food and deliver it to people in need</span>
            </Button>
            {message && <p className="text-sm text-accent">{message}</p>}
          </div>
        ) : (
        <>
        {(mode === "signin" || mode === "signup") && accountType && (
          <p className="mt-6 text-sm">
            <span className="label-caps text-muted-foreground">Account type</span>{" "}
            <span className="font-medium">{ACCOUNT_TYPE_LABEL[accountType]}</span>{" "}
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setAccountType(null)}>Change</button>
          </p>
        )}
        <form className="mt-8 space-y-6" onSubmit={submit}>
          {mode === "signup" && (
            <label className="block">
              <span className="label-caps text-muted-foreground">Full name</span>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
          )}
          {((mode === "signup" && accountType !== "Donor") || mode === "role") && (
            <label className="block">
              <span className="label-caps text-muted-foreground">I am a</span>
              <select required name="role" value={role} onChange={(e) => setRole(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground">
                <option value="">Choose one</option>
                {ROLE_OPTIONS.filter((option) => accountType !== "Receiver" || option !== "Donor").map((option) => <option key={option} value={option}>{option === "Donor" ? "Donor (I share surplus food)" : `${option} (I collect food)`}</option>)}
              </select>
            </label>
          )}
          {mode !== "reset" && mode !== "role" && (
            <label className="block">
              <span className="label-caps text-muted-foreground">Email</span>
              <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
          )}
          {mode !== "role" && <label className="block">
            <span className="label-caps text-muted-foreground">{mode === "reset" ? "New password" : "Password"}</span>
            <input required type="password" minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
          </label>}
          {message && <p className="text-sm text-accent">{message}</p>}
          {unconfirmed && email && (
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void resendConfirmation()}>Resend confirmation email</button>
          )}
          <Button type="submit" size="wide" className="w-full" disabled={busy}>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "role" ? "Continue" : "Save new password"}</Button>
        </form>

        {mode === "role" && (
          <button type="button" className="mt-6 text-xs text-muted-foreground underline" onClick={() => void supabase.auth.signOut().then(() => { setMode("signin"); setMessage(null); })}>
            Sign out
          </button>
        )}

        {mode !== "reset" && mode !== "role" && (
          <>
            <Button variant="outline" size="wide" className="mt-3 w-full" onClick={googleSignIn}>Continue with Google</Button>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); setUnconfirmed(false); }}>
                {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
              </button>
              {mode === "signin" && (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void sendPasswordReset()}>Forgot password?</button>
              )}
            </div>
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
