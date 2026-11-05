import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { asGameProvider } from "@/lib/game-provider";
import { parseVibeBlocksToken, vibeBlocksConfigured, vibeBlocksQueryResults } from "@/lib/vibeblocks";
import { droneChallengeMaxScore, droneChallengeScores, droneConfigured, deriveDroneUserId, parseDroneToken } from "@/lib/drone";
import { viblockChallengeMaxScore, viblockChallengeScores, viblockConfigured, viblockGetToken } from "@/lib/viblock";
import {
  scorePlatformLabel, scoreTemplateSpec, templateMismatch,
  type ScoreCriterionSpec, type ScorePlatform, type ScoreTemplateSpec,
} from "@/lib/walkin-score-template";

/**
 * Copying a walk-in competition's results from its game platform into walk-in
 * judging scores, so they appear in "Walk-in Penghakiman" like a judge's.
 *
 * Scores are stored per judging endpoint, so the sync writes through its own
 * endpoint on the platform's score template (label "Segerak <platform>"),
 * created on first use. Each run rewrites the stored values from the platform;
 * a registration with no finished result is left as it is.
 *
 * Final results only: VibeBlocks/TechTriathlon entries that are completed or
 * timed out; Drone/Viblock players' best completed run on the challenge.
 */

export const syncLabel = (p: ScorePlatform) => `Segerak ${scorePlatformLabel(p)}`;

/** The walk-in's scoring platform and its template spec, or why it has none. */
export async function resolveScorePlatform(eventId: string, wicId: string) {
  const wic = await db.eventWalkInCompetition.findFirst({
    where: { id: wicId, eventId },
    select: {
      id: true, judgingStatus: true,
      useVibeblocks: true, useViblockarena: true, useDronearena: true,
      vibeBlocksProvider: true, vibeBlocksRunDurationSec: true, viblockChallengeId: true,
      judgingTemplates: { select: { judgingTemplateId: true } },
    },
  });
  if (!wic) return { error: "NOT_FOUND", status: 404 } as const;
  const provider: ScorePlatform | null = wic.useVibeblocks ? asGameProvider(wic.vibeBlocksProvider)
    : wic.useDronearena ? "drone" : wic.useViblockarena ? "viblock" : null;
  if (!provider)
    return { error: "NO_SCORING_PLATFORM", status: 400, message: "Pertandingan ini tiada platform permainan. Pilih Viblock, Drone, VibeBlocks atau TechTriathlon dahulu." } as const;

  // Drone and Viblock challenges set their own max score (e.g. 115); read it
  // from the platform (viblockChallengeId holds the challenge id for both).
  let challengeMax: number | null = null;
  const ch = wic.viblockChallengeId;
  try {
    if (provider === "drone" && ch && droneConfigured()) challengeMax = await droneChallengeMaxScore(ch);
    if (provider === "viblock" && ch && viblockConfigured()) challengeMax = await viblockChallengeMaxScore(ch);
  } catch (e) {
    console.error(`[${provider}] max score lookup failed:`, e);
  }
  // VibeBlocks/TechTriathlon: the event's run length. Drone/Viblock runs have no set length.
  const spec = scoreTemplateSpec(provider, challengeMax);
  const neededTime = provider === "drone" || provider === "viblock" ? 0
    : (wic.vibeBlocksRunDurationSec ?? spec.criteria.find(c => c.type === "TIME")?.maxTime ?? 0);
  return { wic, provider, spec, neededTime };
}

type Resolved = Exclude<Awaited<ReturnType<typeof resolveScorePlatform>>, { error: string }>;

