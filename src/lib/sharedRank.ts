/**
 * How a shared rank affects the ranks after it (Penghakiman → Tetapan global,
 * stored per event as `Event.sharedRankMode`):
 *   SKIP  — standard competition ranking: 1, 2, 2, 4, 5
 *   DENSE — continuous ranking:           1, 2, 2, 3, 4
 */
export type SharedRankMode = "SKIP" | "DENSE";
export const SHARED_RANK_MODES: SharedRankMode[] = ["SKIP", "DENSE"];
export const DEFAULT_SHARED_RANK_MODE: SharedRankMode = "SKIP";

export function parseSharedRankMode(v: unknown): SharedRankMode {
  return v === "DENSE" ? "DENSE" : "SKIP";
}

/**
 * Ranks entries that are already in ranking order under `compare`. Entries that
 * compare equal (same total score and same best time, or both without a time)
 * share a rank; `mode` decides whether the next rank skips the shared places.
 *
 * Optional `group` ranks 1..n within each group (state, country, …) in one pass.
 * Client-safe.
 */
export function withSharedRanks<T>(
  sorted: T[],
  compare: (a: T, b: T) => number,
  mode: SharedRankMode = DEFAULT_SHARED_RANK_MODE,
  group?: (r: T) => string,
): (T & { rank: number })[] {
  const last = new Map<string, { entry: T; rank: number; count: number }>();
  return sorted.map(entry => {
    const k = group ? group(entry) : "";
    const prev = last.get(k);
    const count = (prev?.count ?? 0) + 1;
    const rank = !prev ? 1
      : compare(prev.entry, entry) === 0 ? prev.rank
      : mode === "DENSE" ? prev.rank + 1 : count;
    last.set(k, { entry, rank, count });
    return { ...entry, rank };
  });
}

/**
 * Higher total first; ties go to the best (lowest) time, no time last.
 * Entries that carry an `order` (a duel's final position, decided by its own
 * tie-breaks) are compared by it instead: lower first, equal = shared rank.
 */
export function compareScoreTime(
  a: { totalScore: number; bestTime: number | null; order?: number | null },
  b: { totalScore: number; bestTime: number | null; order?: number | null },
): number {
  if (a.order != null && b.order != null) return a.order - b.order;
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  if (a.bestTime === null && b.bestTime === null) return 0;
  if (a.bestTime === null) return 1;
  if (b.bestTime === null) return -1;
  return a.bestTime - b.bestTime;
}
