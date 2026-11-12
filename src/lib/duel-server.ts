import type { SharedRankMode } from "@/lib/sharedRank";
import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { duelStandings, leagueQualifiers, leagueTables, parseDuelConfig, remainingMs, roundTitle, type DrawTeam } from "@/lib/duel";
import { isStreamLive } from "@/lib/cf-stream";
import { currentDuelEndpoint } from "@/lib/duel-control";
import { competitionTitle } from "@/lib/competition-split";
import { activeMerges, type MergeRow } from "@/lib/team-merge-server";

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
  /** A merged state team: its registered teams (the first is the lead, whose id it carries). */
  members?: { id: string; name: string; contingentName: string; logoUrl: string | null }[];
};
/** A pool team: `attended` once its attendance (team or any member) is recorded. */
export type DuelPoolTeam = DuelTeam & { attended: boolean };

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
  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, eventId },
    select: {
      id: true, eventId: true, competitionId: true, judgingMethod: true, duelConfig: true, mergeByState: true, mergeMax: true,
      resultScope: true, configLockedAt: true,
      competition: { select: { name: true, code: true, participationType: true } },
      event: { select: { name: true, slug: true, scope: true, sharedRankMode: true } },
      splitLabel: true,
    },
  });
  // A judging split shows as "Name — Label" everywhere the duel goes.
  return ec && { ...ec, competition: { ...ec.competition, name: competitionTitle(ec.competition.name, ec.splitLabel) } };
}

/**
 * The draw pool: every team registered to the event for this competition,
 * flagged with whether it has attended. Draws default to attended teams; the
 * organizer may include the rest to draw before attendance is taken.
 */
export async function duelPool(eventId: string, competitionId: string, ecId: string | null): Promise<DuelPoolTeam[]> {
  const raw = await duelTeams(eventId, competitionId);
  const merges = ecId ? await activeMerges(ecId) : null;
  return merges ? mergePool(raw, merges) : raw;
}

