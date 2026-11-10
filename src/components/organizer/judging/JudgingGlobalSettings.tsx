"use client";

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SharedRankMode } from "@/lib/sharedRank";

const OPTIONS: { value: SharedRankMode; label: string; example: string }[] = [
  { value: "SKIP",  label: "Langkau kedudukan seterusnya", example: "1, 2, 2, 4, 5, …" },
  { value: "DENSE", label: "Kedudukan berterusan",         example: "1, 2, 2, 3, 4, …" },
];

/** Penghakiman → Tetapan global: event-wide settings that apply to every competition. */
export function JudgingGlobalSettings({
  eventId, sharedRankMode: initial, canWrite,
}: {
  eventId: string;
  sharedRankMode: SharedRankMode;
  canWrite: boolean;
}) {
  const [mode, setMode] = useState(initial);
  const [saving, setSaving] = useState<SharedRankMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: SharedRankMode) {
    if (next === mode || saving) return;
    setSaving(next); setError(null);
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/judging-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedRankMode: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "Gagal menyimpan tetapan.");
      setMode(j.sharedRankMode ?? next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan tetapan.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Settings2 className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-semibold text-zinc-900">Tetapan global</h2>
        <span className="text-xs text-zinc-400">Terpakai kepada semua pertandingan acara ini</span>
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 px-5 py-4">
        <div className="w-44 shrink-0 pt-1.5">
          <p className="text-xs font-medium text-zinc-700">Kedudukan seri</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">Apabila pasukan mendapat markah sama</p>
        </div>
        <div className="flex-1 min-w-64 space-y-2">
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map(o => {
              const active = mode === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={!canWrite || !!saving}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3.5 py-2 text-left transition-colors",
                    active ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500" : "border-zinc-200 hover:border-zinc-300",
                    (!canWrite || saving) && !active && "opacity-60",
                    !canWrite && "cursor-default",
                  )}
                >
                  <span className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    active ? "border-violet-600" : "border-zinc-300",
                  )}>
                    {saving === o.value
                      ? <Loader2 className="h-3 w-3 animate-spin text-violet-600" />
                      : active && <span className="h-2 w-2 rounded-full bg-violet-600" />}
                  </span>
                  <span>
                    <span className={cn("block text-sm font-medium", active ? "text-violet-900" : "text-zinc-800")}>{o.label}</span>
                    <span className="block font-mono text-xs text-zinc-500">{o.example}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-400">
            Rujukan kedudukan bagi Scoreboard, Keputusan, Pengumuman, Medal Tally dan penjanaan sijil.
            Sijil yang telah dikeluarkan tidak berubah.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  );
}
