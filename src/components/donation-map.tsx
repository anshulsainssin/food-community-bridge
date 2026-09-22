import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import type { MapPoint } from "./donation-map.client";

export type { MapPoint } from "./donation-map.client";

type MapModule = typeof import("./donation-map.client");

// Leaflet touches `window`/`document` on import, which breaks TanStack Start's SSR pass.
// createClientOnlyFn is a compiler-recognized boundary: the server build strips this
// callback entirely, so the client-only module is never pulled into the server bundle.
const loadMapModule = createClientOnlyFn(() => import("./donation-map.client"));

/** Loads the real map only after the component has mounted in the browser. */
export function DonationMap({ center, points }: { center: { lat: number; lon: number } | null; points: MapPoint[] }) {
  const [mod, setMod] = useState<MapModule | null>(null);

  useEffect(() => {
    let active = true;
    void loadMapModule().then((loaded) => {
      if (active) setMod(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!mod) {
    return (
      <div className="flex h-80 w-full items-center justify-center border border-border-strong bg-muted/25 text-sm text-muted-foreground">
        Loading map…
      </div>
    );
  }

  const { MapPanel } = mod;
  return (
    <div className="h-80 w-full overflow-hidden border border-border-strong">
      <MapPanel center={center} points={points} />
    </div>
  );
}
