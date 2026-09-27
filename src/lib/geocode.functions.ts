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

