"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3, FileSpreadsheet, FileText, Loader2, RefreshCw,
  Trophy, Building2, AlertCircle,
} from "lucide-react";
import { exportXlsx, exportDocx } from "@/lib/export/eventReportExport";
import type { StatsPayload } from "@/lib/export/eventReportExport";
import type { CompetitionEntry } from "@/app/(organizer)/organizer/events/[slug]/manage/reports/page";

const LEVEL_ORDER = ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH"] as const;
const LEVEL_LABEL: Record<string, string> = {
  KINDERGARTEN: "Tadika",
  PRIMARY:      "Sekolah Rendah",
  SECONDARY:    "Sekolah Menengah",
  YOUTH:        "Belia",
};
const LEVEL_COLOR: Record<string, string> = {
  KINDERGARTEN: "bg-yellow-50 text-yellow-700 border-yellow-100",
  PRIMARY:      "bg-sky-50 text-sky-700 border-sky-100",
  SECONDARY:    "bg-violet-50 text-violet-700 border-violet-100",
  YOUTH:        "bg-emerald-50 text-emerald-700 border-emerald-100",
};

type Props = { eventId: string; eventName: string; slug: string; competitions: CompetitionEntry[] };

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border bg-white p-5 flex flex-col gap-1 ${color}`}>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="text-3xl font-bold text-zinc-900">{value.toLocaleString("ms-MY")}</p>
      {sub && <p className="text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

export function EventReportsClient({ eventId, eventName, slug, competitions }: Props) {
  const [stats,         setStats]         = useState<StatsPayload | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/preregistration/stats`);
      if (!res.ok) throw new Error("Gagal memuat data statistik");
      setStats(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat tidak diketahui");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleXlsx() {
    if (!stats) return;
    setExportingXlsx(true);
    try { exportXlsx(eventName, slug, stats); }
    finally { setExportingXlsx(false); }
  }

  async function handleDocx() {
    if (!stats) return;
    setExportingDocx(true);
    try { await exportDocx(eventName, slug, stats); }
    finally { setExportingDocx(false); }
  }

  const malePct  = stats ? (stats.summary.participants ? (stats.summary.male   / stats.summary.participants * 100).toFixed(1) : "0.0") : "–";
  const femPct   = stats ? (stats.summary.participants ? (stats.summary.female / stats.summary.participants * 100).toFixed(1) : "0.0") : "–";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-5 w-5 text-violet-600" />
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Laporan Statistik Penyertaan</h2>
            <p className="text-xs text-zinc-400">{eventName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Muat Semula
          </button>
          {stats && (
            <>
              <button
                onClick={handleXlsx}
                disabled={exportingXlsx}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition-colors"
              >
                {exportingXlsx
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FileSpreadsheet className="h-3.5 w-3.5" />}
                XLSX
              </button>
              <button
                onClick={handleDocx}
                disabled={exportingDocx}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition-colors"
              >
                {exportingDocx
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FileText className="h-3.5 w-3.5" />}
                DOCX
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm">
          <Loader2 className="h-5 w-5 animate-spin" /> Memuatkan data…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Stats */}
      {!loading && stats && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Kontingen Sekolah"  value={stats.summary.schoolContingents} color="border-blue-100"   />
            <StatCard label="Jumlah Pasukan"      value={stats.summary.teams}             color="border-amber-100"  />
            <StatCard label="Jumlah Peserta"      value={stats.summary.participants}
              sub={`${malePct}% lelaki · ${femPct}% perempuan`}                                                       color="border-violet-100" />
            <div className="rounded-xl border border-zinc-100 bg-white p-5 flex flex-col gap-2">
              <p className="text-xs font-medium text-zinc-500">Jantina</p>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-sky-700 font-medium">Lelaki</span>
                    <span className="text-zinc-500">{stats.summary.male.toLocaleString("ms-MY")}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div className="h-full bg-sky-400 rounded-full" style={{ width: `${malePct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-pink-700 font-medium">Perempuan</span>
                    <span className="text-zinc-500">{stats.summary.female.toLocaleString("ms-MY")}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div className="h-full bg-pink-400 rounded-full" style={{ width: `${femPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* By-state table */}
          {stats.byState.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-100">
                <Building2 className="h-4 w-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-800">Mengikut Negeri</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b border-zinc-100">
                    <tr>
                      {["Negeri", "Kontingen", "Sekolah Rendah", "Sekolah Menengah", "Pasukan", "Peserta", "Lelaki", "Perempuan"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {stats.byState.map((r, i) => (
                      <tr key={i} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-2.5 font-medium text-zinc-800">{r.stateName}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-600">{r.schoolContingents.toLocaleString("ms-MY")}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-600">{r.primarySchools.toLocaleString("ms-MY")}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-600">{r.secondarySchools.toLocaleString("ms-MY")}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-600">{r.teams.toLocaleString("ms-MY")}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-zinc-800">{r.participants.toLocaleString("ms-MY")}</td>
                        <td className="px-4 py-2.5 text-xs text-sky-700">{r.male.toLocaleString("ms-MY")}</td>
                        <td className="px-4 py-2.5 text-xs text-pink-700">{r.female.toLocaleString("ms-MY")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                    <tr>
                      {(() => {
                        const t = stats.byState.reduce((a, r) => ({
                          schoolContingents: a.schoolContingents + r.schoolContingents,
                          primarySchools:    a.primarySchools    + r.primarySchools,
                          secondarySchools:  a.secondarySchools  + r.secondarySchools,
                          teams:             a.teams             + r.teams,
                          participants:      a.participants      + r.participants,
                          male:              a.male              + r.male,
                          female:            a.female            + r.female,
                        }), { schoolContingents: 0, primarySchools: 0, secondarySchools: 0, teams: 0, participants: 0, male: 0, female: 0 });
                        return (
                          <>
                            <td className="px-4 py-2.5 text-xs font-bold text-zinc-800">JUMLAH</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-zinc-800">{t.schoolContingents.toLocaleString("ms-MY")}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-zinc-800">{t.primarySchools.toLocaleString("ms-MY")}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-zinc-800">{t.secondarySchools.toLocaleString("ms-MY")}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-zinc-800">{t.teams.toLocaleString("ms-MY")}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-violet-700">{t.participants.toLocaleString("ms-MY")}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-sky-700">{t.male.toLocaleString("ms-MY")}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-pink-700">{t.female.toLocaleString("ms-MY")}</td>
                          </>
                        );
                      })()}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* Competitions by education level */}
          {competitions.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-100">
                <Trophy className="h-4 w-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-800">Pertandingan Mengikut Tahap Pendidikan</h3>
                <span className="ml-auto text-xs text-zinc-400">{competitions.length} pertandingan</span>
              </div>
              <div className="divide-y divide-zinc-100">
                {LEVEL_ORDER.map(level => {
                  const group = competitions
                    .filter(c => c.schoolLevels.includes(level))
                    .sort((a, b) => a.code.localeCompare(b.code));
                  if (!group.length) return null;
                  return (
                    <div key={level}>
                      <div className={`px-5 py-2 border-b border-zinc-100`}>
                        <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${LEVEL_COLOR[level]}`}>
                          {LEVEL_LABEL[level]}
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-zinc-50">
                          {group.map(c => (
                            <tr key={c.id} className="hover:bg-zinc-50/40">
                              <td className="px-5 py-2.5 w-28">
                                <span className="font-mono text-xs bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">{c.code}</span>
                              </td>
                              <td className="px-2 py-2.5 font-medium text-zinc-800 text-sm">{c.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {stats.byState.length === 0 && stats.summary.participants === 0 && (
            <div className="flex items-center justify-center gap-2 py-12 text-zinc-400 text-sm">
              <Trophy className="h-5 w-5" /> Tiada data penyertaan lagi.
            </div>
          )}
        </>
      )}
    </div>
  );
}
