"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, Building2, UserCheck, BookUser,
  RefreshCw, MapPin, Ruler, X, Loader2, AlertCircle, ChevronDown, ChevronUp, Play,
} from "lucide-react";
import type { ContingentLocation } from "./AttendanceDashboardMap";

// ── Dynamic import: Leaflet must be client-side only ──────────────────────────
const AttendanceDashboardMap = dynamic(
  () => import("./AttendanceDashboardMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] bg-zinc-100 animate-pulse rounded-lg flex items-center justify-center">
        <span className="text-zinc-400 text-sm">Memuatkan peta…</span>
      </div>
    ),
  },
);

// ── Types ─────────────────────────────────────────────────────────────────────

type StatPair = { total: number; present: number };

type DashboardStats = {
  event: {
    name: string;
    venue: string | null;
    latitude: number | null;
    longitude: number | null;
    stateName: string | null;
  };
  overall: {
    contingents:  StatPair;
    managers:     StatPair;
    teams:        StatPair;
    participants: StatPair;
  };
  byTargetGroup: {
    id: string;
    name: string;
    schoolLevel: string;
    contingents:  StatPair;
    managers:     StatPair;
    teams:        StatPair;
    participants: StatPair;
  }[];
  contingentLocations: ContingentLocation[];
};

type DistanceRecord = {
  id: string;
  contingentId: string;
  schoolName: string;
  stateName: string;
  districtName: string;
  status: "PROCESSING" | "DONE" | "ERROR";
  roadKm: number | null;
  airKm: number | null;
  waterKm: number | null;
};

type Props = {
  event: {
    id: string;
    name: string;
    slug: string;
    venue: string | null;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    startDate: Date | null;
    endDate: Date | null;
    state: { name: string } | null;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BAR_TOTAL   = "#d1d5db"; // gray-300
const BAR_PRESENT = "#10b981"; // emerald-500

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(present: number, total: number) {
  if (total === 0) return 0;
  return Math.round((present / total) * 100);
}

function fmt(n: number) {
  return n.toLocaleString("en-MY");
}

function fmtDate(d: Date | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" });
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  icon: Icon,
  stat,
}: {
  label: string;
  icon: React.ElementType;
  stat: StatPair;
}) {
  const p = pct(stat.present, stat.total);
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</span>
        <Icon className="h-4 w-4 text-zinc-300" />
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black font-mono tabular-nums text-emerald-600">{fmt(stat.present)}</span>
          <span className="text-base font-mono text-zinc-400">/ {fmt(stat.total)}</span>
        </div>
        <div className="text-[11px] text-zinc-400 mt-0.5">{p}% hadir</div>
      </div>
      <div className="w-full bg-zinc-100 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-emerald-500 transition-all duration-700"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-zinc-700 mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.fill }} />
          <span className="text-zinc-500">{p.name}:</span>
          <span className="font-mono font-semibold text-zinc-800">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b-2 border-zinc-900 pb-1 mb-4">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{children}</h2>
    </div>
  );
}

// ── Sort button for distance table ───────────────────────────────────────────