/** Every registered team, unmerged (the merge editor's pool). */
export async function duelTeams(eventId: string, competitionId: string): Promise<DuelPoolTeam[]> {
  const teams = await db.team.findMany({
    where: { competitionId, status: "ACTIVE", teamEvents: { some: { eventId } } },
    select: {
      ...TEAM_SELECT,
      teamEvents: {
        where: { eventId }, take: 1,
        select: { attendedAt: true, _count: { select: { participantAttendance: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return teams.map(t => {
    const te = t.teamEvents[0];
    return { ...teamDto(t as TeamRow), attended: !!te && (!!te.attendedAt || te._count.participantAttendance > 0) };
  });
}

/** A merged state team as a duel team: the lead's id, the merge's name, its members underneath. */
function mergedTeam(m: MergeRow, members: DuelTeam[], state: StateRef | undefined): DuelTeam {
  const first = members[0];
  return {
    id: m.teamIds[0], name: m.name,
    // Its own "contingent", so no-same-contingent rules never clash it.
    contingentId: `merge:${m.id}`, contingentName: members.map(t => t.name).join(" · "), logoUrl: null,
    stateId: m.stateId ?? first?.stateId ?? null,
    stateName: state?.name ?? first?.stateName ?? null,
    flagUrl: state?.flagUrl ?? first?.flagUrl ?? null,
    countryIso2: first?.countryIso2 ?? null,
    members: members.map(t => ({ id: t.id, name: t.name, contingentName: t.contingentName, logoUrl: t.logoUrl })),
  };
}

/** Pool with merged teams in place of their members (attended once any member is). */
export function mergePool(raw: DuelPoolTeam[], merges: MergeRow[]): DuelPoolTeam[] {
  const byId = new Map(raw.map(t => [t.id, t]));
  const taken = new Set<string>();
  const units: DuelPoolTeam[] = [];
  for (const m of merges) {
    const members = m.teamIds.map(id => byId.get(id)).filter((t): t is DuelPoolTeam => !!t);
    m.teamIds.forEach(id => taken.add(id));
    if (!members.length) continue;
    units.push({ ...mergedTeam(m, members, undefined), attended: members.some(t => t.attended) });
  }
  return [...units, ...raw.filter(t => !taken.has(t.id))];
}

/** Every round of the competition with sessions, entries and team details. */
export async function loadRounds(ecId: string) {
  const merges = await activeMerges(ecId);
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
  // Merged state teams: entries carry the lead's id, shown as the merge.
  const lead = new Map<string, DuelTeam>();
  if (merges?.length) {
    const ids = [...new Set(merges.flatMap(m => m.teamIds))];
    const [teams, states] = await Promise.all([
      db.team.findMany({ where: { id: { in: ids } }, select: TEAM_SELECT }),
      db.state.findMany({ where: { id: { in: merges.map(m => m.stateId).filter((x): x is string => !!x) } }, select: { id: true, name: true, flagUrl: true } }),
    ]);
    const byId = new Map(teams.map(t => [t.id, teamDto(t as TeamRow)]));
    const stateById = new Map(states.map(st => [st.id, st]));
    for (const m of merges) {
      const members = m.teamIds.map(id => byId.get(id)).filter((t): t is DuelTeam => !!t);
      lead.set(m.teamIds[0], mergedTeam(m, members, m.stateId ? stateById.get(m.stateId) : undefined));
    }
  }
  return rounds.map(r => ({
    id: r.id, groupKey: r.groupKey, number: r.number, stage: r.stage, isFinal: r.isFinal, status: r.status, split: r.split,
    noSameContingent: r.noSameContingent, noSameState: r.noSameState,
    startAt: r.startAt, confirmedAt: r.confirmedAt,
    sessions: r.sessions.map(s => ({
      id: s.id, number: s.number, label: s.label, pool: s.pool, arena: s.arena, wave: s.wave,
      scheduledAt: s.scheduledAt, status: s.status,
      startedAt: s.startedAt, pausedAt: s.pausedAt, pausedMs: s.pausedMs, endedAt: s.endedAt,
      // Never the publish URL (a secret for the media team's camera).
      video: isStreamLive(s) ? s.streamPlaybackUrl : null,
      replayUrl: s.replayStatus === "READY" ? s.replayUrl : null,
      entries: s.entries.map(e => ({
        id: e.id, teamId: e.teamId, slot: e.slot, rank: e.rank, points: e.points, advanced: e.advanced,
        team: lead.get(e.teamId) ?? teamDto(e.team as TeamRow),
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
export function standingsOf(rounds: DuelRoundDto[], mode?: SharedRankMode) {
  const teams = new Map<string, DuelTeam>();
  for (const r of rounds) for (const s of r.sessions) for (const e of s.entries) teams.set(e.teamId, e.team);
  return duelStandings(rounds, mode).map(s => ({ ...s, team: teams.get(s.teamId)! }));
}

/** Standings per bracket, keyed by group key. */
export function standingsByGroup(rounds: DuelRoundDto[], mode?: SharedRankMode) {
  const keys = [...new Set(rounds.map(r => r.groupKey))];
  return Object.fromEntries(keys.map(k => [k, standingsOf(rounds.filter(r => r.groupKey === k), mode)]));
}

/**
 * A bracket's group stage: tables (with teams), the seeded qualifiers, and
 * groups where a tie straddles the cut. Null without a confirmed group stage.
 */
export function leagueOf(rounds: DuelRoundDto[], groupAdvance: number, mode?: SharedRankMode) {
  const group = rounds.find(r => r.stage === "GROUP");
  if (!group || group.status === "DRAFT") return null;
  const teams = new Map<string, DuelTeam>();
  for (const s of group.sessions) for (const e of s.entries) teams.set(e.teamId, e.team);
  const tables = leagueTables(group, mode);
  const { qualifiers, cutoffTies } = leagueQualifiers(tables, groupAdvance);
  return {
    done: group.status === "DONE",
    tables: tables.map(t => ({ ...t, rows: t.rows.map(r => ({ ...r, team: teams.get(r.teamId)! })) })),
    qualifiers: qualifiers.map(q => q.teamId),
    cutoffTies,
  };
}

/** League data per bracket, keyed by group key. */
export function leagueByGroup(rounds: DuelRoundDto[], groupAdvance: number, mode?: SharedRankMode) {
  const keys = [...new Set(rounds.map(r => r.groupKey))];
  return Object.fromEntries(keys.map(k => [k, leagueOf(rounds.filter(r => r.groupKey === k), groupAdvance, mode)]));
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
  const name = roundTitle(last, rounds.some(r => r.stage === "GROUP"));
  const finished = last.isFinal && last.status === "DONE";
  const unit = last.stage === "GROUP" || rounds.some(r => r.stage === "GROUP") ? "perlawanan" : "sesi";
  const label = finished ? "Selesai" : last.status === "DRAFT" ? `${name} · draf cabutan` : `${name} · ${done}/${total} ${unit} selesai`;
  return { label, round: last.number, done, total, finished };
}

export { parseDuelConfig };

/**
 * Session + event competition for a duel route, or the error response.
 * `roles` limits writes; reads only need an organizer session.
 */
export async function duelGuard(eventId: string, ecId: string, roles?: string[]) {
  // A duel control link (/duel-control/<slug>) acts on its own competition only.
  const link = currentDuelEndpoint();
  if (link && link.ecId !== ecId) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const session = link ?? await getOrganizerSession();
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
      round: { select: { id: true, groupKey: true, number: true, stage: true, status: true, isFinal: true } },
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
