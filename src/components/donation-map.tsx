import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export type DonationMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string | undefined;
};

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export type DonationMapFocus = {
  latitude: number;
  longitude: number;
  label: string;
};

/**
 * Lightweight OpenStreetMap view with a marker per donation.
 * When `focus` is set, the map flies to that point and shows a main marker there.
 * Browser-only — render it through React.lazy + <ClientOnly>.
 */
export default function DonationMap({
  markers,
  focus,
  className,
}: {
  markers: DonationMapMarker[];
  focus?: DonationMapFocus | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const focusMarkerRef = useRef<L.Marker | null>(null);
  const markersKey = JSON.stringify(markers);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const points: L.LatLngExpression[] = [];
    for (const item of markers) {
      const marker = L.marker([item.latitude, item.longitude], { icon: markerIcon }).addTo(map);
      marker.bindPopup(
        `<strong>${item.title}</strong>${item.subtitle ? `<br/>${item.subtitle}` : ""}`,
      );
      points.push([item.latitude, item.longitude]);
    }

    const single = points[0];
    if (points.length === 1 && single) {
      map.setView(single, 15);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
    } else {
      map.setView([20.5937, 78.9629], 5);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      focusMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

  // Fly to the searched area and drop the main marker there.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    focusMarkerRef.current?.remove();
    focusMarkerRef.current = null;
    if (!focus) return;
    map.flyTo([focus.latitude, focus.longitude], 12);
    focusMarkerRef.current = L.marker([focus.latitude, focus.longitude], { icon: markerIcon })
      .addTo(map)
      .bindPopup(`<strong>${focus.label}</strong>`)
      .openPopup();
  }, [focus?.latitude, focus?.longitude, focus?.label, markersKey]);

  return <div ref={containerRef} className={className} style={{ zIndex: 0 }} />;
}
