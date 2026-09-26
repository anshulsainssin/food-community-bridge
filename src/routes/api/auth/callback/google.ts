import { createFileRoute } from "@tanstack/react-router";

// GET /api/auth/callback/google — Google redirects here after the user consents. Register this
// exact URL as an "Authorized redirect URI" on the OAuth client in Google Cloud Console.
export const Route = createFileRoute("/api/auth/callback/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { exchangeCode, upsertProfile } = await import("@/lib/auth/google.server");
        const { OAUTH_STATE_COOKIE, sessionCookieHeader, setCookieHeader, unseal } =
          await import("@/lib/auth/session.server");

        const url = new URL(request.url);
        const fail = (reason: string) => {
          const headers = new Headers({ location: `/auth?error=${encodeURIComponent(reason)}` });
          headers.append("set-cookie", setCookieHeader(OAUTH_STATE_COOKIE, "", 0, request));
          return new Response(null, { status: 302, headers });
        };

        const cookie = request.headers
          .get("cookie")
          ?.split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
          ?.slice(OAUTH_STATE_COOKIE.length + 1);
        const saved = unseal<{ state?: string; role?: string | null }>(cookie);
        const code = url.searchParams.get("code");

        if (url.searchParams.get("error")) return fail("Google sign-in was cancelled.");
        if (!saved?.state || saved.state !== url.searchParams.get("state") || !code) {
          return fail("Sign-in expired or was tampered with. Please try again.");
        }

        try {
          const identity = await exchangeCode(request, code);
          const userId = await upsertProfile(identity, saved.role ?? null);
          const headers = new Headers({ location: "/" });
          headers.append("set-cookie", setCookieHeader(OAUTH_STATE_COOKIE, "", 0, request));
          headers.append("set-cookie", sessionCookieHeader(userId, request));
          return new Response(null, { status: 302, headers });
        } catch (error) {
          console.error(error);
          return fail("Could not complete Google sign-in. Please try again.");
        }
      },
    },
  },
});
