"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map, Marker, LeafletMouseEvent } from "leaflet";

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

const DEFAULT_CENTER: [number, number] = [3.8, 109.0];
const DEFAULT_ZOOM = 6;

// Leaflet attaches this property to the container div when initialized
function clearLeafletContainer(el: HTMLElement) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (el as any)._leaflet_id;
}

export function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<Map | null>(null);
  const markerRef    = useRef<Marker | null>(null);
  // Tracks whether the async init is still relevant after a StrictMode cleanup
  const activeRef    = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    // Clear any stale Leaflet state from a previous mount (React StrictMode)
    clearLeafletContainer(container);

    import("leaflet").then((L) => {
      // Bail out if the effect was cleaned up before the import resolved
      if (!activeRef.current || !container) return;
      // Also bail if another instance already attached (race guard)
      if (mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center: [number, number] = (lat != null && lng != null) ? [lat, lng] : DEFAULT_CENTER;
      const zoom = (lat != null && lng != null) ? 14 : DEFAULT_ZOOM;

      const map = L.map(container, { center, zoom });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (lat != null && lng != null) {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          onChange(pos.lat, pos.lng);
        });
      }

      map.on("click", (e: LeafletMouseEvent) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { draggable: true }).addTo(map);
          markerRef.current.on("dragend", () => {
            const pos = markerRef.current!.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }
        onChange(clickLat, clickLng);
      });
    });

    return () => {
      activeRef.current = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      // Synchronously clear the container so the next mount finds it clean
      if (container) clearLeafletContainer(container);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pan map and move marker when lat/lng change from outside (e.g. AI fill)
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      if (lat == null || lng == null || !mapRef.current) return;
      mapRef.current.setView([lat, lng], 15);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          onChange(pos.lat, pos.lng);
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div className="relative rounded-md overflow-hidden border border-zinc-200">
      <div ref={containerRef} className="h-64 w-full" />
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/80 backdrop-blur-sm text-xs text-zinc-500 px-2 py-1 rounded shadow">
        Click map to set pin · Drag pin to adjust
      </div>
    </div>
  );
}
