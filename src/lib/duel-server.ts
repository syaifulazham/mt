import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { duelStandings, parseDuelConfig, remainingMs, type DrawTeam } from "@/lib/duel";
import { isStreamLive } from "@/lib/cf-stream";

/** Draw, confirm, reopen and config. */
export const DUEL_CONFIG_ROLES = ["SUPER_ADMIN", "ADMIN"];
/** Arena control and ranks — arena marshals too. */
export const DUEL_CONTROL_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

type StateRef = { id: string; name: string; flagUrl: string | null } | null;

const TEAM_SELECT = {
  id: true, name: true,
  contingent: {
    select: {
      id: true, name: true, shortName: true, logoUrl: true,
      state: { select: { id: true, name: true, flagUrl: true } },
      school: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
      higherInstitution: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
      country: { select: { codeIso2: true } },
    },
  },
} as const;

type TeamRow = {
  id: string; name: string;
  contingent: {
    id: string; name: string; shortName: string | null; logoUrl: string | null;
    state: StateRef; school: { state: StateRef } | null; higherInstitution: { state: StateRef } | null;
    country: { codeIso2: string | null } | null;
  };
};

export type DuelTeam = {
  id: string; name: string;
  contingentId: string; contingentName: string; logoUrl: string | null;
  stateId: string | null; stateName: string | null; flagUrl: string | null; countryIso2: string | null;
};

function teamDto(t: TeamRow): DuelTeam {
  const c = t.contingent;
  const st = c.state ?? c.school?.state ?? c.higherInstitution?.state ?? null;
  return {
    id: t.id, name: t.name,
    contingentId: c.id, contingentName: c.shortName || c.name, logoUrl: c.logoUrl,
    stateId: st?.id ?? null, stateName: st?.name ?? null, flagUrl: st?.flagUrl ?? null,
    countryIso2: c.country?.codeIso2 ?? null,
  };
}

export const asDrawTeam = (t: DuelTeam): DrawTeam => ({ id: t.id, contingentId: t.contingentId, stateId: t.stateId });

export async function loadDuelEc(eventId: string, ecId: string) {
  return db.eventCompetition.findFirst({
    where: { id: ecId, eventId },
    select: {
      id: true, eventId: true, competitionId: true, judgingMethod: true, duelConfig: true,
      resultScope: true, configLockedAt: true,
      competition: { select: { name: true, code: true, participationType: true } },
      event: { select: { name: true, slug: true, scope: true } },
    },
  });
}

/** Teams that attended the event for this competition — the draw pool. */
export async function duelPool(eventId: string, competitionId: string): Promise<DuelTeam[]> {
  const teams = await db.team.findMany({
    where: {
      competitionId, status: "ACTIVE",
      teamEvents: {
        some: { eventId, OR: [{ attendedAt: { not: null } }, { participantAttendance: { some: {} } }] },
      },
    },
    select: TEAM_SELECT,
    orderBy: { name: "asc" },
  });
  return teams.map(teamDto);
}

/** Every round of the competition with sessions, entries and team details. */
export async function loadRounds(ecId: string) {
  const rounds = await db.duelRound.findMany({
    where: { eventCompetitionId: ecId },
    orderBy: [{ groupKey: "asc" }, { number: "asc" }],
    include: {
      sessions: {
        orderBy: { number: "asc" },
        include: { entries: { orderBy: [{ slot: "asc" }], include: { team: { select: TEAM_SELECT } } } },
      },
    },
  });
  return rounds.map(r => ({
    id: r.id, groupKey: r.groupKey, number: r.number, isFinal: r.isFinal, status: r.status, split: r.split,
    noSameContingent: r.noSameContingent, noSameState: r.noSameState,
    startAt: r.startAt, confirmedAt: r.confirmedAt,
    sessions: r.sessions.map(s => ({
      id: s.id, number: s.number, label: s.label, arena: s.arena, wave: s.wave,
      scheduledAt: s.scheduledAt, status: s.status,
      startedAt: s.startedAt, pausedAt: s.pausedAt, pausedMs: s.pausedMs, endedAt: s.endedAt,
      // Never the publish URL (a secret for the media team's camera).
      video: isStreamLive(s) ? s.streamPlaybackUrl : null,
      replayUrl: s.replayStatus === "READY" ? s.replayUrl : null,
      entries: s.entries.map(e => ({
        id: e.id, teamId: e.teamId, slot: e.slot, rank: e.rank, points: e.points, advanced: e.advanced,
        team: teamDto(e.team as TeamRow),
      })),
    })),
  }));
}

export type DuelRoundDto = Awaited<ReturnType<typeof loadRounds>>[number];
export type DuelSessionDto = DuelRoundDto["sessions"][number];

/** Session as shown on boards: with the clock's remaining milliseconds. */
export function withClock(s: DuelSessionDto, durationSec: number, now: number) {
  return { ...s, remainingMs: remainingMs(s, durationSec, now) };
}

