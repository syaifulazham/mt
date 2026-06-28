"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Search, ChevronLeft, ChevronRight, Users, BarChart2, ChevronDown, ChevronUp } from "lucide-react";

type Participant = {
  id: string;
  name: string;
  classGrade: string | null;
  eduLevel: string;
  competitionCode: string;
  competitionName: string;
  teamName: string;
  stateName: string | null;
};

type Competition = {
  id: string;
  code: string;
  name: string;
};

type EventSummary = {
  id: string;
  name: string;
  slug: string;
};

type StatsSummary = {
  schoolContingents: number;
  primarySchools:    number;
  secondarySchools:  number;
  teams:             number;
  participants:      number;
  male:              number;
  female:            number;
};

type GradeStat = { eduLevel: string; classGrade: string; count: number };

type StateStat = {
  stateName:         string;
  schoolContingents: number;
  primarySchools:    number;
  secondarySchools:  number;
  teams:             number;
  participants:      number;
  male:              number;
  female:            number;
};

const PAGE_SIZE = 50;

// ── Stats panel ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3">
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function GenderBar({ male, female }: { male: number; female: number }) {
  const total = male + female;
  if (total === 0) return null;
  const mp = Math.round((male / total) * 100);
  const fp = 100 - mp;
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3">
      <p className="text-xs text-zinc-400 mb-2">Jantina</p>
      <div className="flex rounded-full overflow-hidden h-4 text-xs font-semibold">
        <div className="bg-blue-400 flex items-center justify-center text-white" style={{ width: `${mp}%` }}>
          {mp > 8 ? `L ${mp}%` : ""}
        </div>
        <div className="bg-pink-400 flex items-center justify-center text-white" style={{ width: `${fp}%` }}>
          {fp > 8 ? `P ${fp}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-xs text-zinc-500 mt-1.5">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-400" /> Lelaki {male.toLocaleString()}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-pink-400" /> Perempuan {female.toLocaleString()}</span>
      </div>
    </div>
  );
}

function GradeSection({ title, color, items }: { title: string; color: string; items: GradeStat[] }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${color}`}>{title}</p>
      <div className="space-y-0.5">
        {items.map((g) => (
          <div key={g.classGrade} className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-28 shrink-0">{g.classGrade}</span>
            <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${Math.round((g.count / max) * 100)}%` }} />
            </div>
            <span className="text-xs tabular-nums text-zinc-600 w-8 text-right">{g.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GradeTable({ rows }: { rows: GradeStat[] }) {
  const primary   = rows.filter((r) => r.eduLevel === "PRIMARY");
  const secondary = rows.filter((r) => r.eduLevel === "SECONDARY");
  const youth     = rows.filter((r) => r.eduLevel === "YOUTH");
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 space-y-4">
      <p className="text-xs text-zinc-400">Peserta mengikut Gred</p>
      <GradeSection title="Sekolah Rendah (Darjah)" color="text-emerald-600" items={primary} />
      <GradeSection title="Sekolah Menengah (Tingkatan)" color="text-violet-600" items={secondary} />
      <GradeSection title="Belia / Lain" color="text-orange-600" items={youth} />
    </div>
  );
}

function StateTable({ rows }: { rows: StateStat[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-100">
        <p className="text-xs text-zinc-400">Pecahan mengikut Negeri</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-3 py-2 font-semibold text-zinc-500">Negeri</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Konting.</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Rendah</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Menengah</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Pasukan</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Peserta</th>
              <th className="text-right px-3 py-2 font-semibold text-blue-500">L</th>
              <th className="text-right px-3 py-2 font-semibold text-pink-500">P</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.stateName} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                <td className="px-3 py-2 font-medium text-zinc-700">{r.stateName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{r.schoolContingents}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.primarySchools}</td>
                <td className="px-3 py-2 text-right tabular-nums text-violet-700">{r.secondarySchools}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{r.teams}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-800">{r.participants}</td>
                <td className="px-3 py-2 text-right tabular-nums text-blue-600">{r.male}</td>
                <td className="px-3 py-2 text-right tabular-nums text-pink-600">{r.female}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold">
              <td className="px-3 py-2 text-zinc-600">Jumlah</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{rows.reduce((s, r) => s + r.schoolContingents, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{rows.reduce((s, r) => s + r.primarySchools, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-violet-700">{rows.reduce((s, r) => s + r.secondarySchools, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{rows.reduce((s, r) => s + r.teams, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900">{rows.reduce((s, r) => s + r.participants, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-blue-700">{rows.reduce((s, r) => s + r.male, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-pink-700">{rows.reduce((s, r) => s + r.female, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EventPreregistrationClient({ event }: { event: EventSummary }) {
  const [rows, setRows]               = useState<Participant[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const [q, setQ]                         = useState("");
  const [debouncedQ, setDebouncedQ]       = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [stateId, setStateId]             = useState("");

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [states, setStates]             = useState<{ id: string; name: string }[]>([]);

  // Stats panel
  const [statsOpen, setStatsOpen]         = useState(true);
  const [stats, setStats]                 = useState<{
    summary: StatsSummary;
    byGrade: GradeStat[];
    byState: StateStat[];
  } | null>(null);
  const [statsLoading, setStatsLoading]   = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Load competitions for this event
  useEffect(() => {
    fetch(`/api/v2/organizer/events/${event.id}/competitions`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.data ?? []) as { competition: { id: string; code: string; name: string } }[];
        setCompetitions(list.map((ec) => ec.competition));
      })
      .catch(() => {});
  }, [event.id]);

  // Load states
  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/states?pageSize=100")
      .then((r) => r.json())
      .then((d) => setStates(d.data ?? []))
      .catch(() => {});
  }, []);

  // Load stats once
  useEffect(() => {
    setStatsLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [event.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedQ)    sp.set("q", debouncedQ);
      if (competitionId) sp.set("competitionId", competitionId);
      if (stateId)       sp.set("stateId", stateId);

      const res  = await fetch(`/api/v2/organizer/events/${event.id}/preregistration?${sp}`);
      const text = await res.text();
      const json = JSON.parse(text);
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ralat tidak diketahui");
    } finally {
      setLoading(false);
    }
  }, [event.id, page, debouncedQ, competitionId, stateId]);

  useEffect(() => { setPage(1); }, [debouncedQ, competitionId, stateId]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href={`/organizer/events/${event.slug}/manage`}
          className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Pra-Pendaftaran
          </h1>
          <p className="text-sm text-zinc-400">{event.name}</p>
        </div>
      </div>

      {/* Stats panel */}
      <div className="rounded-xl border border-zinc-200 overflow-hidden">
        <button
          onClick={() => setStatsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 hover:bg-zinc-100 transition-colors text-sm font-semibold text-zinc-700"
        >
          <span className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-500" />
            Statistik Penyertaan
          </span>
          {statsOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </button>

        {statsOpen && (
          <div className="p-4 space-y-4 bg-zinc-50/30">
            {statsLoading || !stats ? (
              <p className="text-sm text-zinc-400 text-center py-4">Memuatkan statistik…</p>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <StatCard label="Kontingen Sekolah"   value={stats.summary.schoolContingents} />
                  <StatCard label="Sekolah Rendah"      value={stats.summary.primarySchools} />
                  <StatCard label="Sekolah Menengah"    value={stats.summary.secondarySchools} />
                  <StatCard label="Pasukan"             value={stats.summary.teams} />
                  <StatCard label="Peserta"             value={stats.summary.participants} />
                  <StatCard label="Lelaki"              value={stats.summary.male} />
                  <StatCard label="Perempuan"           value={stats.summary.female} />
                </div>

                {/* Gender bar + Grade distribution */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GenderBar male={stats.summary.male} female={stats.summary.female} />
                  <GradeTable rows={stats.byGrade} />
                </div>

                {/* State breakdown */}
                <StateTable rows={stats.byState} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama peserta atau pasukan…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {competitions.length > 0 && (
          <select
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Semua Pertandingan</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        )}

        {states.length > 0 && (
          <select
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Semua Negeri</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <span className="text-xs text-zinc-400 ml-auto whitespace-nowrap">
          {loading ? "Memuatkan…" : `${total} peserta`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Nama</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Gred</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pertandingan</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pasukan</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Negeri</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-zinc-400 text-sm">Memuatkan…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-zinc-300 text-sm">Tiada data</td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                  <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{row.name}</td>
                  <td className="px-4 py-2.5 text-zinc-600 text-xs">{row.classGrade ?? "–"}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {row.competitionCode}
                      </span>
                      <span className="text-zinc-600 text-xs">{row.competitionName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600 text-xs">{row.teamName}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{row.stateName ?? "–"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400 text-xs">
            Halaman {page} / {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelum
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Seterusnya <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
