"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Search, ChevronLeft, ChevronRight, Users } from "lucide-react";

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

const PAGE_SIZE = 50;

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

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Load competitions for this event (returns EventCompetition[] with nested competition)
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

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, competitionId, stateId]);

  useEffect(() => { load(); }, [load]);

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
