import type { CriterionType } from "@prisma/client";
import { GAME_PROVIDERS, type GameProvider } from "@/lib/game-provider";

/**
 * The judging template that can hold a walk-in game platform's results.
 * VibeBlocks reports completed stages (of 5) and official elapsed time;
 * TechTriathlon adds a score out of 100 (stages of 3); Eptim Drone reports the
 * player's best score (of 100) and its elapsed time on the walk-in's challenge
 * (GET /scores, EPTIM-DRONE-API-GUIDE.md §26–27); Viblock Arena the same
 * (GET /scores, VIBLOCK-ARENA-API-GUIDELINE.md §4.6). Rank is derived from
 * these, so it is not stored.
 *
 * A template is suitable when it has exactly these criteria, in order, with
 * the same names (case/space-insensitive) and types, and ranges wide enough
 * for the values. A created template uses the platform's longest run as its
 * time limit, so one template serves every event of that platform.
 */

export type ScoreCriterionSpec = {
  name: string; type: CriterionType;
  minScore?: number; maxScore?: number;
  /** TIME: seconds the criterion must allow. */
  maxTime?: number;
  /** Where the value comes from in the platform's results. */
  source: "completed_stage_count" | "official_elapsed_ms" | "score" | "best_score" | "elapsed_seconds" | "best_elapsed_seconds";
};

/** Platforms whose results a template can hold. */
export type ScorePlatform = GameProvider | "drone" | "viblock";

export type ScoreTemplateSpec = {
  provider: ScorePlatform; code: string; name: string; description: string;
  criteria: ScoreCriterionSpec[];
};

export const scorePlatformLabel = (p: ScorePlatform) =>
  p === "drone" ? "Eptim Drone" : p === "viblock" ? "Viblock Arena" : GAME_PROVIDERS[p].label;

/**
 * `challengeMaxScore` (Drone, Viblock): the walk-in challenge's max_score from
 * the platform API (challenges differ, e.g. 115); 100 when it cannot be read yet.
 */
export function scoreTemplateSpec(provider: ScorePlatform, challengeMaxScore?: number | null): ScoreTemplateSpec {
  if (provider === "viblock") {
    const max = challengeMaxScore ?? 100;
    return {
      provider, code: "WALKIN-VIBLOCK", name: `Viblock Arena — Skor Walk-in (/${max})`,
      description: `Skor terbaik Viblock Arena pada challenge walk-in: skor /${max} dan masa larian terbaik. Kedudukan: skor tertinggi, kemudian masa terpendek.`,
      criteria: [
        { name: "Skor", type: "NUMBER", minScore: 0, maxScore: max, source: "best_score" },
        { name: "Masa Rasmi", type: "TIME", maxTime: 3600, source: "best_elapsed_seconds" },
      ],
    };
  }
  if (provider === "drone") {
    const max = challengeMaxScore ?? 100;
    return {
      provider, code: "WALKIN-DRONE", name: `Eptim Drone — Skor Walk-in (/${max})`,
      description: `Skor terbaik Eptim Drone pada challenge walk-in: skor /${max} dan masa larian terbaik. Kedudukan: skor tertinggi, kemudian masa terpendek.`,
      criteria: [
        { name: "Skor", type: "NUMBER", minScore: 0, maxScore: max, source: "best_score" },
        { name: "Masa Rasmi", type: "TIME", maxTime: 3600, source: "elapsed_seconds" },
      ],
    };
  }
  const label = GAME_PROVIDERS[provider].label;
  const runMax = GAME_PROVIDERS[provider].runMax;
  const time: ScoreCriterionSpec = { name: "Masa Rasmi", type: "TIME", maxTime: runMax, source: "official_elapsed_ms" };
  return provider === "techtriathlon"
    ? {
        provider, code: "WALKIN-TECHTRIATHLON", name: `${label} — Skor Walk-in`,
        description: "Skor larian TechTriathlon: jumlah skor /100 (Fruit Catcher, Brick Bridge, Maze), peringkat selesai dan masa rasmi. Kedudukan: skor tertinggi, kemudian masa terpendek.",
        criteria: [
          { name: "Skor", type: "NUMBER", minScore: 0, maxScore: 100, source: "score" },
          { name: "Peringkat Selesai", type: "NUMBER", minScore: 0, maxScore: 3, source: "completed_stage_count" },
          time,
        ],
      }
    : {
        provider, code: "WALKIN-VIBEBLOCKS", name: `${label} — Skor Walk-in`,
        description: "Skor larian VibeBlocks Machine Driving: peringkat selesai (/5) dan masa rasmi. Kedudukan: peringkat terbanyak, kemudian masa terpendek.",
        criteria: [
          { name: "Peringkat Selesai", type: "NUMBER", minScore: 0, maxScore: 5, source: "completed_stage_count" },
          time,
        ],
      };
}

type TemplateCriterion = {
  name: string; type: CriterionType; order: number;
  minScore: number | null; maxScore: number | null; maxTime: number | null;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Why a template cannot hold the spec's data, or null when it can. */
export function templateMismatch(spec: ScoreTemplateSpec, criteria: TemplateCriterion[], neededTime: number): string | null {
  const sorted = [...criteria].sort((a, b) => a.order - b.order);
  if (sorted.length !== spec.criteria.length) return `${sorted.length} kriteria (perlu ${spec.criteria.length})`;
  for (let i = 0; i < spec.criteria.length; i++) {
    const want = spec.criteria[i], got = sorted[i];
    if (norm(got.name) !== norm(want.name) || got.type !== want.type) return `kriteria ${i + 1} bukan "${want.name}" (${want.type})`;
    if (want.type === "NUMBER") {
      if (got.minScore != null && want.minScore != null && got.minScore > want.minScore) return `"${want.name}" bermula pada ${got.minScore}`;
      if (got.maxScore != null && want.maxScore != null && got.maxScore < want.maxScore) return `"${want.name}" maksimum ${got.maxScore} (perlu ${want.maxScore})`;
    }
    if (want.type === "TIME" && got.maxTime != null && got.maxTime < neededTime) return `"${want.name}" had masa ${got.maxTime}s (perlu ${neededTime}s)`;
  }
  return null;
}
