"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Trophy, Plus, Trash2, Loader2, Copy, Check,
  Eye, EyeOff, ExternalLink, Globe, Lock, Medal, FileDown, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type RankEntry = {
  rank: number; teamId: string; teamName: string;
  contingentName: string; contingentLogo: string | null;
  totalScore: number; bestTime: number | null;
  selected: boolean;
};

type StateGroup = {
  stateId: string; stateName: string; bestScore: number;
  teams: RankEntry[];
};

type CompetitionRanking = {
  id: string; name: string; code: string;
  targetGroup: { id: string; code: string; name: string } | null;
  rankings: RankEntry[];
  stateGroups: StateGroup[];
};

type Endpoint = {
  id: string; routeSlug: string; passcode: string | null;
  label: string | null; status: string; competitionIds: string[];
  createdAt: string;
};

type EventInfo = { id: string; name: string; slug: string; scope: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(s: number) {
  const m = Math.floor(s / 60); const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

const MEDAL: Record<number, { icon: string; cls: string }> = {
  1: { icon: "🥇", cls: "text-amber-500" },
  2: { icon: "🥈", cls: "text-slate-400" },
  3: { icon: "🥉", cls: "text-orange-400" },
};

const ZONE_SCOPES = ["ZONE", "ONLINE_ZONE"];

// ── Switch toggle ──────────────────────────────────────────────────────────────

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-emerald-500" : "bg-zinc-300",
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200",
        checked ? "translate-x-4" : "translate-x-0",
      )} />
    </button>
  );
}

// ── EndpointRow ────────────────────────────────────────────────────────────────

