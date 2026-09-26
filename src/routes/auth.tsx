import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { setDemoRole } from "@/lib/demo";
import { DONOR_ROLE, NGO_ROLE } from "@/lib/roles";
import { APP_NAME, APP_TAGLINE, pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: z.object({ error: z.string().optional() }),
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

function AuthPage() {
  const { error } = Route.useSearch();
  const [role, setRole] = useState<string>(DONOR_ROLE);

  function demoLogin(target: "/" | "/admin" = "/") {
    setDemoRole(target === "/admin" ? "admin" : "user");
    window.location.href = target;
  }

  function googleLogin() {
    // Full-page navigation: the server route redirects on to Google's consent screen.
    window.location.href = `/api/auth/google?${new URLSearchParams({ role }).toString()}`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-display text-3xl italic leading-none">{APP_NAME}</p>
        <p className="label-caps mt-2 text-muted-foreground">{APP_TAGLINE}</p>
        <h1 className="mt-8 font-display text-4xl">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Use your Google account to sponsor meals and track your impact.
        </p>

        <fieldset className="mt-8">
          <legend className="label-caps text-muted-foreground">I am a</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={role === DONOR_ROLE ? "primary" : "outline"}
              onClick={() => setRole(DONOR_ROLE)}
            >
              Sponsor
            </Button>
            <Button
              type="button"
              variant={role === NGO_ROLE ? "primary" : "outline"}
              onClick={() => setRole(NGO_ROLE)}
            >
              NGO / Volunteer
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Applies to new accounts. You can change it later on your profile.
          </p>
        </fieldset>

        {error && <p className="mt-6 text-sm text-accent">{error}</p>}

        <Button size="wide" className="mt-6 w-full" onClick={googleLogin}>
          Continue with Google
        </Button>

        <div className="mt-6 flex justify-between text-xs text-muted-foreground">
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
