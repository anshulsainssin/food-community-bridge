import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export type TrackingPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

export type CollectorPoint = TrackingPoint & { accuracyM: number | null };

const pickupIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const collectorIcon = L.divIcon({
  className: "",
  html: '<div class="live-marker"><span class="live-marker__pulse"></span><span class="live-marker__dot"></span></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Live pickup map: the donation's pickup point and the NGO/volunteer's moving GPS position, joined by
 * a dashed line. The map is created once; markers move in place as new positions arrive.
 * `recenterKey` changes → fit both points again. Browser-only — render it through React.lazy + <ClientOnly>.
 */
export default function LiveTrackingMap({
  pickup,
  collector,
  recenterKey = 0,
  className,
}: {
  pickup: TrackingPoint | null;
  collector: CollectorPoint | null;
  recenterKey?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const collectorMarkerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  // Fit both points the first time the collector shows up; after that only follow them when they leave the view.
  const fittedWithCollector = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.setView([20.5937, 78.9629], 5);
    return () => {
      map.remove();
      mapRef.current = null;
      pickupMarkerRef.current = null;
      collectorMarkerRef.current = null;
      accuracyRef.current = null;
      lineRef.current = null;
      fittedWithCollector.current = false;
    };
  }, []);

  const fit = (map: L.Map) => {
    const points: L.LatLngExpression[] = [];
    if (pickup) points.push([pickup.latitude, pickup.longitude]);
    if (collector) points.push([collector.latitude, collector.longitude]);
    if (points.length === 1 && points[0]) map.setView(points[0], 15);
    else if (points.length > 1)
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
  };

  // Pickup point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pickupMarkerRef.current?.remove();
    pickupMarkerRef.current = null;
    if (!pickup) return;
    pickupMarkerRef.current = L.marker([pickup.latitude, pickup.longitude], { icon: pickupIcon })
      .addTo(map)
      .bindPopup(`<strong>Pickup point</strong><br/>${escapeHtml(pickup.label)}`);
    if (!collector) map.setView([pickup.latitude, pickup.longitude], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.latitude, pickup?.longitude, pickup?.label]);

  // Live collector position, accuracy circle and the line to the pickup point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!collector) {
      collectorMarkerRef.current?.remove();
      accuracyRef.current?.remove();
      lineRef.current?.remove();
      collectorMarkerRef.current = null;
      accuracyRef.current = null;
      lineRef.current = null;
      fittedWithCollector.current = false;
      return;
    }
    const at = L.latLng(collector.latitude, collector.longitude);
    if (collectorMarkerRef.current) {
      collectorMarkerRef.current.setLatLng(at);
      collectorMarkerRef.current.setPopupContent(`<strong>${escapeHtml(collector.label)}</strong>`);
    } else {
      collectorMarkerRef.current = L.marker(at, { icon: collectorIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(collector.label)}</strong>`);
    }

    const accuracy = collector.accuracyM;
    if (accuracy != null && accuracy > 0 && accuracy < 2_000) {
      if (accuracyRef.current) {
        accuracyRef.current.setLatLng(at);
        accuracyRef.current.setRadius(accuracy);
      } else {
        accuracyRef.current = L.circle(at, {
          radius: accuracy,
          stroke: false,
          fillOpacity: 0.12,
          interactive: false,
          className: "live-accuracy",
        }).addTo(map);
      }
    } else {
      accuracyRef.current?.remove();
      accuracyRef.current = null;
    }

    if (pickup) {
      const path: L.LatLngExpression[] = [at, [pickup.latitude, pickup.longitude]];
      if (lineRef.current) lineRef.current.setLatLngs(path);
      else
        lineRef.current = L.polyline(path, {
          dashArray: "6 8",
          weight: 3,
          opacity: 0.8,
          interactive: false,
          className: "live-route",
        }).addTo(map);
    }

    if (!fittedWithCollector.current) {
      fittedWithCollector.current = true;
      fit(map);
    } else if (!map.getBounds().pad(-0.1).contains(at)) {
      map.panTo(at);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    collector?.latitude,
    collector?.longitude,
    collector?.accuracyM,
    collector?.label,
    pickup?.latitude,
    pickup?.longitude,
  ]);

  // "Show both" button.
  useEffect(() => {
    const map = mapRef.current;
    if (map && recenterKey > 0) fit(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  return <div ref={containerRef} className={className} style={{ zIndex: 0 }} />;
}
