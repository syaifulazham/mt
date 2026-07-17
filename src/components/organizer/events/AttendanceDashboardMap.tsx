"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// State centroids — fallback when a school has no lat/lng
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
  schoolId: string | null;
  schoolName: string | null;
  stateName: string | null;
  districtName: string | null;
  schoolLat: number | null;
  schoolLng: number | null;
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

  // Resolve each contingent's plot position: school lat/lng → state centroid → skip
  const plottable = contingentLocations.map((c) => {
    const lat = c.schoolLat ?? (c.stateName ? STATE_CENTROIDS[c.stateName]?.[0] : undefined);
    const lng = c.schoolLng ?? (c.stateName ? STATE_CENTROIDS[c.stateName]?.[1] : undefined);
    return lat != null && lng != null ? { ...c, lat, lng, exactCoords: c.schoolLat != null } : null;
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  // "Fit" bounds: cover all plotted contingents + event location
  const fitBounds: [[number, number], [number, number]] | null = (() => {
    const points: [number, number][] = plottable.map((c) => [c.lat, c.lng]);
    if (eventLat != null && eventLng != null) points.push([eventLat, eventLng]);
    if (points.length === 0) return null;
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    return [
      [Math.min(...lats) - 0.3, Math.min(...lngs) - 0.3],
      [Math.max(...lats) + 0.3, Math.max(...lngs) + 0.3],
    ];
  })();

  const activeBounds: [[number, number], [number, number]] | null =
    view === "fit" ? fitBounds : PRESET_BOUNDS[view];

  const presentCount = plottable.filter((c) => c.present).length;
  const exactCount   = plottable.filter((c) => c.exactCoords).length;

  return (
    <div className="relative">
      {/* View toggle */}
      <div className="absolute top-3 right-3 z-[1000] flex rounded-lg overflow-hidden shadow border border-zinc-200 bg-white text-[11px] font-semibold">
        {(["malaysia", "peninsular", "sabah", "sarawak", "fit"] as ViewKey[]).map((v, i) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={[
              "px-2.5 py-1.5 transition-colors whitespace-nowrap",
              i > 0 ? "border-l border-zinc-200" : "",
              view === v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100",
            ].join(" ")}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Coordinate source note */}
      {plottable.length > 0 && (
        <div className="absolute bottom-8 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-zinc-500 shadow">
          {exactCount > 0
            ? <><span className="font-semibold text-zinc-700">{exactCount}</span> koordinat sebenar · <span className="font-semibold text-zinc-700">{plottable.length - exactCount}</span> anggaran negeri</>
            : `${plottable.length} plot (anggaran negeri)`}
        </div>
      )}

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

        {/* Individual contingent markers */}
        {plottable.map((c) => (
          <CircleMarker
            key={c.contingentId}
            center={[c.lat, c.lng]}
            radius={c.exactCoords ? 8 : 6}
            pathOptions={{
              color:       c.present ? "#059669" : "#dc2626",
              weight:      c.exactCoords ? 2 : 1.5,
              fillColor:   c.present ? "#10b981" : "#ef4444",
              fillOpacity: c.exactCoords ? 0.85 : 0.55,
              dashArray:   c.exactCoords ? undefined : "4 2",
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div style={{ fontSize: 11, maxWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{c.schoolName ?? c.name}</div>
                {c.districtName && <div style={{ color: "#6b7280" }}>{c.districtName}, {c.stateName}</div>}
                <div style={{ color: c.present ? "#059669" : "#dc2626", marginTop: 2 }}>
                  {c.present ? "✓ Hadir" : "✗ Belum hadir"}
                </div>
                {!c.exactCoords && <div style={{ color: "#9ca3af", fontSize: 10, marginTop: 2 }}>* koordinat anggaran negeri</div>}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 px-1 pt-2 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 border-2 border-emerald-700" />
          Hadir ({presentCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-red-400 border-2 border-red-600" />
          Belum hadir ({plottable.length - presentCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-500 border-2 border-blue-700" />
          Lokasi Acara
        </span>
        {plottable.length - exactCount > 0 && (
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="inline-block h-3 w-3 rounded-full border border-dashed border-zinc-400" style={{ background: "rgba(239,68,68,0.4)" }} />
            Anggaran (tiada koordinat)
          </span>
        )}
      </div>
    </div>
  );
}
