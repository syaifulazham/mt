import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { VB_EVENT_ID_RE, vibeBlocksConfigured, vibeBlocksGetEvent, vibeBlocksLeaderboard, type VibeBlocksError } from "@/lib/vibeblocks";
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

/**
 * The board for a walk-in competition's VibeBlocks event, or — with
 * `eventIdOverride` — any other VibeBlocks event (an event_id from the partner
 * app). Names are matched across every walk-in registration, so entries
 * registered through mt show their participant whichever event they are in.
 */
export async function loadScoreboard(walkInCompetitionId: string, eventIdOverride?: string | null): Promise<ScoreboardData> {
  const key = `${walkInCompetitionId}|${eventIdOverride ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: walkInCompetitionId },
    select: {
      useVibeblocks: true, vibeBlocksProvider: true, viblockChallengeId: true, vibeBlocksEventName: true,
      vibeBlocksCompetitionRound: true, vibeBlocksSchoolLevel: true,
      competition: { select: { code: true, name: true } },
    },
  });
  if (!wic?.useVibeblocks || asGameProvider(wic.vibeBlocksProvider) !== "vibeblocks")
    throw new ScoreboardUnavailable("Papan skor hanya untuk pertandingan VibeBlocks.");
  const eventId = eventIdOverride || wic.viblockChallengeId;
  if (!eventId) throw new ScoreboardUnavailable("Acara VibeBlocks belum dicipta.");
  if (!vibeBlocksConfigured("vibeblocks")) throw new ScoreboardUnavailable("VibeBlocks API tidak dikonfigurasi.");

  let board: Awaited<ReturnType<typeof vibeBlocksLeaderboard>>;
  let ev: Awaited<ReturnType<typeof vibeBlocksGetEvent>>;
  try {
    [board, ev] = await Promise.all([
      vibeBlocksLeaderboard(eventId),
      vibeBlocksGetEvent(eventId).catch(() => null),
    ]);
  } catch (e) {
    if (isVibeBlocksError(e) && e.status === 404) throw new ScoreboardUnavailable(`Acara VibeBlocks "${eventId}" tidak dijumpai.`);
    throw e;
  }

  // Registrations behind these entries: by entry_id (stored as "TOKEN:entry_id"), else partner_reference (the registration id).
  const shown = board.rankings.filter((r) => r.is_used || r.status !== "ready");
  const entryIds = shown.map((r) => r.entry_id);
  const refs = shown.map((r) => r.partner_reference).filter((x): x is string => !!x);
  const byEntryRows = entryIds.length
    ? await db.$queryRaw<{ id: string; entryId: string }[]>`
        SELECT id, split_part("viblockToken", ':', 2) AS "entryId" FROM walkin_registrations
        WHERE "viblockToken" IS NOT NULL AND split_part("viblockToken", ':', 2) = ANY(${entryIds})`
    : [];
  const regIds = [...new Set([...byEntryRows.map((r) => r.id), ...refs])];
  const regs = regIds.length ? await db.walkInRegistration.findMany({
    where: { id: { in: regIds } },
    select: {
      id: true,
      participant: { select: { name: true } },
      team:        { select: { name: true } },
      contingent:  { select: { name: true, shortName: true } },
    },
  }) : [];
  const byReg = new Map(regs.map((r) => [r.id, r]));
  const byEntry = new Map(byEntryRows.map((r) => [r.entryId, byReg.get(r.id)]));

  const round = (ev?.competition_round ?? (eventIdOverride ? null : wic.vibeBlocksCompetitionRound)) === "final" ? "final" : "qualifier";
  const levelRaw = ev ? ev.school_level : (eventIdOverride ? null : wic.vibeBlocksSchoolLevel);
  const totalStages = vibeBlocksStages(round, isGameSchoolLevel(levelRaw) ? levelRaw : null);

  const rows: ScoreboardRow[] = shown.map((r) => {
    const reg = byEntry.get(r.entry_id) ?? (r.partner_reference ? byReg.get(r.partner_reference) : undefined);
    const stages = r.completed_stage_count ?? 0;
    return {
      rank: r.rank,
      // Entries registered outside mt carry no name: show their partner reference.
      name: reg?.team?.name ?? reg?.participant.name ?? r.partner_reference ?? "—",
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
    eventName: ev?.name ?? (eventIdOverride ? eventId : wic.vibeBlocksEventName ?? eventId),
    status, rows, totalEntries: board.total_count, updatedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

export const isVibeBlocksError = (e: unknown): e is VibeBlocksError => e instanceof Error && "status" in e;

/**
 * A scoreboard's VibeBlocks event override from a request: undefined = not
 * given, null = cleared (the competition's own event), else an event_id that
 * exists on VibeBlocks. Returns an error message for an unusable value.
 */
export async function parseEventOverride(raw: unknown): Promise<{ value: string | null | undefined } | { error: string }> {
  if (raw === undefined) return { value: undefined };
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return { value: null };
  if (!VB_EVENT_ID_RE.test(id)) return { error: "Event ID VibeBlocks hanya huruf, nombor, _ atau - (maks. 64)." };
  try {
    if (!(await vibeBlocksGetEvent(id))) return { error: `Acara "${id}" tidak dijumpai di VibeBlocks.` };
  } catch {
    return { error: "Tidak dapat menyemak acara di VibeBlocks sekarang. Cuba lagi." };
  }
  return { value: id };
}
