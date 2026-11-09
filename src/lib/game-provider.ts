/**
 * Walk-in game platforms that share the partner-API shape implemented in
 * src/lib/vibeblocks.ts (events, 8-character entry codes, entry_id,
 * results:query). Stored per walk-in competition as `vibeBlocksProvider`.
 * Client-safe: rules only, no secrets.
 */

export type GameProvider = "vibeblocks" | "techtriathlon";

export const GAME_PROVIDERS: Record<GameProvider, {
  label: string;
  /** event_id rule. */
  eventIdRe: RegExp;
  /** Separator for recreated / de-duplicated event ids (`<slug><sep><n>`). */
  idSep: string;
  runMin: number; runMax: number; runDefault: number;
  nameMax: number;
  /** Max entry_ids per results:query. */
  maxResultIds: number;
  /** How finished entries are ordered. */
  rankBy: "stages" | "score";
  /** Locks starts_at/ends_at once an entry is registered. */
  timingLocksAfterEntry: boolean;
  /** A closed event can be opened again. */
  canReopen: boolean;
  /**
   * Events carry a school level (primary / secondary), required on create and
   * locked once an entry is registered (VibeBlocks API 1.8, 9 Nov 2026).
   */
  schoolLevel: boolean;
  /** Fallback when the challenge list cannot be fetched. */
  defaultChallenge: { id: string; name: string; challenge_mode: string };
}> = {
  vibeblocks: {
    label: "VibeBlocks",
    eventIdRe: /^[A-Za-z0-9_-]{1,64}$/,
    idSep: "_",
    runMin: 60, runMax: 3600, runDefault: 900,
    nameMax: 120,
    maxResultIds: 5000,
    rankBy: "stages",
    timingLocksAfterEntry: true,
    canReopen: false,
    schoolLevel: true,
    defaultChallenge: { id: "machine-driving-five-stage", name: "Machine Driving – Five Stage Challenge", challenge_mode: "ranked" },
  },
  techtriathlon: {
    label: "TechTriathlon",
    eventIdRe: /^[a-z0-9-]{1,64}$/,
    idSep: "-",
    runMin: 60, runMax: 86400, runDefault: 2700,
    nameMax: 200,
    maxResultIds: 500,
    rankBy: "score",
    timingLocksAfterEntry: false,
    canReopen: true,
    schoolLevel: false,
    defaultChallenge: { id: "ch_techtriathlon", name: "TechTriathlon", challenge_mode: "score" },
  },
};

export function asGameProvider(v: unknown): GameProvider {
  return v === "techtriathlon" ? "techtriathlon" : "vibeblocks";
}

export const gameLabel = (p: unknown) => GAME_PROVIDERS[asGameProvider(p)].label;

export type GameSchoolLevel = "primary" | "secondary";

export const isGameSchoolLevel = (v: unknown): v is GameSchoolLevel => v === "primary" || v === "secondary";

/** Stages a VibeBlocks run plays: qualifier C1; final C1–C3 primary, C1–C4 secondary, C1–C5 legacy (no level). */
export function vibeBlocksStages(round: "qualifier" | "final", level: GameSchoolLevel | null): number {
  if (round === "qualifier") return 1;
  return level === "primary" ? 3 : level === "secondary" ? 4 : 5;
}

/**
 * The school level a competition's target groups point to: primary when they
 * are all PRIMARY, secondary when all SECONDARY, otherwise null (mixed or other
 * levels — the organizer must choose, or split the competition).
 */
export function schoolLevelFromTargetGroups(levels: string[]): GameSchoolLevel | null {
  const set = new Set(levels.map((l) => l.toUpperCase()));
  if (set.size !== 1) return null;
  return set.has("PRIMARY") ? "primary" : set.has("SECONDARY") ? "secondary" : null;
}
