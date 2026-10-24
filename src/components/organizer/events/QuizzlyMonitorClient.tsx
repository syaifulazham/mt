"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, RefreshCw, Search, X, AlertTriangle, ListChecks, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizzlyMonitorCompetition, QuizzlyMonitorRow } from "@/lib/quizzlyMonitor";
import { rankQuizRows, exportQuizzlyResultsExcel } from "@/lib/export/quizzlyResultsExport";

// Pantauan Pertandingan Dalam Talian → Asia Spark Quizzes: per Quizzly-linked
// competition of the event, its registered participants by quiz (toggle by
// quiz; each quiz's results are loaded when it is opened), with progress and
// score from Asia Spark Quizzly. Ranks are MT-side, within one quiz, by state
// (default) or nationally.

type EventInfo = { id: string; name: string; slug: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  submitted:   { label: "Selesai",        cls: "bg-emerald-50 text-emerald-700" },
  in_progress: { label: "Sedang menjawab", cls: "bg-sky-50 text-sky-700" },
  logged_in:   { label: "Log masuk",      cls: "bg-indigo-50 text-indigo-700" },
  not_started: { label: "Belum mula",     cls: "bg-zinc-100 text-zinc-500" },
  voided:      { label: "Dibatalkan",     cls: "bg-rose-50 text-rose-600" },
  no_code:     { label: "Tiada kod",      cls: "bg-amber-50 text-amber-700" },
};
const STATUS_ORDER = ["submitted", "in_progress", "logged_in", "not_started", "voided", "no_code"];
const RANK_CLS = ["bg-amber-400 text-white", "bg-zinc-400 text-white", "bg-orange-400 text-white"];

