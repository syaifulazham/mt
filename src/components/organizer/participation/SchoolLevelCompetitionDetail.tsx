"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, School, Users, Info, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SchoolLevelCompetitionStats, SchoolLevelParticipant } from "@/lib/schoolLevelStats";
import { Breakdowns, StatCard, fmt } from "@/components/organizer/workshops/parts";

// Participation → School Level → one competition. Laid out like a workshop's
// page. The download fetches the eligible participants in pages of 5,000
// (a competition can have ~90,000) and shows progress, then builds the XLSX.

type Phase =
  | { kind: "idle" }
  | { kind: "fetching"; loaded: number; total: number; startedAt: number }
  | { kind: "building"; done: number; total: number; sheet: string; rows: number; startedAt: number }
  | { kind: "done"; rows: number; seconds: number }
  | { kind: "error"; message: string };

function DownloadEligibleButton({ stats }: { stats: SchoolLevelCompetitionStats }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const cancelled = useRef(false);
  const busy = phase.kind === "fetching" || phase.kind === "building";

  async function download() {
    cancelled.current = false;
    const startedAt = Date.now();
    const total = stats.participations;
    setPhase({ kind: "fetching", loaded: 0, total, startedAt });
    try {
      const all: SchoolLevelParticipant[] = [];
      let after: string | null = null;
      do {
        const qs: string = after ? `?after=${encodeURIComponent(after)}` : "";
        const res = await fetch(`/api/v2/organizer/participation/school-level/competitions/${stats.id}/participants${qs}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
        all.push(...(j.data as SchoolLevelParticipant[]));
        after = j.next as string | null;
        if (cancelled.current) { setPhase({ kind: "idle" }); return; }
        setPhase({ kind: "fetching", loaded: all.length, total: Math.max(total, all.length), startedAt });
      } while (after);

      setPhase({ kind: "building", done: 0, total: 1, sheet: "", rows: all.length, startedAt });
      const { exportWorkshopParticipantsExcel } = await import("@/lib/export/workshopParticipantsExport");
      await exportWorkshopParticipantsExcel({
        title: `${stats.code} ${stats.name}`,
        competitions: `Peserta layak (kontinjen sekolah) — ${stats.targetGroups.map((t) => t.name).join(", ")}`,
        participants: all,
        teamColumn: false,
        filePrefix: "peserta-layak",
        countLabel: "peserta layak",
        onProgress: (done, sheets, sheet) =>
          setPhase({ kind: "building", done, total: sheets, sheet, rows: all.length, startedAt }),
      });
      setPhase({ kind: "done", rows: all.length, seconds: Math.round((Date.now() - startedAt) / 1000) });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Muat turun gagal" });
    }
  }

  const pct = phase.kind === "fetching" ? (phase.total ? phase.loaded / phase.total : 0) * 0.7
    : phase.kind === "building" ? 0.7 + (phase.total ? phase.done / phase.total : 0) * 0.3
    : phase.kind === "done" ? 1 : 0;

  return (
    <div className="flex w-72 flex-col items-end gap-2">
      <Button onClick={download} disabled={busy || stats.participations === 0}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Download participants (XLSX)
      </Button>
      {phase.kind !== "idle" && (
        <div className="w-full rounded-lg border bg-white p-3 text-xs shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-medium text-zinc-700">
              {phase.kind === "fetching" && `Memuatkan peserta ${fmt(phase.loaded)} / ${fmt(phase.total)}`}
              {phase.kind === "building" && (phase.sheet ? `Menjana Excel — ${phase.sheet} (${phase.done + 1}/${phase.total})` : "Menjana fail Excel…")}
              {phase.kind === "done" && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {fmt(phase.rows)} peserta · {phase.seconds} s</span>}
              {phase.kind === "error" && <span className="text-red-600">{phase.message}</span>}
            </span>
            {phase.kind === "fetching" && (
              <button onClick={() => { cancelled.current = true; }} title="Batal" className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {phase.kind !== "error" && (
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-[#085782] transition-all duration-300" style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
          )}
          {phase.kind === "building" && phase.rows > 30000 && (
            <p className="mt-1.5 text-[11px] text-zinc-400">Fail besar ({fmt(phase.rows)} baris) — mungkin mengambil masa seminit atau dua.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function SchoolLevelCompetitionDetail({ stats, canDownload }: { stats: SchoolLevelCompetitionStats; canDownload: boolean }) {
  return (
    <div className="mx-auto max-w-6xl space-y-7 p-6">
      <div>
        <Link href="/organizer/participation/school-level" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-3.5 w-3.5" /> All competitions
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900">
              <span className="mr-2 font-mono text-zinc-400">{stats.code}</span>{stats.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stats.targetGroups.map((t) => (
                <span key={t.id} className="rounded-full border bg-white px-2 py-0.5 text-[11px] text-zinc-600">
                  {t.name}{t.ppki && " · PPKI"}
                </span>
              ))}
            </div>
          </div>
          {canDownload && <DownloadEligibleButton stats={stats} />}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
        <Info className="mt-px h-4 w-4 shrink-0" />
        <p>
          Based on <b>school contingents</b> only, counted like <b>Total Participation</b> on the dashboard: every
          participant whose education level matches one of this competition&apos;s target groups (PPKI-only groups:
          PPKI participants) is one participation, whether or not they have joined a team.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Participations" value={stats.participations} icon={Users} color="bg-[#085782]" sub="eligible school participants" />
        <StatCard label="Schools" value={stats.schools} icon={School} color="bg-violet-500" sub="with eligible participants" />
        <StatCard label="Male" value={stats.male} icon={Users} color="bg-sky-500"
          sub={stats.participations ? `${((stats.male / stats.participations) * 100).toFixed(1)}%` : undefined} />
        <StatCard label="Female" value={stats.female} icon={Users} color="bg-pink-500"
          sub={stats.participations ? `${((stats.female / stats.participations) * 100).toFixed(1)}%` : undefined} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b bg-zinc-50/80 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-zinc-700">Target group{stats.targetGroups.length > 1 ? "s" : ""}</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs font-semibold text-zinc-500">
            <tr>
              <th className="px-5 py-2.5">Target group</th>
              <th className="px-5 py-2.5">School level</th>
              <th className="px-5 py-2.5 text-right">Eligible participations</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stats.targetGroups.map((t) => (
              <tr key={t.id}>
                <td className="px-5 py-2.5 text-zinc-800">{t.name}{t.ppki && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700">PPKI</span>}</td>
                <td className="px-5 py-2.5 text-zinc-600">{t.label}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{fmt(t.participations)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-900">Eligible participants</h2>
        <p className="text-xs text-zinc-500">{fmt(stats.participations)} participants from {fmt(stats.schools)} schools.</p>
      </div>

      <Breakdowns breakdown={stats.breakdown} total={stats.participations}
        dimensions={["state", "schoolCategory", "ethnicity", "gender"]} />
    </div>
  );
}