/** Assigned templates that can hold the platform's results, best first. */
export async function suitableAssignedTemplate(r: Resolved) {
  const ids = r.wic.judgingTemplates.map(t => t.judgingTemplateId);
  if (ids.length === 0) return null;
  const templates = await db.judgingTemplate.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, code: true,
      criterions: { select: { id: true, name: true, type: true, order: true, minScore: true, maxScore: true, maxTime: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  templates.sort((a, b) => Number(b.code.startsWith(r.spec.code)) - Number(a.code.startsWith(r.spec.code)));
  return templates.find(t => !templateMismatch(r.spec, t.criterions, r.neededTime)) ?? null;
}

/** Platform readiness for the sync (configured, linked to an event/challenge). */
export function platformReady(r: Resolved): string | null {
  const label = scorePlatformLabel(r.provider);
  if (r.provider === "drone" ? !droneConfigured() : r.provider === "viblock" ? !viblockConfigured() : !vibeBlocksConfigured(r.provider))
    return `${label} API tidak dikonfigurasi.`;
  if (!r.wic.viblockChallengeId)
    return r.provider === "drone" || r.provider === "viblock" ? `Challenge ${label} belum dipilih.` : `Acara ${label} belum dicipta.`;
  return null;
}

const ENDPOINT_SELECT = {
  id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true, completedAt: true,
  judgingTemplate: { select: { id: true, name: true, code: true } },
} as const;

/** The sync endpoint for the template (created on first use). */
export async function ensureSyncEndpoint(eventId: string, r: Resolved, templateId: string) {
  const label = syncLabel(r.provider);
  const found = await db.walkInJudgingEndpoint.findFirst({
    where: { walkInCompetitionId: r.wic.id, judgingTemplateId: templateId, label },
    select: ENDPOINT_SELECT,
  });
  if (found) return { endpoint: found, created: false };
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const code = (n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
  let routeSlug = code(10);
  while (await db.walkInJudgingEndpoint.findUnique({ where: { routeSlug } })) routeSlug = code(10);
  const endpoint = await db.walkInJudgingEndpoint.create({
    data: { eventId, walkInCompetitionId: r.wic.id, judgingTemplateId: templateId, routeSlug, passcode: String(randomInt(100000, 1000000)), label },
    select: ENDPOINT_SELECT,
  });
  return { endpoint, created: true };
}

type Values = Partial<Record<ScoreCriterionSpec["source"], number | null>>;
type Reg = { id: string; participantId: string; viblockToken: string | null };

/** Final results for these registrations, keyed by registration id. */
export async function fetchResults(r: Resolved, regs: Reg[]): Promise<Map<string, Values>> {
  const out = new Map<string, Values>();
  const ch = r.wic.viblockChallengeId!;

  if (r.provider === "vibeblocks" || r.provider === "techtriathlon") {
    const byEntry = new Map<string, string>();
    for (const reg of regs) {
      const t = reg.viblockToken ? parseVibeBlocksToken(reg.viblockToken) : null;
      if (t) byEntry.set(t.entryId, reg.id);
    }
    if (byEntry.size === 0) return out;
    const res = await vibeBlocksQueryResults(ch, [...byEntry.keys()], r.provider);
    for (const e of res.results) {
      const regId = byEntry.get(e.entry_id);
      if (!regId || (e.status !== "completed" && e.status !== "timed_out")) continue;
      out.set(regId, {
        completed_stage_count: e.completed_stage_count,
        official_elapsed_ms: e.official_elapsed_ms,
        score: e.score ?? null,
      });
    }
    return out;
  }

  if (r.provider === "drone") {
    const players = await droneChallengeScores(ch);
    const byUser = new Map(players.filter(p => p.userid).map(p => [p.userid!.toLowerCase(), p]));
    for (const reg of regs) {
      const uid = (reg.viblockToken ? parseDroneToken(reg.viblockToken)?.userid : null) ?? deriveDroneUserId(reg.participantId);
      const c = byUser.get(uid.toLowerCase())?.challenges.find(x => x.challenge_id === ch);
      if (c && c.best_score != null) out.set(reg.id, { best_score: c.best_score, elapsed_seconds: c.elapsed_seconds });
    }
    return out;
  }

  // Viblock: the competition token says which player (user_id) it belongs to.
  const players = await viblockChallengeScores(ch);
  const byUser = new Map(players.map(p => [p.user_id, p]));
  const withToken = regs.filter(reg => reg.viblockToken);
  for (let i = 0; i < withToken.length; i += 5) {
    await Promise.all(withToken.slice(i, i + 5).map(async reg => {
      try {
        const info = await viblockGetToken(reg.viblockToken!);
        const c = byUser.get(info.user_id)?.challenges.find(x => x.challenge_id === ch);
        if (c && c.best_score != null) out.set(reg.id, { best_score: c.best_score, best_elapsed_seconds: c.best_elapsed_seconds });
      } catch { /* token unknown to Viblock — no result */ }
    }));
  }
  return out;
}

/** A spec value as stored: NUMBER → score, TIME → whole seconds. */
export function toScore(c: ScoreCriterionSpec, v: Values) {
  const raw = v[c.source];
  if (raw == null) return null;
  if (c.type === "TIME") {
    const sec = c.source === "official_elapsed_ms" ? raw / 1000 : raw;
    return { score: null, timeSeconds: Math.round(sec) };
  }
  return { score: raw, timeSeconds: null };
}

export const SYNC_BATCH = 100;

/**
 * Syncs one batch of CONFIRMED registrations (ordered by id) from `offset`.
 * The caller repeats while `nextOffset` is not null.
 */
export async function syncBatch(
  r: Resolved, spec: ScoreTemplateSpec, endpointId: string,
  template: { criterions: { id: string; order: number }[] }, offset: number,
) {
  const where = { walkInCompetitionId: r.wic.id, status: "CONFIRMED" as const };
  const [total, regs] = await Promise.all([
    db.walkInRegistration.count({ where }),
    db.walkInRegistration.findMany({
      where, orderBy: { id: "asc" }, skip: offset, take: SYNC_BATCH,
      select: { id: true, participantId: true, viblockToken: true },
    }),
  ]);
  const results = await fetchResults(r, regs);
  const criteria = [...template.criterions].sort((a, b) => a.order - b.order);

  let saved = 0;
  const writes = [];
  for (const reg of regs) {
    const v = results.get(reg.id);
    if (!v) continue;
    saved++;
    for (let i = 0; i < spec.criteria.length; i++) {
      const val = toScore(spec.criteria[i], v);
      if (!val) continue;
      const key = { walkInJudgingEndpointId: endpointId, walkInRegistrationId: reg.id, criterionId: criteria[i].id };
      writes.push(db.walkInJudgingScore.upsert({
        where: { walkInJudgingEndpointId_walkInRegistrationId_criterionId: key },
        create: { ...key, ...val },
        update: val,
      }));
    }
  }
  if (writes.length) await db.$transaction(writes);
  const processed = offset + regs.length;
  return {
    total, processed, saved, noResult: regs.length - saved,
    nextOffset: regs.length === SYNC_BATCH && processed < total ? processed : null,
  };
}