function SortBtn({
  col, label, sortCol, setSortCol,
}: {
  col: "road" | "air" | "water";
  label: string;
  sortCol: "road" | "air" | "water";
  setSortCol: (c: "road" | "air" | "water") => void;
}) {
  return (
    <button
      onClick={() => setSortCol(col)}
      className={`flex items-center gap-1 ${sortCol === col ? "text-emerald-600 font-bold" : "text-zinc-400 hover:text-zinc-600"}`}
    >
      {label}
      {sortCol === col ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </button>
  );
}

// ── Distance modal ────────────────────────────────────────────────────────────

// States in Borneo Malaysia; everything else = Peninsular (or unknown)
const BORNEO_STATES = new Set(["Sabah", "Sarawak", "Labuan"]);
function getRegion(state: string | null): "borneo" | "peninsular" | null {
  if (!state) return null;
  return BORNEO_STATES.has(state) ? "borneo" : "peninsular";
}

function DistanceModal({
  eventId,
  contingentLocations,
  eventVenue,
  eventStateName,
  onClose,
}: {
  eventId: string;
  contingentLocations: ContingentLocation[];
  eventVenue: string | null;
  eventStateName: string | null;
  onClose: () => void;
}) {
  const [records,      setRecords]      = useState<DistanceRecord[]>([]);
  const [initialLoad,  setInitialLoad]  = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [startError,   setStartError]   = useState<string | null>(null);
  const [sortCol,      setSortCol]      = useState<"road" | "air" | "water">("road");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll every 2 s while modal is open; stop when no PROCESSING records
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/attendance/distance-records`).catch(() => null);
      if (!res || cancelled) return;
      const json = await res.json();
      const data: DistanceRecord[] = json.data ?? [];
      if (!cancelled) {
        setRecords(data);
        setInitialLoad(true);
        // Stop interval if nothing is still PROCESSING
        if (!data.some((r) => r.status === "PROCESSING") && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }

    void load();
    pollRef.current = setInterval(() => void load(), 2000);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [eventId]);

  async function handleStart() {
    setStartLoading(true);
    setStartError(null);
    try {
      const res  = await fetch(`/api/v2/organizer/events/${eventId}/attendance/distance-table/start`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      // Re-fetch immediately so green dots appear
      const rec = await fetch(`/api/v2/organizer/events/${eventId}/attendance/distance-records`);
      const rd  = await rec.json();
      setRecords(rd.data ?? []);
      // Re-start polling if it stopped
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          const r2 = await fetch(`/api/v2/organizer/events/${eventId}/attendance/distance-records`).catch(() => null);
          if (!r2) return;
          const j2 = await r2.json();
          const d2: DistanceRecord[] = j2.data ?? [];
          setRecords(d2);
          if (!d2.some((x) => x.status === "PROCESSING") && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 2000);
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Ralat semasa memulakan proses");
    } finally {
      setStartLoading(false);
    }
  }

  // Build a lookup: contingentId → record
  const recordMap = new Map(records.map((r) => [r.contingentId, r]));

  const doneRows = contingentLocations
    .filter((c) => recordMap.get(c.contingentId)?.status === "DONE")
    .sort((a, b) => {
      const ra = recordMap.get(a.contingentId)!;
      const rb = recordMap.get(b.contingentId)!;
      if (sortCol === "road")  return (ra.roadKm  ?? 0) - (rb.roadKm  ?? 0);
      if (sortCol === "air")   return (ra.airKm   ?? 0) - (rb.airKm   ?? 0);
      if (sortCol === "water") return (ra.waterKm ?? Infinity) - (rb.waterKm ?? Infinity);
      return 0;
    });
  const processingRows = contingentLocations.filter((c) => recordMap.get(c.contingentId)?.status === "PROCESSING");
  const errorRows      = contingentLocations.filter((c) => recordMap.get(c.contingentId)?.status === "ERROR");
  const pendingRows    = contingentLocations.filter((c) => !recordMap.has(c.contingentId));
  const displayRows    = [...doneRows, ...processingRows, ...errorRows, ...pendingRows];

  const hasWater   = records.some((r) => r.waterKm != null);
  const eventRegion = getRegion(eventStateName);
  // Only show air km when there's a cross-region pair (Peninsular ↔ Borneo)
  const showAirForContingent = (stateName: string | null) =>
    eventRegion === null || getRegion(stateName) !== eventRegion;
  const allDone    = pendingRows.length === 0 && processingRows.length === 0 && errorRows.length === 0;
  const anyProcessing = processingRows.length > 0;
  const canStart   = pendingRows.length > 0 || errorRows.length > 0;

  const doneKmTotals = doneRows.reduce(
    (acc, c) => {
      const r = recordMap.get(c.contingentId)!;
      acc.road  += r.roadKm  ?? 0;
      acc.air   += r.airKm   ?? 0;
      acc.water += r.waterKm ?? 0;
      return acc;
    },
    { road: 0, air: 0, water: 0 },
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-100">
          <div>
            <h2 className="font-black text-base uppercase tracking-wide">Jadual Jarak</h2>
            {eventVenue && (
              <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" />{eventVenue}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Status summary */}
            {initialLoad && (
              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />{doneRows.length} selesai</span>
                {anyProcessing && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />{processingRows.length} dikira</span>}
                {pendingRows.length > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-300" />{pendingRows.length} belum</span>}
              </div>
            )}
            {/* Start button */}
            <button
              onClick={() => void handleStart()}
              disabled={!canStart || startLoading || anyProcessing}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold px-3 py-1.5 transition-colors"
            >
              {startLoading || anyProcessing
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Play className="h-3 w-3" />}
              {allDone ? "Selesai" : anyProcessing ? "Sedang diproses…" : "Mula Proses Jarak"}
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Error */}
        {startError && (
          <div className="mx-6 mt-3 flex items-center gap-2 text-red-600 bg-red-50 rounded-lg px-4 py-2.5 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {startError === "NO_VENUE"
              ? "Lokasi acara belum dikonfigurasikan. Sila set alamat acara terlebih dahulu."
              : startError}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {!initialLoad ? (
            <div className="flex items-center justify-center py-12 text-zinc-400 text-sm gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Memuatkan rekod…
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-zinc-900">
                  <th className="text-left py-2 pr-2 font-black uppercase tracking-wide text-[9px] text-zinc-400 w-5" />
                  <th className="text-left py-2 pr-3 font-black uppercase tracking-wide text-[9px] text-zinc-400 w-5">#</th>
                  <th className="text-left py-2 pr-3 font-black uppercase tracking-wide text-[9px] text-zinc-400">Sekolah</th>
                  <th className="text-left py-2 pr-3 font-black uppercase tracking-wide text-[9px] text-zinc-400">Negeri</th>
                  <th className="text-right py-2 pr-3">
                    <SortBtn col="road"  label="Jalan (km)"  sortCol={sortCol} setSortCol={setSortCol} />
                  </th>
                  {doneRows.some((c) => showAirForContingent(c.stateName)) && (
                    <th className="text-right py-2 pr-3">
                      <SortBtn col="air" label="Udara (km)" sortCol={sortCol} setSortCol={setSortCol} />
                    </th>
                  )}
                  {hasWater && (
                    <th className="text-right py-2">
                      <SortBtn col="water" label="Laut (km)" sortCol={sortCol} setSortCol={setSortCol} />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((c, i) => {
                  const rec = recordMap.get(c.contingentId);
                  const isDone       = rec?.status === "DONE";
                  const isProcessing = rec?.status === "PROCESSING";
                  const isError      = rec?.status === "ERROR";
                  const isPending    = !rec;
                  const textCls    = isPending ? "text-zinc-400" : "text-zinc-800";
                  const showAir    = showAirForContingent(c.stateName);
                  return (
                    <tr key={c.contingentId} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}>
                      {/* Status dot */}
                      <td className="py-2 pr-2">
                        {isDone       && <span className="block h-2.5 w-2.5 rounded-full bg-blue-500 mx-auto" />}
                        {isProcessing && <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse mx-auto" />}
                        {isError      && <span className="block h-2.5 w-2.5 rounded-full bg-red-500 mx-auto" />}
                        {isPending    && <span className="block h-2.5 w-2.5 rounded-full bg-zinc-200 mx-auto" />}
                      </td>
                      <td className={`py-2 pr-3 font-mono ${isPending ? "text-zinc-300" : "text-zinc-400"}`}>{i + 1}</td>
                      <td className={`py-2 pr-3 font-medium max-w-[200px] truncate ${textCls}`}>
                        {c.schoolName ?? c.name}
                        {c.districtName && <span className={`font-normal ${isPending ? "text-zinc-300" : "text-zinc-400"}`}> · {c.districtName}</span>}
                      </td>
                      <td className={`py-2 pr-3 ${isPending ? "text-zinc-300" : "text-zinc-500"}`}>{c.stateName ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono font-semibold text-zinc-800">
                        {isDone ? rec!.roadKm?.toLocaleString() : isProcessing ? <span className="text-emerald-500 text-[10px]">…</span> : <span className="text-zinc-300">—</span>}
                      </td>
                      {showAir && (
                        <td className="py-2 pr-3 text-right font-mono text-zinc-500">
                          {isDone ? rec!.airKm?.toLocaleString() : isProcessing ? <span className="text-emerald-500 text-[10px]">…</span> : <span className="text-zinc-300">—</span>}
                        </td>
                      )}
                      {hasWater && (
                        <td className="py-2 text-right font-mono text-blue-500">
                          {isDone
                            ? (rec!.waterKm != null ? rec!.waterKm.toLocaleString() : <span className="text-zinc-300">—</span>)
                            : <span className="text-zinc-300">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {doneRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-zinc-900 font-bold">
                    <td colSpan={4} className="py-2 pr-3 text-[9px] uppercase tracking-wide text-zinc-400">
                      {doneRows.length} selesai · {processingRows.length} dikira · {pendingRows.length} belum
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">{doneKmTotals.road.toLocaleString()}</td>
                    {doneRows.some((c) => showAirForContingent(c.stateName)) && (
                      <td className="py-2 pr-3 text-right font-mono text-xs text-zinc-400">{doneKmTotals.air.toLocaleString()}</td>
                    )}
                    {hasWater && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {/* Legend + disclaimer footer */}
        <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[9px] text-zinc-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Direkod</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Dikira</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-300" /> Belum diproses</span>
          </div>
          <p className="text-[9px] text-zinc-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Anggaran oleh Gemini AI — untuk rujukan sahaja.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AttendanceDashboardClient({ event }: Props) {
  const [data, setData]         = useState<DashboardStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showDistance, setShowDistance] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch(`/api/v2/organizer/events/${event.id}/attendance/dashboard-stats`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuatkan data");
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => {
    void fetchStats(); // eslint-disable-line react-hooks/set-state-in-effect
    intervalRef.current = setInterval(() => void fetchStats(), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStats]);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const overallChartData = data
    ? [
        { name: "Kontingen", Dijangka: data.overall.contingents.total,  Hadir: data.overall.contingents.present },
        { name: "Pengurus",  Dijangka: data.overall.managers.total,     Hadir: data.overall.managers.present },
        { name: "Pasukan",   Dijangka: data.overall.teams.total,        Hadir: data.overall.teams.present },
        { name: "Peserta",   Dijangka: data.overall.participants.total,  Hadir: data.overall.participants.present },
      ]
    : [];

  const tgTeamChartData = data?.byTargetGroup.map((g) => ({
    name:    g.name,
    Dijangka: g.teams.total,
    Hadir:   g.teams.present,
  })) ?? [];

  const tgParticipantChartData = data?.byTargetGroup.map((g) => ({
    name:    g.name,
    Dijangka: g.participants.total,
    Hadir:   g.participants.present,
  })) ?? [];

  // ── Venue display ──────────────────────────────────────────────────────────

  const venueLine = [event.venue, event.city, event.state?.name].filter(Boolean).join(" · ");
  const dateLine  = (() => {
    const s = fmtDate(event.startDate);
    const e = fmtDate(event.endDate);
    if (!s) return null;
    if (!e || s === e) return s;
    return `${s} — ${e}`;
  })();

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Memuatkan dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-8">
        <div className="bg-white border border-red-200 rounded-xl p-6 text-center max-w-sm space-y-3">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="font-semibold text-zinc-800">Gagal memuatkan data</p>
          <p className="text-sm text-zinc-500">{error}</p>
          <button
            onClick={() => { setLoading(true); void fetchStats(); }}
            className="text-sm text-blue-600 hover:underline"
          >
            Cuba lagi
          </button>
        </div>
      </div>
    );
  }

  const { overall, byTargetGroup, contingentLocations } = data;

  return (
    <div className="min-h-screen bg-zinc-100 p-4 md:p-6 lg:p-8 space-y-6">

      {/* ── Masthead ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="bg-zinc-900 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">
                Dashboard Kehadiran
              </p>
              <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-tight">
                {event.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-zinc-400">
                {venueLine && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{venueLine}
                  </span>
                )}
                {dateLine && <span>{dateLine}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[9px] font-black uppercase tracking-widest px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Langsung
              </span>
              <button
                onClick={() => { setLoading(true); void fetchStats(); }}
                className="flex items-center gap-1 text-zinc-500 hover:text-white text-[10px] transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                {lastRefresh ? `Kemaskini: ${lastRefresh.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}` : "Muat semula"}
              </button>
            </div>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-100">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1.5">
            <span className="font-bold uppercase tracking-wide">Kehadiran Keseluruhan</span>
            <span className="font-mono">{pct(overall.teams.present, overall.teams.total)}% pasukan hadir</span>
          </div>
          <div className="w-full bg-zinc-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-emerald-500 transition-all duration-1000"
              style={{ width: `${pct(overall.teams.present, overall.teams.total)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Section 1: Overall stats ───────────────────────────────────────── */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
        <SectionHeader>Kehadiran Keseluruhan</SectionHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Kontingen" icon={Building2} stat={overall.contingents} />
          <StatTile label="Pengurus"  icon={UserCheck}  stat={overall.managers}   />
          <StatTile label="Pasukan"   icon={Users}       stat={overall.teams}      />
          <StatTile label="Peserta"   icon={BookUser}    stat={overall.participants} />
        </div>

        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-3">
            Perbandingan Dijangka vs Hadir
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={overallChartData} barGap={4} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={40} />
              <RechartsTooltip content={<ChartTooltip />} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Dijangka" fill={BAR_TOTAL}   radius={[3, 3, 0, 0]} maxBarSize={48} />
              <Bar dataKey="Hadir"    fill={BAR_PRESENT} radius={[3, 3, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Section 2: By target group ────────────────────────────────────── */}
      {byTargetGroup.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-6">
          <SectionHeader>Kehadiran Mengikut Kumpulan Sasaran</SectionHeader>

          {/* Teams chart */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Pasukan</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tgTeamChartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={40} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Dijangka" fill={BAR_TOTAL}   radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="Hadir"    fill={BAR_PRESENT} radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Participants chart */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Peserta</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tgParticipantChartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={40} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Dijangka" fill={BAR_TOTAL}   radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="Hadir"    fill={BAR_PRESENT} radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Target group table summary */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-zinc-900">
                  <th className="text-left py-2 pr-4 font-black uppercase tracking-wide text-[9px] text-zinc-400">Kumpulan Sasaran</th>
                  <th className="text-right py-2 pr-4 font-black uppercase tracking-wide text-[9px] text-zinc-400">Kontingen</th>
                  <th className="text-right py-2 pr-4 font-black uppercase tracking-wide text-[9px] text-zinc-400">Pengurus</th>
                  <th className="text-right py-2 pr-4 font-black uppercase tracking-wide text-[9px] text-zinc-400">Pasukan</th>
                  <th className="text-right py-2 font-black uppercase tracking-wide text-[9px] text-zinc-400">Peserta</th>
                </tr>
              </thead>
              <tbody>
                {byTargetGroup.map((g, i) => (
                  <tr key={g.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}>
                    <td className="py-2 pr-4 font-semibold text-zinc-800">{g.name}</td>
                    {(["contingents", "managers", "teams", "participants"] as const).map((k) => (
                      <td key={k} className="py-2 pr-4 text-right last:pr-0">
                        <span className="font-mono font-semibold text-emerald-600">{g[k].present}</span>
                        <span className="font-mono text-zinc-300"> / </span>
                        <span className="font-mono text-zinc-500">{g[k].total}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-900 font-black">
                  <td className="py-2 pr-4 text-[9px] uppercase tracking-wide text-zinc-400">Jumlah</td>
                  {(["contingents", "managers", "teams", "participants"] as const).map((k) => (
                    <td key={k} className="py-2 pr-4 text-right last:pr-0">
                      <span className="font-mono text-emerald-600">{overall[k].present}</span>
                      <span className="font-mono text-zinc-300"> / </span>
                      <span className="font-mono text-zinc-500">{overall[k].total}</span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 3: Map ────────────────────────────────────────────────── */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader>Peta Kontingen</SectionHeader>
          <button
            onClick={() => setShowDistance(true)}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold px-3 py-1.5 transition-colors"
          >
            <Ruler className="h-3.5 w-3.5" />
            Jadual Jarak
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] font-medium text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />Semua Hadir
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-amber-400" />Sebahagian Hadir
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500" />Belum Hadir
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />Lokasi Acara
          </span>
        </div>

        <div className="rounded-lg overflow-hidden border border-zinc-100">
          <AttendanceDashboardMap
            contingentLocations={contingentLocations}
            eventLat={data.event.latitude}
            eventLng={data.event.longitude}
            eventVenue={data.event.venue}
          />
        </div>

        {/* State breakdown mini-table */}
        {contingentLocations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="text-left py-1.5 pr-4 font-black uppercase tracking-wide text-[9px] text-zinc-400">Negeri</th>
                  <th className="text-right py-1.5 pr-4 font-black uppercase tracking-wide text-[9px] text-zinc-400">Hadir</th>
                  <th className="text-right py-1.5 font-black uppercase tracking-wide text-[9px] text-zinc-400">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const stateMap = new Map<string, { present: number; total: number }>();
                  for (const c of contingentLocations) {
                    const s = c.stateName ?? "Lain-lain";
                    if (!stateMap.has(s)) stateMap.set(s, { present: 0, total: 0 });
                    const g = stateMap.get(s)!;
                    g.total++;
                    if (c.present) g.present++;
                  }
                  return [...stateMap.entries()]
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([state, g], i) => (
                      <tr key={state} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}>
                        <td className="py-1.5 pr-4 text-zinc-700">{state}</td>
                        <td className="py-1.5 pr-4 text-right font-mono font-semibold text-emerald-600">{g.present}</td>
                        <td className="py-1.5 text-right font-mono text-zinc-500">{g.total}</td>
                      </tr>
                    ));
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Distance modal ────────────────────────────────────────────────── */}
      {showDistance && (
        <DistanceModal
          eventId={event.id}
          contingentLocations={contingentLocations}
          eventVenue={data.event.venue}
          eventStateName={data.event.stateName}
          onClose={() => setShowDistance(false)}
        />
      )}
    </div>
  );
}
