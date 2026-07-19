"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Trophy, Plus, Trash2, Loader2, Copy, Check,
  Eye, EyeOff, ExternalLink, Globe, Lock, Medal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type RankEntry = {
  rank: number; registrationId: string; participantName: string;
  contingentName: string; contingentLogo: string | null;
  totalScore: number; bestTime: number | null;
};

type CompetitionRanking = { id: string; name: string; code: string; rankings: RankEntry[] };

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

// ── Main component ─────────────────────────────────────────────────────────────

export function WalkInResultsClient({ event, competitionRankings, endpoints: initialEndpoints, canWrite }: {
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

  async function handleCreate() {
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/results-endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: createLabel || undefined, requirePasscode, isWalkIn: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal");
      setEndpoints(prev => [j.data, ...prev]);
      setShowCreate(false); setCreateLabel(""); setRequirePasscode(false);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Gagal");
    } finally { setCreating(false); }
  }

  const activeRanking = competitionRankings.find(c => c.id === activeComp);

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
            <Trophy className="h-5 w-5 text-indigo-500" />
            <h1 className="text-xl font-bold text-zinc-900">Keputusan Walk-in</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">{event.name}</p>
        </div>
      </div>

      {/* Live rankings preview */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-zinc-50 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
            <Medal className="h-4 w-4 text-indigo-400" /> Kedudukan Semasa
          </h2>
          {/* Competition tabs */}
          <div className="flex gap-1 flex-wrap">
            {competitionRankings.map(c => (
              <button key={c.id} onClick={() => setActiveComp(c.id)}
                className={cn("text-xs px-3 py-1 rounded-full font-medium transition-colors",
                  activeComp === c.id
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                )}>
                {c.code}
              </button>
            ))}
          </div>
        </div>

        {!activeRanking || activeRanking.rankings.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            Tiada markah direkodkan lagi untuk pertandingan ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50/40 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-center w-12">#</th>
                  <th className="px-4 py-2.5">Peserta</th>
                  <th className="px-4 py-2.5">Kontinjen</th>
                  <th className="px-4 py-2.5 text-center w-24">Markah</th>
                  <th className="px-4 py-2.5 text-center w-20">Masa</th>
                </tr>
              </thead>
              <tbody>
                {activeRanking.rankings.map(r => (
                  <tr key={r.registrationId} className={cn("border-b last:border-0 hover:bg-zinc-50/40",
                    r.rank <= 3 && "bg-amber-50/30")}>
                    <td className="px-4 py-3 text-center">
                      {MEDAL[r.rank]
                        ? <span className="text-lg">{MEDAL[r.rank].icon}</span>
                        : <span className="text-xs font-bold text-zinc-400">{r.rank}</span>
                      }
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-800">{r.participantName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.contingentLogo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={r.contingentLogo} alt="" className="w-6 h-6 rounded-full object-cover border" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          : <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[9px] font-bold text-zinc-500">
                              {r.contingentName.slice(0, 2).toUpperCase()}
                            </div>
                        }
                        <span className="text-sm text-zinc-600 truncate max-w-[200px]">{r.contingentName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-indigo-700">{r.totalScore.toFixed(1)}</td>
                    <td className="px-4 py-3 text-center text-xs font-mono text-sky-600">
                      {r.bestTime != null ? fmtTime(r.bestTime) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
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
              className="h-7 text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
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

      {/* Create endpoint dialog */}
      <Dialog open={showCreate} onOpenChange={o => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Globe className="h-4 w-4" /> Jana Pautan Keputusan Walk-in
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
            <p className="text-[10px] text-zinc-400">URL unik akan dijana secara automatik. Hasil semasa diperoleh daripada markah penghakiman walk-in.</p>
            {createErr && <p className="text-xs text-red-500">{createErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Batal</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Jana
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
