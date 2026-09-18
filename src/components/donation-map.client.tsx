import "leaflet/dist/leaflet.css";

import { Link } from "@tanstack/react-router";
import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icon paths break under bundlers (they resolve relative to the
// page, not the package); point them at the actual bundled asset URLs instead.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  detail: string;
  kind: "donation" | "ngo";
  donationId?: string;
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
      {points.map((point) =>
        point.kind === "ngo" ? (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lon]}
            radius={8}
            pathOptions={{ color: "#c2410c", fillColor: "#f97316", fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>
              <p className="font-medium">{point.title}</p>
              <p className="text-xs text-muted-foreground">{point.detail}</p>
            </Popup>
          </CircleMarker>
        ) : (
          <Marker key={point.id} position={[point.lat, point.lon]} icon={defaultIcon}>
            <Popup>
              <p className="font-medium">{point.title}</p>
              <p className="text-xs text-muted-foreground">{point.detail}</p>
              {point.donationId && (
                <Link to="/donation/$donationId" params={{ donationId: point.donationId }} className="text-xs underline">
                  View donation
                </Link>
              )}
            </Popup>
          </Marker>
        ),
      )}
    </MapContainer>
  );
}
