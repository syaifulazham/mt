"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Fingerprint, Loader2, RefreshCw, Search, X, AlertTriangle, FolderSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function CaseTable({ teams, caseId }: { teams: CsiMonitorTeam[]; caseId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const registered = teams.filter(t => t.registeredAt[caseId]);
  const statusOf = (t: CsiMonitorTeam) => t.progress[caseId]?.status ?? "none";
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, registered.filter(t => statusOf(t) === s).length]));
  const ql = q.trim().toLowerCase();
  const rows = registered
    .filter(t => !status || statusOf(t) === status)
    .filter(t => !ql || [t.teamName, t.contingentName, t.stateName ?? "", t.alias ?? "", t.csiUserId].some(v => v.toLowerCase().includes(ql)))
    // Finished first by score, then playing, then the rest by team name
    .sort((a, b) =>
      STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b))
      || (b.progress[caseId]?.score ?? -1) - (a.progress[caseId]?.score ?? -1)
      || a.teamName.localeCompare(b.teamName));

  return (
    <>
      <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari pasukan, kontingen, negeri, akaun…"
            className="w-full pl-8 pr-7 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1.5 text-zinc-400 hover:text-zinc-600"><X className="h-3.5 w-3.5" /></button>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setStatus(null)}
            className={cn("text-[11px] px-2 py-0.5 rounded-full border", !status ? "bg-zinc-800 text-white border-zinc-800" : "text-zinc-500 hover:bg-zinc-50")}>
            Semua · {registered.length}
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
                <th className="px-3 py-2 text-left w-10">#</th>
                <th className="px-3 py-2 text-left">Pasukan</th>
                <th className="px-3 py-2 text-left">Kontingen</th>
                <th className="px-3 py-2 text-left w-28">Negeri</th>
                <th className="px-3 py-2 text-left w-36">Akaun CSI</th>
                <th className="px-3 py-2 text-left w-36">Didaftarkan</th>
                <th className="px-3 py-2 text-left w-28">Status</th>
                <th className="px-3 py-2 text-right w-24">Markah</th>
                <th className="px-3 py-2 text-left w-36">Tamat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const p = t.progress[caseId];
                const st = STATUS[statusOf(t)];
                return (
                  <tr key={t.teamId} className="border-b last:border-0 hover:bg-zinc-50/60">
                    <td className="px-3 py-2 text-xs text-zinc-400 tabular-nums">{i + 1}</td>
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
                    <td className="px-3 py-2 text-[11px] text-zinc-500">{p?.completedAt ? fmtWhen(p.completedAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CompetitionPanel({ comp }: { comp: CsiMonitorCompetition }) {
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
          {active && <CaseTable key={active.id} teams={comp.teams} caseId={active.id} />}
        </>
      )}
    </div>
  );
}

export function EptimCsiMonitorClient({ event }: { event: EventInfo }) {
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

      {active && <CompetitionPanel key={active.ecId} comp={active} />}
    </div>
  );
}
