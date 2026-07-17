"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const STATE_CENTROIDS: Record<string, [number, number]> = {
  "Johor":           [1.9344,  103.3587],
  "Kedah":           [5.7964,  100.6497],
  "Kelantan":        [5.7487,  102.0000],
  "Melaka":          [2.2055,  102.2501],
  "Negeri Sembilan": [2.7258,  101.9424],
  "Pahang":          [3.8126,  103.3256],
  "Perak":           [4.5921,  101.0901],
  "Perlis":          [6.4449,  100.2048],
  "Pulau Pinang":    [5.4141,  100.3288],
  "Sabah":           [5.9788,  116.0753],
  "Sarawak":         [1.5533,  110.3592],
  "Selangor":        [3.0738,  101.5183],
  "Terengganu":      [5.3117,  103.1324],
  "Kuala Lumpur":    [3.1390,  101.6869],
  "Labuan":          [5.2831,  115.2308],
  "Putrajaya":       [2.9264,  101.6964],
};

type ViewKey = "malaysia" | "peninsular" | "sabah" | "sarawak" | "fit";

const PRESET_BOUNDS: Record<Exclude<ViewKey, "fit">, [[number, number], [number, number]]> = {
  malaysia:   [[0.85, 99.5], [7.4, 119.5]],
  peninsular: [[1.1,  99.5], [6.8, 104.7]],
  sabah:      [[4.0, 115.4], [7.4, 119.4]],
  sarawak:    [[0.85, 109.3], [5.2, 115.9]],
};

const VIEW_LABELS: Record<ViewKey, string> = {
  malaysia:   "Malaysia",
  peninsular: "Semenanjung",
  sabah:      "Sabah",
  sarawak:    "Sarawak",
  fit:        "Semua Kontingen",
};

// Imperatively fits the map bounds whenever the `bounds` prop changes key
function MapBoundsController({ bounds }: { bounds: [[number, number], [number, number]] | null }) {
  const map = useMap();
  const prevKey = useRef<string>("");
  useEffect(() => {
    if (!bounds) return;
    const key = JSON.stringify(bounds);
    if (key === prevKey.current) return;
    prevKey.current = key;
    map.fitBounds(bounds, { padding: [30, 30], animate: true });
  }, [map, bounds]);
  return null;
}

// Venue marker icon fix (Next.js can't inline leaflet CSS assets)
function FixLeafletIcons() {
  const map = useMap();
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
    map.invalidateSize();
  }, [map]);
  return null;
}

export type ContingentLocation = {
  contingentId: string;
  name: string;
  schoolName: string | null;
  stateName: string | null;
  districtName: string | null;
  present: boolean;
};

type Props = {
  contingentLocations: ContingentLocation[];
  eventLat: number | null;
  eventLng: number | null;
  eventVenue: string | null;
};

export default function AttendanceDashboardMap({
  contingentLocations,
  eventLat,
  eventLng,
  eventVenue,
}: Props) {
  const [view, setView] = useState<ViewKey>("malaysia");

  // Group contingents by state
  const stateGroups = new Map<string, { total: number; present: number; items: ContingentLocation[] }>();
  for (const c of contingentLocations) {
    const state = c.stateName ?? "Lain-lain";
    if (!stateGroups.has(state)) stateGroups.set(state, { total: 0, present: 0, items: [] });
    const g = stateGroups.get(state)!;
    g.total++;
    if (c.present) g.present++;
    g.items.push(c);
  }

  // Compute "fit" bounds from state centroids of active contingents + event location
  const fitBounds: [[number, number], [number, number]] | null = (() => {
    const points: [number, number][] = [];
    for (const [state] of stateGroups.entries()) {
      const c = STATE_CENTROIDS[state];
      if (c) points.push(c);
    }
    if (eventLat != null && eventLng != null) points.push([eventLat, eventLng]);
    if (points.length === 0) return null;
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    return [
      [Math.min(...lats) - 0.5, Math.min(...lngs) - 0.5],
      [Math.max(...lats) + 0.5, Math.max(...lngs) + 0.5],
    ];
  })();

  const activeBounds: [[number, number], [number, number]] | null =
    view === "fit" ? fitBounds : PRESET_BOUNDS[view];

  return (
    <div className="relative">
      {/* View toggle buttons — overlaid on top-right of map */}
      <div className="absolute top-3 right-3 z-[1000] flex rounded-lg overflow-hidden shadow border border-zinc-200 bg-white text-[11px] font-semibold">
        {(["malaysia", "peninsular", "sabah", "sarawak", "fit"] as ViewKey[]).map((v, i) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={[
              "px-2.5 py-1.5 transition-colors whitespace-nowrap",
              i > 0 ? "border-l border-zinc-200" : "",
              view === v
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-100",
            ].join(" ")}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      <MapContainer
        center={[4.5, 109.5]}
        zoom={6}
        scrollWheelZoom={false}
        style={{ height: "420px", width: "100%" }}
      >
        <FixLeafletIcons />
        <MapBoundsController bounds={activeBounds} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Event venue marker */}
        {eventLat != null && eventLng != null && (
          <Marker position={[eventLat, eventLng]}>
            <Popup>
              <div className="text-xs font-semibold">Lokasi Acara</div>
              {eventVenue && <div className="text-xs text-zinc-500 mt-0.5">{eventVenue}</div>}
            </Popup>
          </Marker>
        )}

        {/* State cluster circles */}
        {[...stateGroups.entries()].map(([state, g]) => {
          const centroid = STATE_CENTROIDS[state];
          if (!centroid) return null;

          const allPresent  = g.present === g.total && g.total > 0;
          const nonePresent = g.present === 0;
          const fillColor = allPresent ? "#10b981" : nonePresent ? "#ef4444" : "#f59e0b";
          const radius = Math.max(18, Math.min(40, 12 + g.total * 2.5));

          return (
            <CircleMarker
              key={state}
              center={centroid}
              radius={radius}
              pathOptions={{
                color: "white",
                weight: 2.5,
                fillColor,
                fillOpacity: 0.82,
              }}
            >
              <Tooltip permanent direction="center" opacity={1}>
                <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>
                  {g.present}/{g.total}
                </span>
              </Tooltip>
              <Popup maxWidth={280}>
                <div style={{ fontSize: 12 }}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>{state}</p>
                  <p style={{ marginBottom: 6 }}>
                    Hadir: <strong>{g.present}</strong> / {g.total} kontingen
                  </p>
                  <ul style={{ maxHeight: 160, overflowY: "auto", paddingLeft: 0, listStyle: "none", margin: 0 }}>
                    {g.items.map((c) => (
                      <li key={c.contingentId} style={{ color: c.present ? "#059669" : "#dc2626", marginBottom: 2 }}>
                        {c.present ? "✓" : "✗"} {c.schoolName ?? c.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
