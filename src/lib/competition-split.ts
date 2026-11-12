// Competition splits: one competition judged as several labelled event
// competitions ("4.2R Cabaran Kereta Roket — Kereta Terpantas"), each with its
// own judging setup, results and certificates, sharing the registered teams.
// The original row (parentId null) is the registration / integration anchor —
// registration, quizzes, LMS and score syncs only ever look at it. Client-safe.

/** "Cabaran Kereta Roket — Kereta Terpantas", or the name alone when not split. */
export function competitionTitle(name: string, splitLabel?: string | null): string {
  return splitLabel ? `${name} — ${splitLabel}` : name;
}

export const SPLIT_LABEL_MAX = 60;

/** A cleaned split label, or null when empty / too long. */
export function cleanSplitLabel(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s && s.length <= SPLIT_LABEL_MAX ? s : null;
}
