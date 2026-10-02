import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "@/lib/geo";
import type { Tables } from "@/integrations/supabase/types";

export type PickupLocation = Tables<"pickup_locations">;

// Send a new position at most every 5 s, and at least every 30 s while standing still (so the donor
// can see the location is still live). Smaller moves than 10 m between sends are GPS noise.
const MIN_SEND_MS = 5_000;
const KEEPALIVE_MS = 30_000;
const MIN_MOVE_KM = 0.01;

const storageKey = (donationId: string) => `fwc-live-share:${donationId}`;

function rememberSharing(donationId: string, on: boolean) {
  try {
    if (on) localStorage.setItem(storageKey(donationId), "1");
    else localStorage.removeItem(storageKey(donationId));
  } catch {
    // Storage can be unavailable (private mode); sharing then just doesn't resume after a reload.
  }
}

function wasSharing(donationId: string) {
  try {
    return localStorage.getItem(storageKey(donationId)) === "1";
  } catch {
    return false;
  }
}

function geoErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location access is blocked. Allow location for this site in your browser settings, then try again.";
  }
  if (error.code === error.POSITION_UNAVAILABLE)
    return "Your phone couldn't find its GPS position. Turn on location / GPS and try again.";
  return "Finding your GPS position is taking too long. Move to an open area and try again.";
}

/**
 * NGO/volunteer side: while `enabled` (they claimed the donation and it is waiting for pickup), share the
 * phone's GPS position with the donor. Sharing runs while this page is open; once started it resumes
 * automatically after a reload.
 */
export function useShareLiveLocation(donationId: string | null, enabled: boolean) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [position, setPosition] = useState<{
    lat: number;
    lon: number;
    accuracy: number | null;
  } | null>(null);
  const lastSent = useRef<{ at: number; lat: number; lon: number; accuracy: number | null } | null>(
    null,
  );
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  // Resume sharing after a reload, if it was on for this donation.
  useEffect(() => {
    if (donationId && enabled && supported && wasSharing(donationId)) setSharing(true);
    if (!enabled) setSharing(false);
  }, [donationId, enabled, supported]);

  useEffect(() => {
    if (!sharing || !donationId || !enabled || !supported) return;
    let cancelled = false;
    lastSent.current = null;

    const send = async (lat: number, lon: number, accuracy: number | null) => {
      const now = Date.now();
      const previous = lastSent.current;
      if (previous) {
        const elapsed = now - previous.at;
        const moved = distanceKm({ lat, lon }, { lat: previous.lat, lon: previous.lon });
        if (elapsed < MIN_SEND_MS) return;
        if (moved < MIN_MOVE_KM && elapsed < KEEPALIVE_MS) return;
      }
      lastSent.current = { at: now, lat, lon, accuracy };
      const { error: rpcError } = await supabase.rpc("share_pickup_location", {
        p_donation_id: donationId,
        p_latitude: lat,
        p_longitude: lon,
        ...(accuracy != null ? { p_accuracy_m: accuracy } : {}),
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setError(null);
      setLastSentAt(now);
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const accuracy = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy });
        void send(pos.coords.latitude, pos.coords.longitude, accuracy);
      },
      (geoError) => {
        if (cancelled) return;
        setError(geoErrorMessage(geoError));
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setSharing(false);
          rememberSharing(donationId, false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );

    // watchPosition only reports when the phone moves; keep the donor's "last updated" fresh anyway.
    const keepAlive = window.setInterval(() => {
      const previous = lastSent.current;
      if (previous && Date.now() - previous.at >= KEEPALIVE_MS)
        void send(previous.lat, previous.lon, previous.accuracy);
    }, KEEPALIVE_MS);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(keepAlive);
    };
  }, [sharing, donationId, enabled, supported]);

  const start = useCallback(() => {
    if (!donationId) return;
    if (!supported) {
      setError(
        "This browser can't share GPS location. Open the app in Chrome or Safari on your phone.",
      );
      return;
    }
    setError(null);
    rememberSharing(donationId, true);
    setSharing(true);
  }, [donationId, supported]);

  const stop = useCallback(async () => {
    if (!donationId) return;
    rememberSharing(donationId, false);
    setSharing(false);
    setPosition(null);
    setLastSentAt(null);
    await supabase.rpc("stop_pickup_location", { p_donation_id: donationId });
  }, [donationId]);

  return { supported, sharing, error, lastSentAt, position, start, stop };
}

/** Donor (and claimer) side: the collector's latest shared position, updated in real time. */
export function usePickupLocation(donationId: string | null) {
  const [location, setLocation] = useState<PickupLocation | null>(null);

  const load = useCallback(async () => {
    if (!donationId) {
      setLocation(null);
      return;
    }
    const { data } = await supabase
      .from("pickup_locations")
      .select("*")
      .eq("donation_id", donationId)
      .maybeSingle();
    setLocation((data as PickupLocation | null) ?? null);
  }, [donationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!donationId) return;
    const channel = supabase
      .channel(`pickup-location-${donationId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pickup_locations",
          filter: `donation_id=eq.${donationId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") setLocation(null);
          else setLocation(payload.new as PickupLocation);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [donationId]);

  return { location, reload: load };
}
