"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map, Marker } from "leaflet";

interface MapViewProps {
  lat: number;
  lng: number;
}

function clearLeafletContainer(el: HTMLElement) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (el as any)._leaflet_id;
}

export function MapView({ lat, lng }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<Map | null>(null);
  const markerRef    = useRef<Marker | null>(null);
  const activeRef    = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    clearLeafletContainer(container);

    import("leaflet").then((L) => {
      if (!activeRef.current || !container || mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(container, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
        doubleClickZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      markerRef.current = L.marker([lat, lng]).addTo(map);
    });

    return () => {
      activeRef.current = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      if (container) clearLeafletContainer(container);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center and move marker when coordinates change
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    mapRef.current.setView([lat, lng], 15);
    markerRef.current.setLatLng([lat, lng]);
  }, [lat, lng]);

  return (
    <div className="rounded-md overflow-hidden border border-zinc-200">
      <div ref={containerRef} className="h-52 w-full" />
    </div>
  );
}
