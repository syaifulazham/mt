"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Fingerprint, Loader2, RefreshCw, Search, X, AlertTriangle, FolderSearch, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CsiMonitorCompetition, CsiMonitorTeam } from "@/lib/csiMonitor";

// Pantauan Pertandingan Dalam Talian → Eptim CSI: per CSI-linked competition of
// the event, the teams registered on each case (toggle by case), with their
// progress from Eptim CSI.

type EventInfo = { id: string; name: string; slug: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  none:      { label: "Belum main",  cls: "bg-zinc-100 text-zinc-500" },
  active:    { label: "Sedang main", cls: "bg-sky-50 text-sky-700" },
  completed: { label: "Selesai",     cls: "bg-emerald-50 text-emerald-700" },
  abandoned: { label: "Ditinggalkan", cls: "bg-rose-50 text-rose-600" },
};
const STATUS_ORDER = ["completed", "active", "abandoned", "none"];

function fmtWhen(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

/**
 * MT-side ranking of one case: only completed runs are ranked — higher score
 * first, then the shorter run; teams equal on both share a rank (1, 1, 3).
 * Teams still playing, abandoned or not started have no rank.
 */
function rankTeams(list: CsiMonitorTeam[], caseId: string): Map<string, number> {
  const durationOf = (t: CsiMonitorTeam) => {
    const p = t.progress[caseId];
    return p?.completedAt ? new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime() : Number.MAX_SAFE_INTEGER;
  };
  const done = list
    .filter(t => t.progress[caseId]?.status === "completed" && t.progress[caseId]?.score != null)
    .sort((a, b) => (b.progress[caseId]!.score! - a.progress[caseId]!.score!) || (durationOf(a) - durationOf(b)));
  const ranks = new Map<string, number>();
  done.forEach((t, i) => {
    const prev = done[i - 1];
    const tied = prev && prev.progress[caseId]!.score === t.progress[caseId]!.score && durationOf(prev) === durationOf(t);
    ranks.set(t.teamId, tied ? ranks.get(prev.teamId)! : i + 1);
  });
  return ranks;
}

function fmtDuration(p: { startedAt: string; completedAt: string | null } | undefined) {
  if (!p?.completedAt) return null;
  const s = Math.round((new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime()) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}j ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

const RANK_CLS = ["bg-amber-400 text-white", "bg-zinc-400 text-white", "bg-orange-400 text-white"];

/** Reset context: lets an admin give a team a fresh start on this case. */
type ResetCtx = { eventId: string; ecId: string; caseTitle: string; onDone: () => void } | null;

function ResetDialog({ team, caseId, ctx, onClose }: {
  team: CsiMonitorTeam; caseId: string; ctx: NonNullable<ResetCtx>; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const p = team.progress[caseId];

  async function confirm() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${ctx.eventId}/eptim-csi/reset`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ecId: ctx.ecId, teamId: team.teamId, caseId, reason }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Gagal menetapkan semula.");
      onClose(); ctx.onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2 text-rose-700">
            <RotateCcw className="h-4 w-4" /> Set semula percubaan?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-4 py-2 text-sm text-zinc-600">
          <p><b className="text-zinc-800">{team.teamName}</b> · {team.contingentName}</p>
          <p>Kes: <b>{ctx.caseTitle}</b></p>
          {p && (
            <p className="text-xs">
              Percubaan semasa: <b>{STATUS[p.status]?.label ?? p.status}</b>
              {p.score != null && <> · markah {p.score}{p.maxScore != null && `/${p.maxScore}`}</>}
              {p.runs > 1 && <> · {p.runs} percubaan</>}
            </p>
          )}
          <p className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-800">
            Semua percubaan pasukan ini bagi kes ini akan <b>dibatalkan</b> di Eptim CSI — markah tidak lagi dikira dan pasukan
            boleh bermula semula dari awal. Rekod lama disimpan untuk audit. Pendaftaran kes kekal.
          </p>
          <div>
            <label className="text-xs font-medium text-zinc-700">Sebab (pilihan)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
              placeholder="cth. Gangguan internet semasa bermain"
              className="mt-1 w-full px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Batal</Button>
          <Button onClick={confirm} disabled={busy} className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Set semula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CaseTable({ teams, caseId, reset }: { teams: CsiMonitorTeam[]; caseId: string; reset: ResetCtx }) {
  const [resetFor, setResetFor] = useState<CsiMonitorTeam | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [state, setState]   = useState("");
  // Ranking scope: across all states, or within each state (grouped)
  const [scope, setScope]   = useState<"national" | "state">("national");
  const registered = teams.filter(t => t.registeredAt[caseId]);
  const statusOf = (t: CsiMonitorTeam) => t.progress[caseId]?.status ?? "none";
  // States of the registered teams, with counts ("—" = no state on the contingent)
  const stateCounts = new Map<string, number>();
  for (const t of registered) stateCounts.set(t.stateName ?? "—", (stateCounts.get(t.stateName ?? "—") ?? 0) + 1);
  const states = [...stateCounts.keys()].sort((a, b) => a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b));
  // Status counts follow the state filter, so the chips describe what the table can show
  const inState = registered.filter(t => !state || (t.stateName ?? "—") === state);
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, inState.filter(t => statusOf(t) === s).length]));
  // Ranks are computed over every registered team of the scope, before any
  // search / status / state filter, so filtering never changes a team's rank.
  const stateKey = (t: CsiMonitorTeam) => t.stateName ?? "—";
  const ranks = new Map<string, number>();
  if (scope === "national") rankTeams(registered, caseId).forEach((r, id) => ranks.set(id, r));
  else for (const s of states) rankTeams(registered.filter(t => stateKey(t) === s), caseId).forEach((r, id) => ranks.set(id, r));

  const ql = q.trim().toLowerCase();
  const rows = inState
    .filter(t => !status || statusOf(t) === status)
    .filter(t => !ql || [t.teamName, t.contingentName, t.stateName ?? "", t.alias ?? "", t.csiUserId].some(v => v.toLowerCase().includes(ql)))
    // Ranked first by rank, then playing / abandoned / not started, then team name
    .sort((a, b) =>
      (ranks.get(a.teamId) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.teamId) ?? Number.MAX_SAFE_INTEGER)
      || STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b))
      || (b.progress[caseId]?.score ?? -1) - (a.progress[caseId]?.score ?? -1)
      || a.teamName.localeCompare(b.teamName));
  // "Ikut Negeri": one block per state, in state order
  const groups = scope === "national"
    ? [{ key: "", rows }]
    : states.map(s => ({ key: s, rows: rows.filter(t => stateKey(t) === s) })).filter(g => g.rows.length > 0);

  return (
    <>
      <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
        {/* Ranking scope */}
        <div className="inline-flex rounded-lg border p-0.5 bg-zinc-50" role="group" aria-label="Kedudukan">
          {([["national", "Kebangsaan"], ["state", "Ikut Negeri"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setScope(v)}
              className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors",
                scope === v ? "bg-white text-indigo-700 shadow-sm" : "text-zinc-500 hover:text-zinc-700")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari pasukan, kontingen, negeri, akaun…"
            className="w-full pl-8 pr-7 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1.5 text-zinc-400 hover:text-zinc-600"><X className="h-3.5 w-3.5" /></button>
          )}
        </div>
        <select value={state} onChange={e => setState(e.target.value)}
          className={cn("py-1.5 pl-2 pr-7 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200",
            state && "border-indigo-300 text-indigo-700")}>
          <option value="">Semua negeri · {registered.length}</option>
          {states.map(s => <option key={s} value={s}>{s === "—" ? "Tiada negeri" : s} · {stateCounts.get(s)}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setStatus(null)}
            className={cn("text-[11px] px-2 py-0.5 rounded-full border", !status ? "bg-zinc-800 text-white border-zinc-800" : "text-zinc-500 hover:bg-zinc-50")}>
            Semua · {inState.length}
          </button>
          {STATUS_ORDER.map(s => (
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
          {registered.length === 0 ? "Belum ada pasukan berdaftar untuk kes ini." : "Tiada pasukan sepadan."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50/60 text-[11px] font-medium text-zinc-500">
                <th className="px-3 py-2 text-left w-14" title={scope === "national" ? "Kedudukan kebangsaan" : "Kedudukan dalam negeri"}>
                  {scope === "national" ? "Kedudukan" : "Kdd. Negeri"}
                </th>
                <th className="px-3 py-2 text-left">Pasukan</th>
                <th className="px-3 py-2 text-left">Kontingen</th>
                <th className="px-3 py-2 text-left w-28">Negeri</th>
                <th className="px-3 py-2 text-left w-36">Akaun CSI</th>
                <th className="px-3 py-2 text-left w-36">Didaftarkan</th>
                <th className="px-3 py-2 text-left w-28">Status</th>
                <th className="px-3 py-2 text-right w-24">Markah</th>
                <th className="px-3 py-2 text-right w-20">Tempoh</th>
                <th className="px-3 py-2 text-left w-36">Tamat</th>
                {reset && <th className="px-3 py-2 w-24" />}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g.key || "__all"}>
                  {scope === "state" && (
                    <tr className="bg-zinc-100 border-b">
                      <td colSpan={reset ? 11 : 10} className="px-3 py-1.5 text-[11px] font-bold text-zinc-600 uppercase tracking-wide">
                        {g.key === "—" ? "Tiada negeri" : g.key}
                        <span className="ml-2 font-normal normal-case text-zinc-400">
                          {stateCounts.get(g.key)} pasukan · {registered.filter(t => stateKey(t) === g.key && ranks.has(t.teamId)).length} selesai
                        </span>
                      </td>
                    </tr>
                  )}
              {g.rows.map(t => {
                const p = t.progress[caseId];
                const st = STATUS[statusOf(t)];
                const rank = ranks.get(t.teamId);
                return (
                  <tr key={t.teamId} className="border-b last:border-0 hover:bg-zinc-50/60">
                    <td className="px-3 py-2 text-xs tabular-nums">
                      {rank == null ? <span className="text-zinc-300">—</span> : (
                        <span className={cn("inline-flex min-w-6 h-6 px-1.5 items-center justify-center rounded-full font-bold",
                          RANK_CLS[rank - 1] ?? "bg-zinc-100 text-zinc-600")}>{rank}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-zinc-800">{t.teamName}</td>
                    <td className="px-3 py-2 text-zinc-600">{t.contingentName}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">{t.stateName ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="text-zinc-700">{t.alias ?? "—"}</span>
                      <span className="block font-mono text-[10px] text-zinc-400 truncate max-w-[9rem]" title={t.csiUserId}>{t.csiUserId}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-zinc-500">{fmtWhen(t.registeredAt[caseId])}</td>
                    <td className="px-3 py-2">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", st.cls)}>{st.label}</span>
                      {p && p.runs > 1 && <span className="ml-1 text-[10px] text-zinc-400" title="Bilangan percubaan">×{p.runs}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                      {p?.score != null ? <>{p.score}{p.maxScore != null && <span className="text-zinc-400">/{p.maxScore}</span>}</> : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] tabular-nums text-zinc-500">{fmtDuration(p) ?? "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-zinc-500">{p?.completedAt ? fmtWhen(p.completedAt) : "—"}</td>
                    {reset && (
                      <td className="px-3 py-2 text-right">
                        {p && (
                          <button onClick={() => setResetFor(t)} title="Set semula percubaan — pasukan bermula semula dari awal"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded px-1.5 py-0.5">
                            <RotateCcw className="h-3 w-3" /> Set semula
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resetFor && reset && <ResetDialog team={resetFor} caseId={caseId} ctx={reset} onClose={() => setResetFor(null)} />}
    </>
  );
}

function CompetitionPanel({ comp, eventId, canReset, onReload }: {
  comp: CsiMonitorCompetition; eventId: string; canReset: boolean; onReload: () => void;
}) {
  const [caseId, setCaseId] = useState<string | null>(comp.cases[0]?.id ?? null);
  const active = comp.cases.find(c => c.id === caseId) ?? comp.cases[0];

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b bg-zinc-50 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-zinc-400">{comp.code}</span>
          <h2 className="text-sm font-semibold text-zinc-800">{comp.name}</h2>
          {comp.csiCompetitionName && (
            <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-indigo-50 text-indigo-700">CSI: {comp.csiCompetitionName}</span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500">
          {comp.teamsInEvent} pasukan dalam acara · {comp.teamsWithAccount} mempunyai akaun Eptim CSI · {comp.teams.length} berdaftar pada sekurang-kurangnya satu kes
        </p>
      </div>

      {comp.error ? (
        <p className="px-5 py-6 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{comp.error}</p>
      ) : comp.cases.length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-400">Tiada kes dipilih untuk pertandingan ini.</p>
      ) : (
        <>
          {/* Case toggle */}
          <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
            <FolderSearch className="h-4 w-4 text-zinc-400" />
            {comp.cases.map(c => (
              <button key={c.id} onClick={() => setCaseId(c.id)}
                title={c.inCompetition ? c.slug : "Kes ini tidak lagi dilampirkan pada pertandingan CSI"}
                className={cn("text-xs px-3 py-1 rounded-full font-medium transition-colors inline-flex items-center gap-1.5",
                  active?.id === c.id ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")}>
                {!c.inCompetition && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                {c.title}
                <span className={cn("text-[10px] px-1.5 rounded-full", active?.id === c.id ? "bg-white/20" : "bg-white text-zinc-500")}>{c.registered}</span>
              </button>
            ))}
          </div>
          {active && !active.inCompetition && (
            <p className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50 border-b">
              Kes ini dipilih dalam konfigurasi acara tetapi tidak lagi dilampirkan pada pertandingan CSI — semak konfigurasi Eptim CSI pertandingan.
            </p>
          )}
          {active && (
            <CaseTable key={active.id} teams={comp.teams} caseId={active.id}
              reset={canReset && active.inCompetition ? { eventId, ecId: comp.ecId, caseTitle: active.title, onDone: onReload } : null} />
          )}
        </>
      )}
    </div>
  );
}

export function EptimCsiMonitorClient({ event, canReset }: { event: EventInfo; canReset: boolean }) {
  const [data, setData]   = useState<{ competitions: CsiMonitorCompetition[]; fetchedAt: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeEc, setActiveEc] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/eptim-csi`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Gagal memuatkan data Eptim CSI.");
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal"); }
    finally { setLoading(false); }
  }, [event.id]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/organizer/events/${event.id}/eptim-csi`, { cache: "no-store" })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? "Gagal memuatkan data Eptim CSI."); return j; })
      .then(j => { if (alive) setData(j); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Gagal"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [event.id]);

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
            <Fingerprint className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-zinc-900">Eptim CSI</h1>
          </div>
          <p className="text-sm text-zinc-500">{event.name} · Pantauan Pertandingan Dalam Talian</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          {data && <span>Dikemas kini {fmtWhen(data.fetchedAt)}</span>}
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-7 text-xs gap-1">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Muat semula
          </Button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {!data && loading && (
        <div className="rounded-xl border bg-white py-16 flex flex-col items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" /> Memuatkan pendaftaran daripada Eptim CSI…
        </div>
      )}

      {data && comps.length === 0 && (
        <p className="rounded-xl border bg-white px-5 py-10 text-center text-sm text-zinc-400">Tiada pertandingan acara ini disepadukan dengan Eptim CSI.</p>
      )}

      {comps.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {comps.map(c => (
            <button key={c.ecId} onClick={() => setActiveEc(c.ecId)}
              className={cn("text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors",
                active?.ecId === c.ecId ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
              <span className="font-mono mr-1 opacity-70">{c.code}</span>{c.name}
              <span className="ml-1.5 opacity-70">({c.teams.length})</span>
            </button>
          ))}
        </div>
      )}

      {active && <CompetitionPanel key={active.ecId} comp={active} eventId={event.id} canReset={canReset} onReload={load} />}
    </div>
  );
}
