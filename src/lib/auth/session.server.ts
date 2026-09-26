// Signed, httpOnly session cookie. The payload is readable base64url JSON; the HMAC-SHA256
// suffix (keyed by SESSION_SECRET) is what stops a client from forging or editing it.
import { createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";

export const SESSION_COOKIE = "fwc_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  const value = process.env["SESSION_SECRET"];
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

/** Serializes and signs a payload that expires `maxAgeSeconds` from now. */
export function seal(payload: Record<string, unknown>, maxAgeSeconds: number) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + maxAgeSeconds * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verifies the signature and expiry; returns null for anything tampered, malformed, or stale. */
export function unseal<T extends Record<string, unknown>>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & {
      exp?: number;
    };
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Signs the user in by setting the session cookie. Only valid inside a server function. */
export function startSession(userId: string) {
  setCookie(SESSION_COOKIE, seal({ uid: userId }, SESSION_MAX_AGE_SECONDS), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestUrl().protocol === "https:",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** The signed-in user's id, or null. Only valid inside a server function / server route. */
export function getSessionUserId(): string | null {
  const payload = unseal<{ uid?: unknown }>(getCookie(SESSION_COOKIE));
  return typeof payload?.uid === "string" ? payload.uid : null;
}

export function requireSessionUserId(): string {
  const userId = getSessionUserId();
  if (!userId) throw new Error("Unauthorized: please sign in.");
  return userId;
}

export function clearSession() {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}
