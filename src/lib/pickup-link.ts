// Older QR codes carried "FWC-PICKUP:<donation id>:<code>"; they are still accepted.
const PAYLOAD_PREFIX = "FWC-PICKUP";

/**
 * What the donor's QR code holds: a link to the pickup page. Any phone camera or Google Lens shows it as
 * a link — the NGO/volunteer can tap it (the app opens and verifies) or copy it and paste it in the app.
 */
export function pickupLink(donationId: string, code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/pickup?id=${encodeURIComponent(donationId)}&code=${encodeURIComponent(code)}`;
}

/** The donation id and code inside a scanned / pasted QR link (or old-style payload), if there is one. */
export function parsePickupPayload(input: string): { donationId: string; code: string } | null {
  const text = input.trim();
  // A pasted link can come with extra text around it (e.g. "Open https://…" from a scanner app).
  const link = text.match(/https?:\/\/\S+/i)?.[0];
  if (link) {
    try {
      const url = new URL(link);
      const id = url.searchParams.get("id");
      const code = url.searchParams.get("code");
      if (id && code) return { donationId: id, code };
    } catch {
      // Not a valid link; fall through.
    }
  }
  const legacy = text.match(new RegExp(`${PAYLOAD_PREFIX}:([0-9a-f-]{36}):([0-9a-z-]+)`, "i"));
  if (legacy?.[1] && legacy[2]) return { donationId: legacy[1], code: legacy[2] };
  return null;
}
