import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lookupLocation } from "@/lib/geocode.functions";

export type Coords = { latitude: number; longitude: number };

export type SearchArea = {
  coords: Coords | null;
  label: string | null;
  source: "device" | "profile" | "search" | null;
};

export type NearbyNgo = {
  id: string;
  full_name: string | null;
  organization: string | null;
  role: string | null;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  active_claims: number;
  urgent_claims: number;
};

/**
 * Resolves the area to search in: the device location when the browser allows it,
 * the saved profile location otherwise, or a manually entered location/pincode.
 */
export function useSearchArea(profileCoords: Coords | null, profileLabel: string | null) {
  const [area, setArea] = useState<SearchArea>({ coords: null, label: null, source: null });
  const [detecting, setDetecting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fall back to the saved profile location until something better is known.
  useEffect(() => {
    setArea((current) => {
      if (current.source === "device" || current.source === "search") return current;
      if (!profileCoords) return current;
      return { coords: profileCoords, label: profileLabel, source: "profile" };
    });
  }, [profileCoords?.latitude, profileCoords?.longitude, profileLabel]);

  const detect = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser cannot detect your location.");
      return;
    }
    setError(null);
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDetecting(false);
        setError(null);
        setArea({
          coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          label: "Your current location",
          source: "device",
        });
      },
      (geoError) => {
        setDetecting(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Location permission was declined. Allow location access or search by location/pincode instead.");
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          setError("Your location is unavailable right now. Try again or search by location/pincode.");
        } else if (geoError.code === geoError.TIMEOUT) {
          setError("Locating you took too long. Try again or search by location/pincode.");
        } else {
          setError("Could not detect your location. Search by location/pincode instead.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  // Try the device location once on mount.
  useEffect(() => {
    detect();
  }, [detect]);

  const searchLocation = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Enter a location or postal code.");
      return;
    }
    setError(null);
    setSearching(true);
    try {
      const place = await lookupLocation({ data: { query: trimmed } });
      if (!place) {
        setError(`No location found for "${trimmed}".`);
        return;
      }
      setArea({
        coords: { latitude: place.latitude, longitude: place.longitude },
        label: place.label,
        source: "search",
      });
    } catch {
      setError("Location lookup is unavailable right now.");
    } finally {
      setSearching(false);
    }
  }, []);

  return { area, detect, detecting, searchLocation, searching, error };
}

/** Nearby NGOs and volunteers, ordered by how urgent their pickups are. */
export function useNearbyNgos(coords: Coords | null, radiusKm: number, enabled: boolean) {
  const [ngos, setNgos] = useState<NearbyNgo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setNgos([]);
      return;
    }
    setLoading(true);
    const args = {
      p_lat: coords?.latitude ?? null,
      p_lon: coords?.longitude ?? null,
      p_radius_km: radiusKm > 0 ? radiusKm : 25,
    } as unknown as { p_lat: number; p_lon: number; p_radius_km: number };
    const { data, error } = await supabase.rpc("nearby_urgent_ngos", args);

    if (error) console.error(error);
    setNgos(((data as NearbyNgo[] | null) ?? []).map((row) => ({
      ...row,
      active_claims: Number(row.active_claims ?? 0),
      urgent_claims: Number(row.urgent_claims ?? 0),
    })));
    setLoading(false);
  }, [coords?.latitude, coords?.longitude, radiusKm, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ngos, loading, reload: load };
}
