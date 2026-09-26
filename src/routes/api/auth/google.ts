import { createFileRoute } from "@tanstack/react-router";

// GET /api/auth/google?role=… — starts Google sign-in. The CSRF `state` (plus the role picked
// on the sign-in page) rides in a short-lived signed cookie and is checked on the callback.
export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizationUrl, newOAuthState } = await import("@/lib/auth/google.server");
        const { OAUTH_STATE_COOKIE, seal, setCookieHeader } =
          await import("@/lib/auth/session.server");

        const role = new URL(request.url).searchParams.get("role");
        const state = newOAuthState();
        const headers = new Headers({ location: authorizationUrl(request, state) });
        headers.append(
          "set-cookie",
          setCookieHeader(
            OAUTH_STATE_COOKIE,
            seal({ state, role: role?.slice(0, 40) ?? null }, 600),
            600,
            request,
          ),
        );
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
