/**
 * Standard competition ranking ("1, 2, 2, 4"): entries that compare equal —
 * same total score and same best time (or both without a time) — share a rank,
 * and the next entry's rank skips the shared places.
 *
 * `sorted` must already be in ranking order under `compare`. Client-safe.
 */
export function withSharedRanks<T>(
  sorted: T[],
  compare: (a: T, b: T) => number,
): (T & { rank: number })[] {
  const out: (T & { rank: number })[] = [];
  sorted.forEach((entry, i) => {
    const rank = i > 0 && compare(sorted[i - 1], entry) === 0 ? out[i - 1].rank : i + 1;
    out.push({ ...entry, rank });
  });
  return out;
}

/** Higher total first; ties go to the best (lowest) time, no time last. */
export function compareScoreTime(
  a: { totalScore: number; bestTime: number | null },
  b: { totalScore: number; bestTime: number | null },
): number {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  if (a.bestTime === null && b.bestTime === null) return 0;
  if (a.bestTime === null) return 1;
  if (b.bestTime === null) return -1;
  return a.bestTime - b.bestTime;
}
