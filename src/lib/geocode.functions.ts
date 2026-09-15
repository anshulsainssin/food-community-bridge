import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type GeocodedPlace = {
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Looks up coordinates for a free-text location (postal code, village, district, or
 * state — e.g. "110001", "Saharanpur", or "UP, Saharanpur, Titron") using OpenStreetMap's
 * public geocoder.
 */
export const lookupLocation = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ query: z.string().trim().min(2).max(120), country: z.string().trim().max(56).optional() }).parse(data),
  )
  .handler(async ({ data }): Promise<GeocodedPlace | null> => {
    async function search(query: string, countryCodes?: string) {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        limit: "1",
        addressdetails: "1",
      });
      if (countryCodes) params.set("countrycodes", countryCodes);

      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          "User-Agent": "food-waste-connect/1.0 (location lookup)",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Location lookup failed [${response.status}]: ${await response.text()}`);
      }

      const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      const first = results[0];
      if (!first) return null;

      const latitude = Number.parseFloat(first.lat);
      const longitude = Number.parseFloat(first.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return { label: first.display_name, latitude, longitude };
    }

    const countryCodes = data.country ?? "in";

    // A bare 6-digit PIN code (e.g. "247343") often returns nothing from Nominatim on its
    // own, especially for rural codes — appending ", India" gives it enough context to match.
    if (/^\d{6}$/.test(data.query)) {
      return (
        (await search(`${data.query}, India`, countryCodes)) ??
        (await search(data.query, countryCodes)) ??
        (await search(data.query))
      );
    }

    // Prefer a match in the requested country; if that comes back empty (small villages like
    // "Titron" often aren't indexed on their own), retry with the state appended before
    // falling back to a worldwide search.
    return (
      (await search(data.query, countryCodes)) ??
      (await search(`${data.query}, Uttar Pradesh, India`, countryCodes)) ??
      (await search(data.query))
    );
  });

