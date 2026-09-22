import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  detail: string;
  kind: "ngo" | "center";
};

function FitToPoints({ center, points }: { center: { lat: number; lon: number } | null; points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    // A known center (from search or "Use my location") always wins: fly smoothly straight
    // to it at a fixed, legible zoom, regardless of how far scattered the donation/NGO pins
    // are — that's what "search this pincode" or "use my location" means. Only fall back to
    // fitting the pins' bounding box when no center has been resolved yet at all.
    if (center) {
      map.flyTo([center.lat, center.lon], 13, { duration: 1.25 });
      return;
    }
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 13 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center?.lat, center?.lon, points.map((p) => `${p.id}:${p.lat}:${p.lon}`).join(",")]);

  return null;
}

export function MapPanel({ center, points }: { center: { lat: number; lon: number } | null; points: MapPoint[] }) {
  const initialCenter: [number, number] = center
    ? [center.lat, center.lon]
    : points.length > 0
      ? [points[0]!.lat, points[0]!.lon]
      : [20.5937, 78.9629]; // India, used only until real coordinates are known

  return (
    <MapContainer
      center={initialCenter}
      zoom={center ? 13 : 5}
      scrollWheelZoom={false}
      className="h-80 w-full"
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitToPoints center={center} points={points} />
      {center && (
        <CircleMarker center={[center.lat, center.lon]} radius={9} pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 2 }}>
          <Popup>You are here</Popup>
        </CircleMarker>
      )}
      {points.map((point) => (
        <CircleMarker
          key={point.id}
          center={[point.lat, point.lon]}
          radius={point.kind === "center" ? 9 : 8}
          pathOptions={
            point.kind === "center"
              ? { color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.9, weight: 2 }
              : { color: "#c2410c", fillColor: "#f97316", fillOpacity: 0.9, weight: 2 }
          }
        >
          <Popup>
            <p className="font-medium">{point.title}</p>
            <p className="text-xs text-muted-foreground">{point.detail}</p>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
