import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { setDemoRole } from "@/lib/demo";
import { DONOR_ROLE, NGO_ROLE } from "@/lib/roles";
import { useState } from "react";

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

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<string>(DONOR_ROLE);

  function demoLogin(target: "/" | "/admin" = "/") {
    setDemoRole(target === "/admin" ? "admin" : "user");
    window.location.href = target;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    demoLogin("/");
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
                <input className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
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
            <input type="email" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
          </label>
          <label className="block">
            <span className="label-caps text-muted-foreground">Password</span>
            <input type="password" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
          </label>
          <Button type="submit" size="wide" className="w-full">{mode === "signin" ? "Sign in" : "Create account"}</Button>
        </form>

        <Button variant="outline" size="wide" className="mt-3 w-full" onClick={() => demoLogin("/")}>
          Continue with Google
        </Button>

        <div className="mt-4 text-center">
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => demoLogin("/admin")}>
            Continue as Demo Admin
          </button>
        </div>

        <button type="button" className="mt-6 text-xs text-muted-foreground underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); }}>
          {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
