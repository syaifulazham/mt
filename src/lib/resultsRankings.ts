import { db } from "@/lib/db";
import { verifiedStatesBy } from "@/lib/judgingStatus";

// Competition rankings from judging scores — shared by the public results
// board (/api/results/[slug]) and the announcer board (/api/announce/[slug]).
// Regular competitions rank teams by the sum of every judging task's scores;
// walk-in competitions rank confirmed walk-in registrations the same way.
// Ties on total score go to the best (lowest) time.

export interface RankingEntry {
  rank: number;
  teamId: string;
  teamName: string;
  contingentId: string;
  contingentName: string;
  contingentShortName: string | null;
  contingentLogo: string | null;
  stateId: string | null;
  stateName: string | null;
  stateFlag: string | null;
  totalScore: number;
  bestTime: number | null;
  members: { id: string; name: string }[];
}

export interface CompetitionResult {
  /** EventCompetition id (regular) or EventWalkInCompetition id (walk-in). */
  id: string;
  name: string;
  code: string;
  targetGroups: { code: string; name: string }[];
  /** Judging lifecycle: OPEN | COMPLETED | VERIFIED. */
  judgingStatus: string;
  judgingVerifiedAt: Date | null;
  /** States whose own judging row is VERIFIED (per-state release). */
  verifiedStateIds: string[];
  rankings: RankingEntry[];
}

type Agg = { totalScore: number; bestTime: number | null };

function addScore(map: Map<string, Agg>, key: string, score: number | null, timeSeconds: number | null) {
  const cur = map.get(key) ?? { totalScore: 0, bestTime: null };
  if (score !== null) cur.totalScore += score;
  if (timeSeconds !== null && (cur.bestTime === null || timeSeconds < cur.bestTime)) cur.bestTime = timeSeconds;
  map.set(key, cur);
}

function rank(entries: Omit<RankingEntry, "rank">[]): RankingEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (a.bestTime === null && b.bestTime === null) return 0;
      if (a.bestTime === null) return 1;
      if (b.bestTime === null) return -1;
      return a.bestTime - b.bestTime;
    })
    .map((entry, idx) => ({ rank: idx + 1, ...entry }));
}