function fmtWhen(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
function fmtDuration(ms: number | null) {
  if (ms == null) return null;
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}j ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

function QuizTable({ rows: all }: { rows: QuizzlyMonitorRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [state, setState]   = useState("");
  const [scope, setScope]   = useState<"national" | "state">("state");

  const stateKey = (r: QuizzlyMonitorRow) => r.stateName ?? "—";
  const stateCounts = new Map<string, number>();
  for (const r of all) stateCounts.set(stateKey(r), (stateCounts.get(stateKey(r)) ?? 0) + 1);
  const states = [...stateCounts.keys()].sort((a, b) => a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b));
  const inState = all.filter(r => !state || stateKey(r) === state);
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, inState.filter(r => r.status === s).length]));

  // Computed over every participant of the scope, before search / status / state filters.
  const ranks = new Map<string, number>();
  if (scope === "national") rankQuizRows(all).forEach((v, k) => ranks.set(k, v));
  else for (const s of states) rankQuizRows(all.filter(r => stateKey(r) === s)).forEach((v, k) => ranks.set(k, v));

  const ql = q.trim().toLowerCase();
  const rows = inState
    .filter(r => !status || r.status === status)
    .filter(r => !ql || [r.name, r.contingentName, r.stateName ?? "", r.classGrade ?? ""].some(v => v.toLowerCase().includes(ql)))
    .sort((a, b) =>
      (ranks.get(a.participantId) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.participantId) ?? Number.MAX_SAFE_INTEGER)
      || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      || a.name.localeCompare(b.name));
  const groups = scope === "national"
    ? [{ key: "", rows }]
    : states.map(s => ({ key: s, rows: rows.filter(r => stateKey(r) === s) })).filter(g => g.rows.length > 0);

  return (
    <>
      <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border p-0.5 bg-zinc-50" role="group" aria-label="Kedudukan">
          {([["state", "Ikut Negeri"], ["national", "Kebangsaan"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setScope(v)}
              className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors",
                scope === v ? "bg-white text-orange-700 shadow-sm" : "text-zinc-500 hover:text-zinc-700")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari peserta, kontingen, negeri, darjah…"
            className="w-full pl-8 pr-7 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200" />
          {q && <button onClick={() => setQ("")} className="absolute right-2 top-1.5 text-zinc-400 hover:text-zinc-600"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <select value={state} onChange={e => setState(e.target.value)}
          className={cn("py-1.5 pl-2 pr-7 text-xs border rounded-lg bg-white", state && "border-orange-300 text-orange-700")}>
          <option value="">Semua negeri · {all.length}</option>
          {states.map(s => <option key={s} value={s}>{s === "—" ? "Tiada negeri" : s} · {stateCounts.get(s)}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setStatus(null)}
            className={cn("text-[11px] px-2 py-0.5 rounded-full border", !status ? "bg-zinc-800 text-white border-zinc-800" : "text-zinc-500 hover:bg-zinc-50")}>
            Semua · {inState.length}
          </button>
          {STATUS_ORDER.filter(s => counts[s] > 0 || s === "submitted").map(s => (
            <button key={s} onClick={() => setStatus(status === s ? null : s)}
              className={cn("text-[11px] px-2 py-0.5 rounded-full border",
                status === s ? "bg-zinc-800 text-white border-zinc-800" : cn(STATUS[s].cls, "border-transparent hover:opacity-80"))}>
              {STATUS[s].label} · {counts[s]}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-400">
          {all.length === 0 ? "Tiada peserta berdaftar untuk kuiz ini." : "Tiada peserta sepadan."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50/60 text-[11px] font-medium text-zinc-500">
                <th className="px-3 py-2 text-left w-14">{scope === "national" ? "Kedudukan" : "Kdd. Negeri"}</th>
                <th className="px-3 py-2 text-left">Peserta</th>
                <th className="px-3 py-2 text-left">Kontingen</th>
                <th className="px-3 py-2 text-left w-28">Negeri</th>
                <th className="px-3 py-2 text-left w-28">Status</th>
                <th className="px-3 py-2 text-right w-20">Dijawab</th>
                <th className="px-3 py-2 text-right w-28">Markah</th>
                <th className="px-3 py-2 text-right w-20">Tempoh</th>
                <th className="px-3 py-2 text-left w-36">Dihantar</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g.key || "__all"}>
                  {scope === "state" && (
                    <tr className="bg-zinc-100 border-b">
                      <td colSpan={9} className="px-3 py-1.5 text-[11px] font-bold text-zinc-600 uppercase tracking-wide">
                        {g.key === "—" ? "Tiada negeri" : g.key}
                        <span className="ml-2 font-normal normal-case text-zinc-400">
                          {stateCounts.get(g.key)} peserta · {all.filter(r => stateKey(r) === g.key && r.status === "submitted").length} selesai
                        </span>
                      </td>
                    </tr>
                  )}
                  {g.rows.map(r => {
                    const rank = ranks.get(r.participantId);
                    const st = STATUS[r.status];
                    return (
                      <tr key={r.participantId} className="border-b last:border-0 hover:bg-zinc-50/60">
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {rank == null ? <span className="text-zinc-300">—</span> : (
                            <span className={cn("inline-flex min-w-6 h-6 px-1.5 items-center justify-center rounded-full font-bold",
                              RANK_CLS[rank - 1] ?? "bg-zinc-100 text-zinc-600")}>{rank}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-zinc-800">{r.name}</span>
                          {r.classGrade && <span className="ml-1.5 text-[10px] text-zinc-400">{r.classGrade}</span>}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">{r.contingentName}</td>
                        <td className="px-3 py-2 text-xs text-zinc-600">{r.stateName ?? "—"}</td>
                        <td className="px-3 py-2"><span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", st.cls)}>{st.label}</span></td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500">
                          {r.totalQuestions ? `${r.answered}/${r.totalQuestions}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                          {r.score ? <>{r.score.raw}<span className="text-zinc-400">/{r.score.max}</span>
                            <span className="ml-1.5 text-[11px] text-zinc-500">{r.score.percentage.toFixed(1)}%</span></> : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-[11px] tabular-nums text-zinc-500">{fmtDuration(r.durationMs) ?? "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-zinc-500">{fmtWhen(r.submittedAt)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function fetchQuizRows(eventId: string, ecId: string, quizId: string): Promise<QuizzlyMonitorRow[]> {
  const r = await fetch(`/api/v2/organizer/events/${eventId}/asia-spark-quizzes?ecId=${encodeURIComponent(ecId)}&quizId=${encodeURIComponent(quizId)}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Gagal memuatkan keputusan kuiz.");
  return j.rows;
}

function QuizPanel({ eventId, ecId, quizId }: { eventId: string; ecId: string; quizId: string }) {
  const [rows, setRows]     = useState<QuizzlyMonitorRow[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce]   = useState(0);

  useEffect(() => {
    let alive = true;
    fetchQuizRows(eventId, ecId, quizId)
      .then(rows => { if (alive) { setRows(rows); setFetchedAt(new Date().toISOString()); setError(""); } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Gagal"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventId, ecId, quizId, nonce]);

  return (
    <>
      <div className="px-5 py-2 border-b flex items-center gap-2 text-[11px] text-zinc-400">
        {fetchedAt && <span>Keputusan dikemas kini {fmtWhen(fetchedAt)}</span>}
        <button onClick={() => { setLoading(true); setNonce(n => n + 1); }} disabled={loading}
          className="ml-auto inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-800 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Muat semula kuiz
        </button>
      </div>
      {error && <p className="px-5 py-3 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</p>}
      {!rows && loading && (
        <div className="py-12 flex flex-col items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Memuatkan keputusan kuiz daripada Asia Spark Quizzly…
        </div>
      )}
      {rows && <QuizTable rows={rows} />}
    </>
  );
}

function CompetitionPanel({ comp, eventId }: { comp: QuizzlyMonitorCompetition; eventId: string }) {
  const [quizId, setQuizId] = useState<string | null>(comp.quizzes.find(q => q.registered > 0)?.id ?? comp.quizzes[0]?.id ?? null);
  const active = comp.quizzes.find(q => q.id === quizId) ?? comp.quizzes[0];

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b bg-zinc-50 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-zinc-400">{comp.code}</span>
          <h2 className="text-sm font-semibold text-zinc-800">{comp.name}</h2>
          {comp.sessionTitle && (
            <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-orange-50 text-orange-700">Sesi: {comp.sessionTitle}</span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500">
          {comp.registered} peserta berdaftar · {comp.quizzes.length} kuiz
          {comp.unassigned > 0 && <span className="text-amber-700"> · {comp.unassigned} tiada kuiz sepadan (darjah / kumpulan sasaran)</span>}
        </p>
      </div>

      {comp.quizzes.length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-400">Tiada kuiz dikonfigurasi untuk pertandingan ini.</p>
      ) : (
        <>
          <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
            <ListChecks className="h-4 w-4 text-zinc-400" />
            {comp.quizzes.map(qz => (
              <button key={qz.id} onClick={() => setQuizId(qz.id)} title={qz.label}
                className={cn("text-xs px-3 py-1 rounded-full font-medium transition-colors inline-flex items-center gap-1.5",
                  active?.id === qz.id ? "bg-orange-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")}>
                {qz.title}
                <span className={cn("text-[10px] px-1.5 rounded-full", active?.id === qz.id ? "bg-white/20" : "bg-white text-zinc-500")}>{qz.registered}</span>
              </button>
            ))}
          </div>
          {active && <QuizPanel key={active.id} eventId={eventId} ecId={comp.ecId} quizId={active.id} />}
        </>
      )}
    </div>
  );
}

export function QuizzlyMonitorClient({ event }: { event: EventInfo }) {
  const [data, setData]       = useState<{ competitions: QuizzlyMonitorCompetition[] } | null>(null);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);
  const [activeEc, setActiveEc] = useState<string | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  async function exportXlsx() {
    if (!data) return;
    setError("");
    setExporting({ done: 0, total: 0 });
    try {
      await exportQuizzlyResultsExcel({
        eventName: event.name,
        competitions: data.competitions,
        load: (ecId, quizId) => fetchQuizRows(event.id, ecId, quizId),
        onProgress: (done, total) => setExporting({ done, total }),
      });
    } catch (e) { setError(`Muat turun gagal: ${e instanceof Error ? e.message : "ralat"}`); }
    finally { setExporting(null); }
  }

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/v2/organizer/events/${event.id}/asia-spark-quizzes`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Gagal memuatkan data Asia Spark Quizzly.");
    return j;
  }, [event.id]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await fetchData()); }
    catch (e) { setError(e instanceof Error ? e.message : "Gagal"); }
    finally { setLoading(false); }
  }, [fetchData]);

  useEffect(() => {
    let alive = true;
    fetchData()
      .then(j => { if (alive) setData(j); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Gagal"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchData]);

  const comps = data?.competitions ?? [];
  const active = comps.find(c => c.ecId === activeEc) ?? comps[0];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/organizer/events/${event.slug}/manage`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-600" />
            <h1 className="text-xl font-bold text-zinc-900">Asia Spark Quizzes</h1>
          </div>
          <p className="text-sm text-zinc-500">{event.name} · Pantauan Pertandingan Dalam Talian</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <Button size="sm" onClick={exportXlsx} disabled={!data || comps.length === 0 || !!exporting}
            className="h-7 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white"
            title="Satu helaian bagi setiap pertandingan, disenaraikan mengikut kuiz">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? (exporting.total ? `Memuatkan kuiz ${exporting.done}/${exporting.total}…` : "Menyediakan…") : "Muat turun XLSX"}
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-7 text-xs gap-1">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Muat semula
          </Button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {!data && loading && (
        <div className="rounded-xl border bg-white py-16 flex flex-col items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" /> Memuatkan pertandingan…
        </div>
      )}

      {data && comps.length === 0 && (
        <p className="rounded-xl border bg-white px-5 py-10 text-center text-sm text-zinc-400">Tiada pertandingan acara ini disepadukan dengan Asia Spark Quizzly.</p>
      )}

      {comps.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {comps.map(c => (
            <button key={c.ecId} onClick={() => setActiveEc(c.ecId)}
              className={cn("text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors",
                active?.ecId === c.ecId ? "bg-orange-600 text-white border-orange-600" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
              <span className="font-mono mr-1 opacity-70">{c.code}</span>{c.name}
              <span className="ml-1.5 opacity-70">({c.registered})</span>
            </button>
          ))}
        </div>
      )}

      {active && <CompetitionPanel key={active.ecId} comp={active} eventId={event.id} />}
    </div>
  );
}
