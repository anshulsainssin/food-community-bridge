import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PincodePlace = {
  label: string;
  latitude: number;
  longitude: number;
};

/** Looks up coordinates for a postal code using OpenStreetMap's public geocoder. */
export const lookupPincode = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ pincode: z.string().trim().min(3).max(12), country: z.string().trim().max(56).optional() }).parse(data),
  )
  .handler(async ({ data }): Promise<PincodePlace | null> => {
    async function search(countryCodes?: string) {
      const params = new URLSearchParams({
        postalcode: data.pincode,
        format: "json",
        limit: "1",
        addressdetails: "1",
      });
      if (countryCodes) params.set("countrycodes", countryCodes);

      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          "User-Agent": "food-waste-connect/1.0 (pincode lookup)",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Postal code lookup failed [${response.status}]: ${await response.text()}`);
      }

      const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      const first = results[0];
      if (!first) return null;

      const latitude = Number.parseFloat(first.lat);
      const longitude = Number.parseFloat(first.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return { label: first.display_name, latitude, longitude };
    }

    // Only the requested country (India by default): a worldwide fallback could return a same-numbered
    // postal code in another country and put the location thousands of kilometres away.
    return search(data.country ?? "in");
  });


type Candidate = { lat: string; lon: string; display_name: string; address?: { postcode?: string; state?: string } };
type Hints = { pincode: string | null; states: string[] };

// Indian states and union territories as OpenStreetMap names them, with common short forms people type.
const STATE_NAMES: Array<[string, RegExp, RegExp?]> = [
  ["Uttar Pradesh", /uttar\s*pradesh/i, /\bU\.?\s?P\.?(?![a-z])/],
  ["Uttarakhand", /uttarakhand|uttaranchal/i],
  ["Delhi", /\bdelhi\b/i],
  ["Haryana", /haryana/i],
  ["Punjab", /punjab/i],
  ["Himachal Pradesh", /himachal/i],
  ["Rajasthan", /rajasthan/i],
  ["Madhya Pradesh", /madhya\s*pradesh/i, /\bM\.?\s?P\.?(?![a-z])/],
  ["Bihar", /bihar/i],
  ["Jharkhand", /jharkhand/i],
  ["West Bengal", /west\s*bengal/i],
  ["Maharashtra", /maharashtra/i],
  ["Gujarat", /gujarat/i],
  ["Karnataka", /karnataka/i],
  ["Tamil Nadu", /tamil\s*nadu/i],
  ["Kerala", /kerala/i],
  ["Telangana", /telangana/i],
  ["Andhra Pradesh", /andhra/i],
  ["Odisha", /odisha|orissa/i],
  ["Chhattisgarh", /chhattisgarh/i],
  ["Assam", /assam/i],
  ["Jammu and Kashmir", /jammu|kashmir/i],
  ["Goa", /\bgoa\b/i],
];

function hintsFrom(text: string): Hints {
  return {
    pincode: text.match(/\b\d{3}\s?\d{3}\b/)?.[0]?.replace(/\s/g, "") ?? null,
    // Full names in any letter case; short forms (UP, MP) only in capitals so words like "upper" don't count.
    states: STATE_NAMES.filter(([, name, short]) => name.test(text) || (short?.test(text) ?? false)).map(([state]) => state),
  };
}

const sameState = (a: string | undefined, b: string) => (a ?? "").toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase();

/**
 * Picks the result that agrees with what the donor typed: same pincode first, then same state. When the
 * address names a state and no result is in it, nothing is returned (a same-named street in another
 * state would put the pin in the wrong place).
 */
function pickCandidate(results: Candidate[], hints: Hints): PincodePlace | null {
  const valid = results.filter((r) => Number.isFinite(Number.parseFloat(r.lat)) && Number.isFinite(Number.parseFloat(r.lon)));
  const toPlace = (r: Candidate) => ({ label: r.display_name, latitude: Number.parseFloat(r.lat), longitude: Number.parseFloat(r.lon) });
  if (hints.pincode) {
    const byPin = valid.find((r) => (r.address?.postcode ?? "").replace(/\s/g, "") === hints.pincode);
    if (byPin) return toPlace(byPin);
  }
  if (hints.states.length > 0) {
    const byState = valid.find((r) => hints.states.some((state) => sameState(r.address?.state, state)));
    return byState ? toPlace(byState) : null;
  }
  return valid[0] ? toPlace(valid[0]) : null;
}

async function nominatimSearch(params: Record<string, string>, hints: Hints): Promise<PincodePlace | null> {
  const query = new URLSearchParams({ ...params, format: "json", limit: "5", addressdetails: "1", countrycodes: "in" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
    headers: { "User-Agent": "food-waste-connect/1.0 (pickup address lookup)", Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Address lookup failed [${response.status}]: ${await response.text()}`);
  }
  return pickCandidate((await response.json()) as Candidate[], hints);
}

/**
 * Coordinates for the pickup address a donor typed, so a donation's map pin and distances come from
 * its own address rather than from whichever device the donor happened to use. Tries the full
 * address, then its 6-digit pincode, then the address without its leading parts (e.g. just
 * "Rajpur Road, Dehradun, Uttarakhand"). Every step keeps to the pincode/state the donor typed.
 */
export const geocodeAddress = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ address: z.string().trim().min(3).max(300) }).parse(data))
  .handler(async ({ data }): Promise<PincodePlace | null> => {
    const hints = hintsFrom(data.address);
    const full = await nominatimSearch({ q: data.address }, hints);
    if (full) return full;
    if (hints.pincode) {
      const byPincode = await nominatimSearch({ postalcode: hints.pincode }, { pincode: hints.pincode, states: hints.states });
      if (byPincode) return byPincode;
    }
    const parts = data.address.split(",").map((part) => part.trim()).filter(Boolean);
    for (let start = 1; start < parts.length && start <= 3; start += 1) {
      const shorter = await nominatimSearch({ q: parts.slice(start).join(", ") }, hints);
      if (shorter) return shorter;
    }
    return null;
  });
