import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { vibeBlocksConfigured, vibeBlocksGetEvent, vibeBlocksLeaderboard, parseVibeBlocksToken, type VibeBlocksError } from "@/lib/vibeblocks";
import { asGameProvider, isGameSchoolLevel, vibeBlocksStages } from "@/lib/game-provider";

// Public live scoreboard of a VibeBlocks walk-in competition (/live/<slug>).
// Rows come from VibeBlocks' event-wide leaderboard, in its own order (more
// completed stages, then lower penalty-inclusive time); names come from the
// walk-in registrations, matched by entry_id, else partner_reference (the
// registration id). Only entries that have started are shown.

const PASS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");

export const genScoreboardPasscode = () => pick(PASS_CHARS, 6);
export async function genScoreboardSlug() {
  for (;;) {
    const slug = pick(SLUG_CHARS, 8);
    if (!(await db.walkInScoreboardEndpoint.findUnique({ where: { routeSlug: slug }, select: { id: true } }))) return slug;
  }
}

/** Organizer-chosen passcodes: 4–32 letters and digits, stored upper-case. */
export const SCOREBOARD_PASSCODE_RE = /^[A-Za-z0-9]{4,32}$/;

export type ScoreboardRow = {
  rank: number | null;
  name: string;
  contingent: string | null;
  status: "ready" | "in_progress" | "completed" | "timed_out";
  completedStages: number;
  totalStages: number;
  /** 0–100, completed / configured stages. */
  progress: number;
  collisions: number | null;
  elapsedMs: number | null;
  penaltyMs: number | null;
  totalMs: number | null;
};

export type ScoreboardData = {
  competition: { code: string; name: string };
  eventName: string;
  /** LIVE while the VibeBlocks event is open and inside its window. */
  status: "LIVE" | "UPCOMING" | "ENDED" | "CLOSED" | "UNKNOWN";
  rows: ScoreboardRow[];
  totalEntries: number;
  updatedAt: string;
};

// Many screens may show one board: one VibeBlocks call per competition per few seconds.
const CACHE_MS = 5_000;
const cache = (globalThis as { __vbBoardCache?: Map<string, { at: number; data: ScoreboardData }> }).__vbBoardCache ??= new Map();

export class ScoreboardUnavailable extends Error {}

export async function loadScoreboard(walkInCompetitionId: string): Promise<ScoreboardData> {
  const hit = cache.get(walkInCompetitionId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: walkInCompetitionId },
    select: {
      useVibeblocks: true, vibeBlocksProvider: true, viblockChallengeId: true, vibeBlocksEventName: true,
      vibeBlocksCompetitionRound: true, vibeBlocksSchoolLevel: true,
      competition: { select: { code: true, name: true } },
      registrations: {
        where: { viblockToken: { not: null } },
        select: {
          id: true, viblockToken: true,
          participant: { select: { name: true } },
          team:        { select: { name: true } },
          contingent:  { select: { name: true, shortName: true } },
        },
      },
    },
  });
  if (!wic?.useVibeblocks || asGameProvider(wic.vibeBlocksProvider) !== "vibeblocks")
    throw new ScoreboardUnavailable("Papan skor hanya untuk pertandingan VibeBlocks.");
  if (!wic.viblockChallengeId) throw new ScoreboardUnavailable("Acara VibeBlocks belum dicipta.");
  if (!vibeBlocksConfigured("vibeblocks")) throw new ScoreboardUnavailable("VibeBlocks API tidak dikonfigurasi.");

  const [board, ev] = await Promise.all([
    vibeBlocksLeaderboard(wic.viblockChallengeId),
    vibeBlocksGetEvent(wic.viblockChallengeId).catch(() => null),
  ]);

  const byEntry = new Map<string, (typeof wic.registrations)[number]>();
  const byReg = new Map(wic.registrations.map((r) => [r.id, r]));
  for (const r of wic.registrations) {
    const parsed = r.viblockToken ? parseVibeBlocksToken(r.viblockToken) : null;
    if (parsed) byEntry.set(parsed.entryId, r);
  }

  const round = (ev?.competition_round ?? wic.vibeBlocksCompetitionRound) === "final" ? "final" : "qualifier";
  const levelRaw = ev ? ev.school_level : wic.vibeBlocksSchoolLevel;
  const totalStages = vibeBlocksStages(round, isGameSchoolLevel(levelRaw) ? levelRaw : null);

  const rows: ScoreboardRow[] = board.rankings
    // Unused codes haven't started: nothing to show yet.
    .filter((r) => r.is_used || r.status !== "ready")
    .map((r) => {
      const reg = byEntry.get(r.entry_id) ?? (r.partner_reference ? byReg.get(r.partner_reference) : undefined);
      const stages = r.completed_stage_count ?? 0;
      return {
        rank: r.rank,
        name: reg?.team?.name ?? reg?.participant.name ?? "—",
        contingent: reg ? (reg.contingent.shortName || reg.contingent.name) : null,
        status: r.status,
        completedStages: stages,
        totalStages,
        progress: Math.min(100, Math.round((stages / totalStages) * 100)),
        collisions: r.collision_count ?? null,
        elapsedMs: r.official_elapsed_ms,
        penaltyMs: r.penalty_ms ?? null,
        // ranked_elapsed_ms already includes the penalty.
        totalMs: r.ranked_elapsed_ms ?? r.official_elapsed_ms,
      };
    });

  const now = Date.now();
  const status: ScoreboardData["status"] = !ev ? "UNKNOWN"
    : ev.status === "closed" ? "CLOSED"
    : now < Date.parse(ev.starts_at) ? "UPCOMING"
    : now > Date.parse(ev.ends_at) ? "ENDED"
    : ev.status === "open" ? "LIVE" : "UPCOMING";

  const data: ScoreboardData = {
    competition: wic.competition,
    eventName: ev?.name ?? wic.vibeBlocksEventName ?? wic.viblockChallengeId,
    status, rows, totalEntries: board.total_count, updatedAt: new Date().toISOString(),
  };
  cache.set(walkInCompetitionId, { at: Date.now(), data });
  return data;
}

export const isVibeBlocksError = (e: unknown): e is VibeBlocksError => e instanceof Error && "status" in e;
