import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { signIn, signUp } from "@/lib/account.functions";
import { APP_NAME, APP_TAGLINE, pageTitle } from "@/lib/brand";
import { clearDemoRole, setDemoRole } from "@/lib/demo";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: pageTitle("Sign in") },
      {
        name: "description",
        content: `Sign in to ${APP_NAME} to share surplus food, sponsor a meal, and track your impact.`,
      },
      { property: "og:title", content: pageTitle("Sign in") },
      { property: "og:description", content: `Access your ${APP_NAME} account.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

/** Server-side zod failures arrive as a JSON list of issues; show the first one's message. */
function readableError(error: unknown) {
  const message = errorMessage(error);
  try {
    const issues = JSON.parse(message) as { message?: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // Not JSON — already a plain message.
  }
  return message;
}

const inputClass =
  "mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground";

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function demoLogin(target: "/" | "/admin" = "/") {
    setDemoRole(target === "/admin" ? "admin" : "user");
    window.location.href = target;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp({ data: { email, password, full_name: String(form.get("full_name") ?? "") } });
      } else {
        await signIn({ data: { email, password } });
      }
      clearDemoRole();
      // Full reload so every component picks up the new session cookie.
      window.location.href = "/";
    } catch (submitError) {
      setError(readableError(submitError));
      setSubmitting(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-display text-3xl italic leading-none">{APP_NAME}</p>
        <p className="label-caps mt-2 text-muted-foreground">{APP_TAGLINE}</p>
        <h1 className="mt-8 font-display text-4xl">{isSignup ? "Create account" : "Sign in"}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Use your email and password to sponsor meals and track your impact.
        </p>

        <form className="mt-8 space-y-5" onSubmit={submit}>
          {isSignup && (
            <label className="block">
              <span className="label-caps text-muted-foreground">Full name</span>
              <input name="full_name" required autoComplete="name" className={inputClass} />
            </label>
          )}
          <label className="block">
            <span className="label-caps text-muted-foreground">Email</span>
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </label>
          <label className="block">
            <span className="label-caps text-muted-foreground">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className={inputClass}
            />
            {isSignup && (
              <span className="mt-1 block text-xs text-muted-foreground">
                At least 8 characters.
              </span>
            )}
          </label>

          {error && <p className="text-sm text-accent">{error}</p>}

          <Button type="submit" size="wide" className="w-full" disabled={submitting}>
            {submitting ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          {isSignup ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setMode(isSignup ? "signin" : "signup");
              setError(null);
            }}
          >
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </p>

        <div className="mt-6 flex justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <button type="button" className="underline" onClick={() => demoLogin("/")}>
            Explore the demo
          </button>
          <button type="button" className="underline" onClick={() => demoLogin("/admin")}>
            Continue as Demo Admin
          </button>
        </div>
      </div>
    </div>
  );
}