const CONTINGENT_SELECT = {
  id: true, name: true, shortName: true, logoUrl: true, contingentType: true, stateId: true,
  state:             { select: { id: true, name: true, flagUrl: true } },
  school:            { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
  higherInstitution: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
} as const;

type ContingentRow = {
  id: string; name: string; shortName: string | null; logoUrl: string | null;
  state: { id: string; name: string; flagUrl: string | null } | null;
  school: { state: { id: string; name: string; flagUrl: string | null } | null } | null;
  higherInstitution: { state: { id: string; name: string; flagUrl: string | null } | null } | null;
};

function contingentFields(c: ContingentRow) {
  const st = c.state ?? c.school?.state ?? c.higherInstitution?.state;
  return {
    contingentId: c.id,
    contingentName: c.name,
    contingentShortName: c.shortName ?? null,
    contingentLogo: c.logoUrl ?? null,
    stateId: st?.id ?? null,
    stateName: st?.name ?? null,
    stateFlag: st?.flagUrl ?? null,
  };
}

/**
 * Results of an event's competitions. `ids` limits to those EventCompetition /
 * EventWalkInCompetition ids (null = all of the event's).
 */
export async function computeCompetitionResults(
  eventId: string, isWalkIn: boolean, ids: string[] | null,
): Promise<CompetitionResult[]> {
  const competitions: CompetitionResult[] = [];

  if (isWalkIn) {
    const walkInComps = await db.eventWalkInCompetition.findMany({
      where: { eventId, ...(ids ? { id: { in: ids } } : {}) },
      include: {
        competition: {
          select: {
            id: true, name: true, code: true,
            targetGroups: { select: { targetGroup: { select: { code: true, name: true } } } },
          },
        },
        judgingEndpoints: { include: { scores: true } },
      },
    });

    for (const wc of walkInComps) {
      const scoreMap = new Map<string, Agg>();
      for (const ep of wc.judgingEndpoints)
        for (const s of ep.scores) addScore(scoreMap, s.walkInRegistrationId, s.score, s.timeSeconds);

      const registrations = scoreMap.size === 0 ? [] : await db.walkInRegistration.findMany({
        where:  { id: { in: [...scoreMap.keys()] } },
        select: { id: true, participant: { select: { id: true, name: true } }, contingent: { select: CONTINGENT_SELECT } },
      });

      competitions.push({
        id: wc.id,
        name: wc.competition.name,
        code: wc.competition.code,
        targetGroups: wc.competition.targetGroups.map(t => ({ code: t.targetGroup.code, name: t.targetGroup.name })),
        judgingStatus: wc.judgingStatus,
        judgingVerifiedAt: wc.judgingVerifiedAt,
        verifiedStateIds: [],
        rankings: rank(registrations.map((reg) => {
          const agg = scoreMap.get(reg.id) ?? { totalScore: 0, bestTime: null };
          return {
            teamId: reg.id,
            teamName: reg.participant.name,
            ...contingentFields(reg.contingent),
            totalScore: agg.totalScore,
            bestTime: agg.bestTime,
            members: [{ id: reg.participant.id, name: reg.participant.name }],
          };
        })),
      });
    }
    const vs = await verifiedStatesBy("walkin", competitions.map(c => c.id));
    for (const c of competitions) c.verifiedStateIds = vs.get(c.id) ?? [];
    return competitions;
  }

  const eventCompetitions = await db.eventCompetition.findMany({
    where: { eventId, ...(ids ? { id: { in: ids } } : {}) },
    include: {
      competition: {
        select: {
          id: true, name: true, code: true,
          targetGroups: { select: { targetGroup: { select: { code: true, name: true } } } },
        },
      },
      judgingTasks: { include: { scores: true } },
    },
  });

  for (const ec of eventCompetitions) {
    const scoreMap = new Map<string, Agg>();
    for (const task of ec.judgingTasks)
      for (const s of task.scores) addScore(scoreMap, s.teamId, s.score, s.timeSeconds);

    const teams = scoreMap.size === 0 ? [] : await db.team.findMany({
      where: { id: { in: [...scoreMap.keys()] } },
      select: {
        id: true, name: true,
        members: { select: { participant: { select: { id: true, name: true } } } },
        contingent: { select: CONTINGENT_SELECT },
      },
    });

    competitions.push({
      id: ec.id,
      name: ec.competition.name,
      code: ec.competition.code,
      targetGroups: ec.competition.targetGroups.map(t => ({ code: t.targetGroup.code, name: t.targetGroup.name })),
      judgingStatus: ec.judgingStatus,
      judgingVerifiedAt: ec.judgingVerifiedAt,
      verifiedStateIds: [],
      rankings: rank(teams.map((team) => {
        const agg = scoreMap.get(team.id) ?? { totalScore: 0, bestTime: null };
        return {
          teamId: team.id,
          teamName: team.name,
          ...contingentFields(team.contingent),
          totalScore: agg.totalScore,
          bestTime: agg.bestTime,
          members: team.members.map(m => ({ id: m.participant.id, name: m.participant.name })),
        };
      })),
    });
  }
  const vs = await verifiedStatesBy("event", competitions.map(c => c.id));
  for (const c of competitions) c.verifiedStateIds = vs.get(c.id) ?? [];
  return competitions;
}

/**
 * Rankings that may be shown: everything once the competition is VERIFIED
 * nationally; otherwise only the teams of states whose own row is VERIFIED,
 * re-ranked within their state (so no cross-state standing leaks).
 */
export function releasedRankings(c: Pick<CompetitionResult, "judgingStatus" | "verifiedStateIds" | "rankings">): RankingEntry[] {
  if (c.judgingStatus === "VERIFIED") return c.rankings;
  const allowed = new Set(c.verifiedStateIds);
  const counters = new Map<string, number>();
  return c.rankings
    .filter(r => r.stateId && allowed.has(r.stateId))
    .map(r => {
      const n = (counters.get(r.stateId!) ?? 0) + 1;
      counters.set(r.stateId!, n);
      return { ...r, rank: n };
    });
}
