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

    // Prefer a match in the requested country, then fall back to a worldwide search.
    return (await search(data.country ?? "in")) ?? (await search());
  });


async function nominatimSearch(params: Record<string, string>): Promise<PincodePlace | null> {
  const query = new URLSearchParams({ ...params, format: "json", limit: "1", countrycodes: "in" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
    headers: { "User-Agent": "food-waste-connect/1.0 (pickup address lookup)", Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Address lookup failed [${response.status}]: ${await response.text()}`);
  }
  const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const first = results[0];
  if (!first) return null;
  const latitude = Number.parseFloat(first.lat);
  const longitude = Number.parseFloat(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { label: first.display_name, latitude, longitude };
}

/**
 * Coordinates for the pickup address a donor typed, so a donation's map pin and distances come from
 * its own address rather than from whichever device the donor happened to use. Tries the full
 * address, then its 6-digit pincode, then the address without its leading parts (e.g. just
 * "Civil Lines, Moradabad, Uttar Pradesh").
 */
export const geocodeAddress = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ address: z.string().trim().min(3).max(300) }).parse(data))
  .handler(async ({ data }): Promise<PincodePlace | null> => {
    const full = await nominatimSearch({ q: data.address });
    if (full) return full;
    const pincode = data.address.match(/\b\d{6}\b/)?.[0];
    if (pincode) {
      const byPincode = await nominatimSearch({ postalcode: pincode });
      if (byPincode) return byPincode;
    }
    const parts = data.address.split(",").map((part) => part.trim()).filter(Boolean);
    for (let start = 1; start < parts.length && start <= 3; start += 1) {
      const shorter = await nominatimSearch({ q: parts.slice(start).join(", ") });
      if (shorter) return shorter;
    }
    return null;
  });
