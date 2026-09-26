// Google sign-in via the OAuth 2.0 authorization-code flow, using an OAuth client created in
// Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application).
import { randomBytes } from "node:crypto";

import { collections, newId } from "@/integrations/mongodb/db.server";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALLBACK_PATH = "/api/auth/callback/google";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

/** Must exactly match an "Authorized redirect URI" on the OAuth client in Google Cloud Console. */
export function redirectUri(request: Request) {
  const base = process.env["APP_URL"] || new URL(request.url).origin;
  return new URL(CALLBACK_PATH, base).toString();
}

export function newOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function authorizationUrl(request: Request, state: string) {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type GoogleIdentity = {
  sub: string;
  email: string | null;
  name: string | null;
};

/**
 * Exchanges the authorization code for tokens and reads the identity from the ID token. The
 * token comes straight from Google's token endpoint over TLS in exchange for our client secret,
 * so per the OpenID Connect spec (§3.1.3.7) its signature need not be re-verified — but the
 * audience, issuer, and expiry are still checked.
 */
export async function exchangeCode(request: Request, code: string): Promise<GoogleIdentity> {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed [${response.status}]: ${await response.text()}`);
  }

  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  const payloadPart = idToken?.split(".")[1];
  if (!payloadPart) throw new Error("Google did not return an ID token.");

  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (claims.aud !== clientId) throw new Error("ID token audience mismatch.");
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("ID token issuer mismatch.");
  }
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("ID token expired.");
  if (!claims.sub) throw new Error("ID token has no subject.");

  return {
    sub: claims.sub,
    email: claims.email && claims.email_verified ? claims.email : null,
    name: claims.name ?? null,
  };
}

/**
 * Finds or creates the profile for a Google account and returns its id. `role` (Donor vs
 * Volunteer, chosen on the sign-in page) only applies when the profile is first created.
 */
export async function upsertProfile(identity: GoogleIdentity, role: string | null) {
  const { profiles, admins } = await collections();
  const now = new Date();
  const profile = await profiles.findOneAndUpdate(
    { google_sub: identity.sub },
    {
      $setOnInsert: {
        _id: newId(),
        google_sub: identity.sub,
        full_name: identity.name ?? identity.email?.split("@")[0] ?? null,
        email: identity.email,
        role,
        organization: null,
        phone: null,
        location_label: null,
        latitude: null,
        longitude: null,
        created_at: now,
        updated_at: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!profile) throw new Error("Could not create the user profile.");

  // Admin access isn't self-service: it comes from the admins collection, which can be
  // bootstrapped by listing Google account emails in ADMIN_EMAILS.
  const adminEmails = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (identity.email && adminEmails.includes(identity.email.toLowerCase())) {
    await admins.updateOne(
      { _id: profile._id },
      { $setOnInsert: { created_at: now } },
      { upsert: true },
    );
  }

  return profile._id;
}