/** The bracket a team belongs to: its state under STATE scope, "" otherwise. */
export const groupKeyOf = (scope: string, t: { stateId: string | null }) => (scope === "STATE" ? t.stateId ?? "" : "");

export type DuelGroup = { key: string; name: string | null; flagUrl: string | null; poolCount: number };

/**
 * Brackets of a competition: one national ("" key, no name), or one per state
 * that has attended teams or drawn rounds. Teams with no state form "Tiada negeri".
 */
export function duelGroups(scope: string, pool: DuelTeam[], rounds: DuelRoundDto[]): DuelGroup[] {
  if (scope !== "STATE") return [{ key: "", name: null, flagUrl: null, poolCount: pool.length }];
  const map = new Map<string, DuelGroup>();
  const add = (t: DuelTeam, inPool: boolean) => {
    const key = t.stateId ?? "";
    const g = map.get(key) ?? { key, name: t.stateName ?? "Tiada negeri", flagUrl: t.flagUrl, poolCount: 0 };
    if (inPool) g.poolCount++;
    map.set(key, g);
  };
  pool.forEach(t => add(t, true));
  for (const r of rounds) for (const s of r.sessions) for (const e of s.entries) if (!map.has(r.groupKey)) add(e.team, false);
  return [...map.values()].sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : (a.name ?? "").localeCompare(b.name ?? "")));
}

/** Standings with team details, from loaded rounds (one bracket). */
export function standingsOf(rounds: DuelRoundDto[]) {
  const teams = new Map<string, DuelTeam>();
  for (const r of rounds) for (const s of r.sessions) for (const e of s.entries) teams.set(e.teamId, e.team);
  return duelStandings(rounds).map(s => ({ ...s, team: teams.get(s.teamId)! }));
}

/** Standings per bracket, keyed by group key. */
export function standingsByGroup(rounds: DuelRoundDto[]) {
  const keys = [...new Set(rounds.map(r => r.groupKey))];
  return Object.fromEntries(keys.map(k => [k, standingsOf(rounds.filter(r => r.groupKey === k))]));
}

/** Overall phase of a duel competition, for cards (summed over state brackets). */
export function duelPhase(rounds: DuelRoundDto[]) {
  const keys = [...new Set(rounds.map(r => r.groupKey))];
  if (keys.length > 1 || (keys.length === 1 && keys[0] !== "")) {
    const phases = keys.map(k => bracketPhase(rounds.filter(r => r.groupKey === k)));
    const finished = phases.filter(p => p.finished).length;
    return {
      label: `${keys.length} negeri · ${finished} selesai`,
      round: Math.max(...phases.map(p => p.round)),
      done: phases.reduce((a, p) => a + p.done, 0),
      total: phases.reduce((a, p) => a + p.total, 0),
      finished: finished === keys.length,
    };
  }
  return bracketPhase(rounds);
}

function bracketPhase(rounds: DuelRoundDto[]) {
  const last = rounds[rounds.length - 1];
  if (!last) return { label: "Belum dicabut", round: 0, done: 0, total: 0, finished: false };
  const total = last.sessions.length;
  const done = last.sessions.filter(s => s.status === "DONE").length;
  const name = last.isFinal ? "Akhir" : `Pusingan ${last.number}`;
  const finished = last.isFinal && last.status === "DONE";
  const label = finished ? "Selesai" : last.status === "DRAFT" ? `${name} · draf cabutan` : `${name} · ${done}/${total} sesi selesai`;
  return { label, round: last.number, done, total, finished };
}

export { parseDuelConfig };

/**
 * Session + event competition for a duel route, or the error response.
 * `roles` limits writes; reads only need an organizer session.
 */
export async function duelGuard(eventId: string, ecId: string, roles?: string[]) {
  const session = await getOrganizerSession();
  if (!session) return { res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (roles && !roles.includes(session.role)) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const ec = await loadDuelEc(eventId, ecId);
  if (!ec) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { session, ec, cfg: parseDuelConfig(ec.duelConfig) };
}

export const duelErr = (error: string, message: string, status = 400) =>
  NextResponse.json({ error, message }, { status });

/** A session of this competition with its round and entries. */
export async function loadDuelSession(ecId: string, sid: string) {
  return db.duelSession.findFirst({
    where: { id: sid, round: { eventCompetitionId: ecId } },
    include: {
      round: { select: { id: true, groupKey: true, number: true, status: true, isFinal: true } },
      entries: { select: { id: true, teamId: true } },
    },
  });
}

const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
export async function genDuelSlug() {
  const { randomInt } = await import("crypto");
  for (;;) {
    const slug = Array.from({ length: 8 }, () => SLUG_CHARS[randomInt(SLUG_CHARS.length)]).join("");
    if (!(await db.duelDisplayEndpoint.findUnique({ where: { routeSlug: slug }, select: { id: true } }))) return slug;
  }
}
