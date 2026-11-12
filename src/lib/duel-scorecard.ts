// Duel scorecard (Penghakiman → Duel → Kad skor): what a team earns and loses
// in one duel. Two groups — GAIN (Mata) and PENALTY (Penalti) — of items:
//   COUNT  — points per occurrence, up to `max` times (0 = no limit),
//            e.g. "Tumbangkan lawan" 2 mata, tiada had;
//   CHOICE — exactly one of several options, each with its points,
//            e.g. "Kawalan robot: Baik 3 / Sederhana 2 / Lemah 1" (toggle buttons).
// Points are entered as magnitudes: gains add, penalties subtract. A penalty
// marked `disqualify` (e.g. "Hilang kelayakan") puts the team last whatever
// its score. The duel's ranks follow the scores; ties are settled by hand.
// Client-safe.

export type ScoreOption = { id: string; label: string; points: number };
export type ScoreItem = {
  id: string; group: "GAIN" | "PENALTY"; kind: "COUNT" | "CHOICE";
  label: string; points: number; max: number; options: ScoreOption[]; disqualify: boolean;
};
export type Scorecard = { enabled: boolean; items: ScoreItem[] };
/** A team's marks in one duel: item id → count (COUNT) or chosen option id (CHOICE). */
export type Tally = Record<string, number | string>;

export const EMPTY_SCORECARD: Scorecard = { enabled: false, items: [] };

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const rid = () => Math.random().toString(36).slice(2, 10);

/** A scorecard from stored / submitted JSON, cleaned (magnitudes, ids, limits). */
export function parseScorecard(json: unknown): Scorecard {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 40).flatMap((x): ScoreItem[] => {
    const r = (x ?? {}) as Record<string, unknown>;
    const label = String(r.label ?? "").trim().slice(0, 80);
    if (!label) return [];
    const kind = r.kind === "CHOICE" ? "CHOICE" : "COUNT";
    const group = r.group === "PENALTY" ? "PENALTY" : "GAIN";
    const options = kind === "CHOICE"
      ? (Array.isArray(r.options) ? r.options : []).slice(0, 12).flatMap((p): ScoreOption[] => {
          const q = (p ?? {}) as Record<string, unknown>;
          const l = String(q.label ?? "").trim().slice(0, 60);
          return l ? [{ id: String(q.id ?? "") || rid(), label: l, points: Math.abs(num(q.points)) }] : [];
        })
      : [];
    if (kind === "CHOICE" && options.length < 2) return [];
    const disqualify = group === "PENALTY" && kind === "COUNT" && r.disqualify === true;
    return [{
      id: String(r.id ?? "") || rid(), group, kind, label,
      points: kind === "COUNT" ? Math.abs(num(r.points)) : 0,
      max: disqualify ? 1 : kind === "COUNT" ? Math.max(0, Math.min(999, Math.trunc(num(r.max)))) : 1,
      options, disqualify,
    }];
  });
  return { enabled: o.enabled === true && items.length > 0, items };
}

/** A tally cleaned against the scorecard (unknown items dropped, counts capped). */
export function cleanTally(card: Scorecard, raw: unknown): Tally {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Tally = {};
  for (const it of card.items) {
    const v = t[it.id];
    if (it.kind === "CHOICE") { if (typeof v === "string" && it.options.some(o => o.id === v)) out[it.id] = v; continue; }
    const n = Math.max(0, Math.trunc(num(v)));
    if (n) out[it.id] = it.max ? Math.min(n, it.max) : n;
  }
  return out;
}

/** A team's total and whether a disqualifying penalty is marked. */
export function scoreOf(card: Scorecard, tally: Tally): { total: number; disqualified: boolean } {
  let total = 0, disqualified = false;
  for (const it of card.items) {
    const v = tally[it.id];
    const sign = it.group === "PENALTY" ? -1 : 1;
    if (it.kind === "CHOICE") {
      const opt = it.options.find(o => o.id === v);
      if (opt) total += sign * opt.points;
    } else if (typeof v === "number" && v > 0) {
      if (it.disqualify) disqualified = true;
      total += sign * it.points * v;
    }
  }
  return { total: Math.round(total * 100) / 100, disqualified };
}

/** Best first: not disqualified, then higher total. Equal = a tie only a person can settle. */
export const compareScores = (a: { total: number; disqualified: boolean }, b: { total: number; disqualified: boolean }) =>
  Number(a.disqualified) - Number(b.disqualified) || b.total - a.total;

/**
 * Ranks that agree with the scores: no team placed below one it outscored.
 * `ranks` (team → rank) may settle ties either way; a league draw (both 1) needs equal scores.
 */
export function ranksMatchScores(scores: Record<string, { total: number; disqualified: boolean }>, ranks: Record<string, number>): boolean {
  const ids = Object.keys(scores);
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    if (compareScores(scores[a], scores[b]) < 0 && ranks[a] >= ranks[b]) return false;
  }
  return true;
}

/** Most a team can earn (CHOICE: best option; COUNT: points × max, unlimited counted once). */
export function maxGain(card: Scorecard): number {
  return card.items.filter(i => i.group === "GAIN")
    .reduce((a, i) => a + (i.kind === "CHOICE" ? Math.max(0, ...i.options.map(o => o.points)) : i.points * (i.max || 1)), 0);
}

export const newScoreItem = (group: ScoreItem["group"], kind: ScoreItem["kind"]): ScoreItem => ({
  id: rid(), group, kind, label: "", points: kind === "COUNT" ? (group === "GAIN" ? 1 : 1) : 0, max: 0,
  options: kind === "CHOICE" ? [{ id: rid(), label: "", points: 0 }, { id: rid(), label: "", points: 0 }] : [], disqualify: false,
});
export const newScoreOption = (): ScoreOption => ({ id: rid(), label: "", points: 0 });
