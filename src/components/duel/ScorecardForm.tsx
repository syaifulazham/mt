"use client";

import { useState } from "react";
import { Ban, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamAvatar } from "@/components/duel/TeamAvatar";
import { ChoiceToggle, CountStepper } from "@/components/organizer/judging/DuelScorecardEditor";
import { compareScores, scoreOf, type Scorecard, type Tally } from "@/lib/duel-scorecard";
import { cn } from "@/lib/utils";

export type ScorecardEntry = {
  id: string; teamId: string; slot: number; rank: number | null; tally?: Tally | null;
  team: { name: string; contingentName: string; flagUrl: string | null; logoUrl: string | null };
};

/**
 * One duel's scorecard: each team's gains and penalties (counters, toggle
 * buttons, a red disqualify button) with live totals. The order follows the
 * totals, disqualified last; equal totals are ordered with ↑ or, in a group
 * match that allows it, saved as a draw. Used by the duel manager's dialog and
 * the public /scorecard/<slug> page.
 */
export function ScorecardForm({ entries: raw, card, stage, isFinal, allowDraw, advance, onSave, onCancel, saveLabel = "Simpan keputusan", disabledReason }: {
  entries: ScorecardEntry[]; card: Scorecard; stage: string; isFinal: boolean; allowDraw: boolean; advance: number;
  onSave: (ranks: Record<string, number>, tallies: Record<string, Tally>) => Promise<void>;
  onCancel?: () => void; saveLabel?: string; disabledReason?: string | null;
}) {
  const entries = [...raw].sort((a, b) => a.slot - b.slot);
  const [tallies, setTallies] = useState<Record<string, Tally>>(() => Object.fromEntries(entries.map(e => [e.teamId, e.tally ?? {}])));
  // Manual order among equal totals; the shown order re-sorts this by score (stable).
  const [pref, setPref] = useState<string[]>(() => (entries.every(e => e.rank != null) ? [...entries].sort((a, b) => a.rank! - b.rank!) : entries).map(e => e.teamId));
  const [drawPick, setDrawPick] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const scores = Object.fromEntries(entries.map(e => [e.teamId, scoreOf(card, tallies[e.teamId] ?? {})]));
  const order = [...pref].sort((a, b) => compareScores(scores[a], scores[b]));
  const tied = (a: string, b: string) => compareScores(scores[a], scores[b]) === 0;
  const isGroupMatch = stage === "GROUP" && entries.length === 2;
  const canDraw = isGroupMatch && allowDraw && tied(order[0], order[1]);
  const draw = canDraw && (drawPick ?? true);
  const ranks: Record<string, number> = draw
    ? Object.fromEntries(order.map(id => [id, 1]))
    : Object.fromEntries(order.map((id, i) => [id, i + 1]));
  const anyMarks = Object.values(tallies).some(t => Object.keys(t).length > 0);
  const byId = new Map(entries.map(e => [e.teamId, e]));

  const setMark = (teamId: string, itemId: string, v: number | string | null) =>
    setTallies(t => {
      const next = { ...(t[teamId] ?? {}) };
      if (v === null || v === 0) delete next[itemId]; else next[itemId] = v;
      return { ...t, [teamId]: next };
    });
  const moveUp = (id: string) => {
    const i = order.indexOf(id);
    if (i <= 0) return;
    const next = [...order];
    next[i - 1] = id; next[i] = order[i - 1];
    setPref(next);
  };

  const itemRow = (teamId: string, it: Scorecard["items"][number]) => {
    const v = tallies[teamId]?.[it.id];
    const tone = it.group === "PENALTY" ? "penalty" : "gain";
    return (
      <div key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
        <span className={cn("text-xs", it.disqualify ? "font-semibold text-red-700" : "text-zinc-700")}>
          {it.label}
          {it.kind === "COUNT" && !it.disqualify && <span className="ml-1 font-mono text-[10px] text-zinc-400">{tone === "penalty" ? "−" : "+"}{it.points}{it.max ? ` ×${it.max}` : ""}</span>}
        </span>
        {it.kind === "CHOICE"
          ? <ChoiceToggle options={it.options} value={typeof v === "string" ? v : null} onChange={id => setMark(teamId, it.id, id)} tone={tone} />
          : it.disqualify
            ? <button type="button" onClick={() => setMark(teamId, it.id, v ? null : 1)}
                className={cn("flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold", v ? "border-red-600 bg-red-600 text-white" : "text-red-600 hover:bg-red-50")}>
                <Ban className="h-3.5 w-3.5" /> {v ? "Hilang kelayakan" : "Tanda"}
              </button>
            : <CountStepper value={typeof v === "number" ? v : 0} max={it.max} onChange={n => setMark(teamId, it.id, n)} tone={tone} />}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-3", entries.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4")}>
        {entries.map(e => {
          const sc = scores[e.teamId];
          const pos = order.indexOf(e.teamId) + 1;
          return (
            <div key={e.id} className={cn("space-y-2 rounded-2xl border-2 bg-white p-3", sc.disqualified ? "border-red-300 bg-red-50/40" : pos === 1 && anyMarks ? "border-amber-300 bg-amber-50/40" : "border-zinc-200")}>
              <div className="flex items-center gap-2">
                <TeamAvatar flagUrl={e.team.flagUrl} logoUrl={e.team.logoUrl} name={e.team.contingentName} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-zinc-800">{e.team.name}</span>
                  <span className="block truncate text-[11px] text-zinc-400">{e.team.contingentName}</span>
                </span>
                <span className="text-right">
                  <span className={cn("block font-mono text-2xl font-black leading-none", sc.disqualified ? "text-red-600" : "text-zinc-900")}>{sc.total}</span>
                  <span className="text-[10px] text-zinc-400">{sc.disqualified ? "DQ" : "markah"}</span>
                </span>
              </div>
              {(["GAIN", "PENALTY"] as const).map(g => {
                const items = card.items.filter(i => i.group === g);
                if (!items.length) return null;
                return (
                  <div key={g} className={cn("rounded-xl px-2.5 py-1", g === "PENALTY" ? "bg-red-50/60" : "bg-emerald-50/60")}>
                    <p className={cn("pt-1 text-[10px] font-bold uppercase tracking-wide", g === "PENALTY" ? "text-red-700" : "text-emerald-700")}>{g === "PENALTY" ? "Penalti" : "Mata"}</p>
                    <div className="divide-y divide-black/5">{items.map(it => itemRow(e.teamId, it))}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 rounded-xl border bg-zinc-50 p-3">
        <p className="text-xs font-semibold text-zinc-600">Keputusan</p>
        {canDraw && (
          <label className="flex items-center gap-2 text-xs text-zinc-700">
            <input type="checkbox" checked={draw} onChange={e => setDrawPick(e.target.checked)} className="accent-violet-600" />
            Markah sama — rekod sebagai seri (tidak ditanda: pilih pemenang dengan ↑)
          </label>
        )}
        <ol className="space-y-1">
          {order.map((id, i) => {
            const e = byId.get(id)!;
            const tieAbove = i > 0 && tied(order[i - 1], id);
            return (
              <li key={id} className="flex items-center gap-2 text-sm">
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-black text-white", draw ? "bg-violet-500" : i === 0 ? "bg-amber-400" : "bg-zinc-400")}>{draw ? "S" : i + 1}</span>
                <span className="flex-1 truncate font-medium text-zinc-800">{e.team.name}</span>
                <span className="font-mono text-xs text-zinc-500">{scores[id].disqualified ? "DQ" : scores[id].total}</span>
                {!draw && !isFinal && stage !== "GROUP" && i < advance && <span className="text-[11px] text-emerald-600">mara</span>}
                {tieAbove && !draw && (
                  <button type="button" onClick={() => moveUp(id)} title="Markah sama — naikkan" className="rounded border bg-white px-1.5 text-xs text-amber-700 hover:bg-amber-50">↑ naikkan</button>
                )}
              </li>
            );
          })}
        </ol>
        {!draw && order.some((id, i) => i > 0 && tied(order[i - 1], id)) && (
          <p className="text-[11px] text-amber-700">Ada markah sama — susunan semasa akan disimpan; guna ↑ untuk menukar.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {disabledReason && <p className="mr-auto text-xs text-amber-700">{disabledReason}</p>}
        {onCancel && <Button variant="outline" onClick={onCancel}>Batal</Button>}
        <Button disabled={saving || !anyMarks || !!disabledReason} className="gap-1.5 bg-rose-600 hover:bg-rose-700"
          onClick={async () => { setSaving(true); try { await onSave(ranks, tallies); } finally { setSaving(false); } }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {saveLabel}
        </Button>
      </div>
    </div>
  );
}