function EndpointRow({ ep, eventId, onDelete, onStatusChange }: {
  ep: Endpoint; eventId: string;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/results/${ep.routeSlug}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/v2/organizer/events/${eventId}/results-endpoints/${ep.id}`, { method: "DELETE" });
      onDelete(ep.id);
    } finally { setDeleting(false); }
  }

  async function toggleStatus() {
    setToggling(true);
    const next = ep.status === "ACTIVE" ? "CLOSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/results-endpoints/${ep.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) onStatusChange(ep.id, next);
    } finally { setToggling(false); }
  }

  return (
    <tr className={cn("border-b last:border-0 hover:bg-zinc-50/60 transition-colors", ep.status === "CLOSED" && "opacity-50")}>
      <td className="px-4 py-3 text-sm">
        {ep.label
          ? <span className="font-medium text-zinc-800">{ep.label}</span>
          : <span className="text-zinc-300 italic text-xs">—</span>
        }
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-zinc-500 truncate max-w-[160px]">/results/{ep.routeSlug}</span>
          <button onClick={handleCopy} className="p-0.5 rounded hover:bg-zinc-200 shrink-0">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
          <Link href={`/results/${ep.routeSlug}`} target="_blank" className="p-0.5 rounded hover:bg-zinc-200 shrink-0">
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </Link>
        </div>
      </td>
      <td className="px-4 py-3">
        {ep.passcode ? (
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-zinc-400" />
            <span className={cn("font-mono font-bold tracking-widest text-sm", ep.status === "ACTIVE" ? "text-rose-700" : "text-zinc-400")}>
              {showPass ? ep.passcode : "••••••"}
            </span>
            <button onClick={() => setShowPass(v => !v)} className="p-0.5 rounded hover:bg-zinc-100">
              {showPass ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-1 text-xs text-green-600"><Globe className="h-3 w-3" /> Awam</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
          ep.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400"
        )}>
          {ep.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button onClick={toggleStatus} disabled={toggling}
            className="text-[11px] text-zinc-400 hover:text-zinc-700 font-medium flex items-center gap-1">
            {toggling && <Loader2 className="h-3 w-3 animate-spin" />}
            {ep.status === "ACTIVE" ? "Tutup" : "Buka"}
          </button>
          <button onClick={handleDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-400" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── CompetitionTabs — grouped by target group, sorted by code ──────────────────

function CompetitionTabs({ competitions, activeId, onSelect }: {
  competitions: CompetitionRanking[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  type Group = { id: string | null; code: string | null; name: string | null; items: CompetitionRanking[] };
  const groupMap = new Map<string | null, Group>();

  const sorted = [...competitions].sort((a, b) => a.code.localeCompare(b.code));
  for (const c of sorted) {
    const key = c.targetGroup?.id ?? null;
    if (!groupMap.has(key)) {
      groupMap.set(key, { id: key, code: c.targetGroup?.code ?? null, name: c.targetGroup?.name ?? null, items: [] });
    }
    groupMap.get(key)!.items.push(c);
  }

  const groups = [...groupMap.values()].sort((a, b) => {
    if (a.code === null) return 1;
    if (b.code === null) return -1;
    return a.code.localeCompare(b.code);
  });

  if (groups.length === 1 && groups[0].id === null) {
    return (
      <div className="flex gap-1 flex-wrap">
        {groups[0].items.map((c) => (
          <button key={c.id} onClick={() => onSelect(c.id)}
            className={cn("text-xs px-3 py-1 rounded-full font-medium transition-colors",
              activeId === c.id ? "bg-rose-600 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            )}>
            {c.code}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 flex-wrap items-start">
      {groups.map((g) => (
        <div key={g.id ?? "__none"} className="flex items-center gap-1">
          {g.name && (
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mr-0.5 whitespace-nowrap">
              {g.code}
            </span>
          )}
          {g.items.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)}
              title={`${c.code} – ${c.name}`}
              className={cn("text-xs px-3 py-1 rounded-full font-medium transition-colors",
                activeId === c.id ? "bg-rose-600 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              )}>
              {c.code}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Contingent cell ────────────────────────────────────────────────────────────

function ContingentCell({ name, logo }: { name: string; logo: string | null }) {
  return (
    <div className="flex items-center gap-2">
      {logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logo} alt="" className="w-6 h-6 rounded-full object-cover border shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        : <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[9px] font-bold text-zinc-500 shrink-0">
            {name.slice(0, 2).toUpperCase()}
          </div>
      }
      <span className="text-sm text-zinc-600">{name}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EventResultsClient({ event, competitionRankings, endpoints: initialEndpoints, canWrite }: {
  event: EventInfo;
  competitionRankings: CompetitionRanking[];
  endpoints: Endpoint[];
  canWrite: boolean;
}) {
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [activeComp, setActiveComp] = useState(competitionRankings[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // Download modal state
  const [showDownload, setShowDownload] = useState(false);
  const [dlCompScope, setDlCompScope] = useState<"all" | "select">("all");
  const [dlSelectedComps, setDlSelectedComps] = useState<Set<string>>(new Set());
  const [dlRankedBy, setDlRankedBy] = useState<"national" | "state">(
    ["ZONE", "ONLINE_ZONE", "STATE"].includes(event.scope) ? "state" : "national"
  );
  const [downloading, setDownloading] = useState(false);

  // Selected state map — synced with preregistration page's TeamEvent.selected
  const [selectedMap, setSelectedMap] = useState<Map<string, boolean>>(() => {
    const m = new Map<string, boolean>();
    for (const comp of competitionRankings) {
      for (const r of comp.rankings) m.set(r.teamId, r.selected);
      for (const g of comp.stateGroups) for (const r of g.teams) m.set(r.teamId, r.selected);
    }
    return m;
  });
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const isZone = ZONE_SCOPES.includes(event.scope);

  async function toggleSelected(teamId: string) {
    const current = selectedMap.get(teamId) ?? false;
    const next = !current;
    setSelectedMap((prev) => new Map(prev).set(teamId, next));
    setTogglingIds((prev) => new Set(prev).add(teamId));
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/teams`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, selected: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSelectedMap((prev) => new Map(prev).set(teamId, current));
    } finally {
      setTogglingIds((prev) => { const s = new Set(prev); s.delete(teamId); return s; });
    }
  }

  async function handleCreate() {
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/results-endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: createLabel || undefined, requirePasscode }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal");
      setEndpoints(prev => [j.data, ...prev]);
      setShowCreate(false); setCreateLabel(""); setRequirePasscode(false);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Gagal");
    } finally { setCreating(false); }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const toExport = dlCompScope === "all"
        ? competitionRankings
        : competitionRankings.filter(c => dlSelectedComps.has(c.id));
      if (toExport.length === 0) return;
      const { exportResultsExcel } = await import("@/lib/export/eventResultsExport");
      await exportResultsExcel({ eventName: event.name, competitions: toExport, rankedBy: dlRankedBy });
      setShowDownload(false);
    } finally { setDownloading(false); }
  }

  const activeRanking = competitionRankings.find(c => c.id === activeComp);
  const useStateGroups = isZone && (activeRanking?.stateGroups.length ?? 0) > 0;
  const hasData = useStateGroups
    ? (activeRanking?.stateGroups.length ?? 0) > 0
    : (activeRanking?.rankings.length ?? 0) > 0;

  // Shared table headers
  const thead = (
    <tr className="border-b bg-zinc-50/40 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
      <th className="px-4 py-2.5 text-center w-12">#</th>
      <th className="px-4 py-2.5">Pasukan</th>
      <th className="px-4 py-2.5">Kontinjen</th>
      <th className="px-4 py-2.5 text-center w-24">Markah</th>
      <th className="px-4 py-2.5 text-center w-20">Masa</th>
      <th className="px-4 py-2.5 text-center w-16">Pilih</th>
    </tr>
  );

  function renderTeamRow(r: RankEntry) {
    const isSelected = selectedMap.get(r.teamId) ?? false;
    const isToggling = togglingIds.has(r.teamId);
    return (
      <tr key={r.teamId} className={cn("border-b last:border-0 hover:bg-zinc-50/40",
        r.rank <= 3 && "bg-amber-50/30")}>
        <td className="px-4 py-3 text-center">
          {MEDAL[r.rank]
            ? <span className="text-lg">{MEDAL[r.rank].icon}</span>
            : <span className="text-xs font-bold text-zinc-400">{r.rank}</span>
          }
        </td>
        <td className="px-4 py-3 font-medium text-zinc-800">{r.teamName}</td>
        <td className="px-4 py-3">
          <ContingentCell name={r.contingentName} logo={r.contingentLogo} />
        </td>
        <td className="px-4 py-3 text-center font-bold text-rose-700">{r.totalScore.toFixed(1)}</td>
        <td className="px-4 py-3 text-center text-xs font-mono text-sky-600">
          {r.bestTime != null ? fmtTime(r.bestTime) : "—"}
        </td>
        <td className="px-4 py-3 text-center">
          {isToggling
            ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400 mx-auto" />
            : <Switch checked={isSelected} onChange={() => toggleSelected(r.teamId)} disabled={!canWrite} />
          }
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/organizer/events/${event.slug}/manage`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-rose-500" />
            <h1 className="text-xl font-bold text-zinc-900">Keputusan</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">{event.name}</p>
        </div>
      </div>

      {/* Live rankings */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-zinc-50 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2 shrink-0">
            <Medal className="h-4 w-4 text-rose-400" />
            {activeRanking
              ? <span>Keputusan <span className="font-mono text-rose-600">{activeRanking.code}</span> {activeRanking.name}</span>
              : "Kedudukan Semasa"
            }
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <CompetitionTabs competitions={competitionRankings} activeId={activeComp} onSelect={setActiveComp} />
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1 border-rose-200 text-rose-700 hover:bg-rose-50 shrink-0"
              onClick={() => {
                setDlCompScope("all");
                setDlSelectedComps(new Set());
                setShowDownload(true);
              }}>
              <FileDown className="h-3 w-3" /> Muat Turun
            </Button>
          </div>
        </div>

        {!activeRanking || !hasData ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            Tiada markah direkodkan lagi untuk pertandingan ini.
          </div>
        ) : useStateGroups ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>{thead}</thead>
              <tbody>
                {activeRanking.stateGroups.map((group) => (
                  <>
                    <tr key={`hdr-${group.stateId}`} className="bg-zinc-100 border-b border-zinc-200">
                      <td colSpan={6} className="px-4 py-1.5">
                        <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wide">
                          {group.stateName}
                        </span>
                      </td>
                    </tr>
                    {group.teams.map(renderTeamRow)}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>{thead}</thead>
              <tbody>{activeRanking.rankings.map(renderTeamRow)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Public endpoints */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-zinc-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
            <Globe className="h-4 w-4 text-zinc-400" /> Paparan Awam
          </h2>
          {canWrite && (
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1 border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={() => { setShowCreate(true); setCreateLabel(""); setRequirePasscode(false); setCreateErr(""); }}>
              <Plus className="h-3 w-3" /> Jana Pautan
            </Button>
          )}
        </div>

        {endpoints.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-400">
            Tiada pautan awam dijana lagi.{canWrite && " Klik \"Jana Pautan\" untuk mencipta satu."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50/40 text-xs font-semibold text-zinc-500 uppercase">
                  <th className="px-4 py-2.5 text-left w-36">Label</th>
                  <th className="px-4 py-2.5 text-left">URL</th>
                  <th className="px-4 py-2.5 text-left w-36">Akses</th>
                  <th className="px-4 py-2.5 text-left w-20">Status</th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody>
                {endpoints.map(ep => (
                  <EndpointRow
                    key={ep.id} ep={ep} eventId={event.id}
                    onDelete={id => setEndpoints(p => p.filter(e => e.id !== id))}
                    onStatusChange={(id, status) => setEndpoints(p => p.map(e => e.id === id ? { ...e, status } : e))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Download dialog */}
      <Dialog open={showDownload} onOpenChange={o => { if (!o) setShowDownload(false); }}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <FileDown className="h-4 w-4" /> Muat Turun Keputusan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2 px-4">
            {/* Section 1: Competition scope */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Pertandingan</p>
              <div className="flex gap-2">
                {(["all", "select"] as const).map((v) => (
                  <button key={v} type="button"
                    onClick={() => setDlCompScope(v)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      dlCompScope === v
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-white text-zinc-500 border-zinc-200 hover:border-rose-300 hover:text-rose-600"
                    )}>
                    {v === "all" ? "Semua" : "Pilih"}
                  </button>
                ))}
              </div>
              {dlCompScope === "select" && (
                <div className="mt-2">
                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y text-sm">
                    {competitionRankings.map(c => (
                      <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-50">
                        <input type="checkbox"
                          checked={dlSelectedComps.has(c.id)}
                          onChange={e => {
                            setDlSelectedComps(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.id); else next.delete(c.id);
                              return next;
                            });
                          }}
                          className="rounded border-zinc-300" />
                        <span className="text-zinc-700">
                          <span className="font-mono text-rose-600 mr-1">{c.code}</span>
                          — {c.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    <button type="button" className="text-[11px] text-rose-600 hover:underline"
                      onClick={() => setDlSelectedComps(new Set(competitionRankings.map(c => c.id)))}>
                      Pilih Semua
                    </button>
                    <button type="button" className="text-[11px] text-zinc-400 hover:underline"
                      onClick={() => setDlSelectedComps(new Set())}>
                      Nyahpilih Semua
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Ranked by — only shown if any competition has stateGroups */}
            {!competitionRankings.every(c => c.stateGroups.length === 0) && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Susun Mengikut</p>
                <div className="flex gap-2">
                  {([["national", "Kebangsaan"], ["state", "Negeri"]] as const).map(([v, label]) => (
                    <button key={v} type="button"
                      onClick={() => setDlRankedBy(v)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                        dlRankedBy === v
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-white text-zinc-500 border-zinc-200 hover:border-rose-300 hover:text-rose-600"
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDownload(false)} disabled={downloading}>Batal</Button>
            <Button
              onClick={handleDownload}
              disabled={downloading || (dlCompScope === "select" && dlSelectedComps.size === 0)}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5">
              {downloading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              Muat Turun
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create endpoint dialog */}
      <Dialog open={showCreate} onOpenChange={o => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <Globe className="h-4 w-4" /> Jana Pautan Keputusan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 px-4">
            <div>
              <Label className="text-xs">Label (pilihan)</Label>
              <Input value={createLabel} onChange={e => setCreateLabel(e.target.value)}
                placeholder="cth. Keputusan Akhir, Separuh Akhir…"
                className="mt-1 h-8 text-sm" onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={requirePasscode} onChange={e => setRequirePasscode(e.target.checked)}
                className="rounded" />
              <span className="text-sm text-zinc-700">Lindungi dengan passcode</span>
            </label>
            <p className="text-[10px] text-zinc-400">URL unik akan dijana secara automatik. Hasil semasa diperoleh daripada markah penghakiman.</p>
            {createErr && <p className="text-xs text-red-500">{createErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Batal</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Jana
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
