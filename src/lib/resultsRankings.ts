import { db } from "@/lib/db";
import { verifiedStatesBy } from "@/lib/judgingStatus";
import { compareScoreTime, parseSharedRankMode, withSharedRanks, type SharedRankMode } from "@/lib/sharedRank";
import { HOME_COUNTRY_ISO2, INTERNATIONAL_SCOPE_ID, isForeignCountry } from "@/lib/countries";
import { hiddenMembers, mergeByLead, mergesByEc } from "@/lib/team-merge-server";
import { defaultResultScope, resolveResultScope, type ResultScope } from "@/lib/resultScope";

// Competition rankings from judging scores — shared by the public results
// board (/api/results/[slug]) and the announcer board (/api/announce/[slug]).
// Regular competitions rank teams by the sum of every judging task's scores;
// walk-in competitions rank confirmed walk-in registrations the same way.
// Ties on total score go to the best (lowest) time; teams equal on both share a
// rank; the event's sharedRankMode decides 1, 2, 2, 4 or 1, 2, 2, 3
// (src/lib/sharedRank.ts).
//
// Foreign teams (contingent of a country other than Malaysia — see
// src/lib/international.ts) are kept out of `rankings`, so national and state
// standings, the medal tally, MC boards and certificates stay local-only; local
// teams are ranked 1..n among themselves. Foreign teams go to
// `foreignRankings`, ranked within their own country.

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
  /** Set for foreign contingents only. */
  countryId: string | null;
  countryName: string | null;
  countryCode: string | null;
  totalScore: number;
  bestTime: number | null;
  /** A merged state team's members carry their own contingent (certificates print it). */
  members: { id: string; name: string; contingentId?: string; contingentName?: string }[];
  /** Set for a merged state team ("JOHOR A"): its registered teams. */
  mergedTeams?: { id: string; name: string; contingentName: string }[];
}

export interface CompetitionResult {
  /** EventCompetition id (regular) or EventWalkInCompetition id (walk-in). */
  id: string;
  name: string;
  code: string;
  targetGroups: { code: string; name: string }[];
  /** Judging lifecycle: OPEN | COMPLETED | VERIFIED. */
  judgingStatus: string;
  /** Ranked as one national list or per state (Penghakiman → Konfigurasi keputusan). */
  resultScope: ResultScope;
  judgingVerifiedAt: Date | null;
  /** States whose own judging row is VERIFIED (per-state release). */
  verifiedStateIds: string[];
  /** Local teams only, ranked 1..n. */
  rankings: RankingEntry[];
  /** Foreign teams, each ranked within its country. */
  foreignRankings: RankingEntry[];
  /** The event's shared-rank rule; re-rank per state/country with the same one. */
  rankMode: SharedRankMode;
}

type Agg = { totalScore: number; bestTime: number | null };

function addScore(map: Map<string, Agg>, key: string, score: number | null, timeSeconds: number | null) {
  const cur = map.get(key) ?? { totalScore: 0, bestTime: null };
  if (score !== null) cur.totalScore += score;
  if (timeSeconds !== null && (cur.bestTime === null || timeSeconds < cur.bestTime)) cur.bestTime = timeSeconds;
  map.set(key, cur);
}

/** Higher total first; ties go to the best (lowest) time, no time last. Equal = shared rank. */
const compareEntries = compareScoreTime;

/** Sorts everyone once, then splits: locals ranked 1..n, foreigners per country; ties share a rank. */
function rankSplit(entries: Omit<RankingEntry, "rank">[], mode: SharedRankMode): Pick<CompetitionResult, "rankings" | "foreignRankings" | "rankMode"> {
  const all = [...entries].sort(compareEntries);
  const rankings = withSharedRanks(all.filter(r => !r.countryId), compareEntries, mode);
  const foreignRankings = withSharedRanks(all.filter(r => r.countryId), compareEntries, mode, r => r.countryId!);
  return { rankings, foreignRankings, rankMode: mode };
}

const CONTINGENT_SELECT = {
  id: true, name: true, shortName: true, logoUrl: true, contingentType: true, stateId: true,
  state:             { select: { id: true, name: true, flagUrl: true } },
  school:            { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
  higherInstitution: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
  country:           { select: { id: true, name: true, codeIso2: true } },
} as const;

type ContingentRow = {
  id: string; name: string; shortName: string | null; logoUrl: string | null;
  state: { id: string; name: string; flagUrl: string | null } | null;
  school: { state: { id: string; name: string; flagUrl: string | null } | null } | null;
  higherInstitution: { state: { id: string; name: string; flagUrl: string | null } | null } | null;
  country: { id: string; name: string; codeIso2: string } | null;
};

function contingentFields(c: ContingentRow) {
  const st = c.state ?? c.school?.state ?? c.higherInstitution?.state;
  const foreign = isForeignCountry(c.country) ? c.country : null;
  return {
    contingentId: c.id,
    contingentName: c.name,
    contingentShortName: c.shortName ?? null,
    contingentLogo: c.logoUrl ?? null,
    stateId: st?.id ?? null,
    stateName: st?.name ?? null,
    stateFlag: st?.flagUrl ?? null,
    countryId: foreign?.id ?? null,
    countryName: foreign?.name ?? null,
    countryCode: foreign?.codeIso2 ?? null,
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
  const event = await db.event.findUnique({ where: { id: eventId }, select: { scope: true, sharedRankMode: true } });
  const eventScope = String(event?.scope ?? "");
  const mode = parseSharedRankMode(event?.sharedRankMode);

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
        resultScope: defaultResultScope(eventScope),
        judgingVerifiedAt: wc.judgingVerifiedAt,
        verifiedStateIds: [],
        ...rankSplit(registrations.map((reg) => {
          const agg = scoreMap.get(reg.id) ?? { totalScore: 0, bestTime: null };
          return {
            teamId: reg.id,
            teamName: reg.participant.name,
            ...contingentFields(reg.contingent),
            totalScore: agg.totalScore,
            bestTime: agg.bestTime,
            members: [{ id: reg.participant.id, name: reg.participant.name }],
          };
        }), mode),
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

  const mergeMap = await mergesByEc(eventCompetitions.map(ec => ec.id));
  for (const ec of eventCompetitions) {
    const scoreMap = new Map<string, Agg>();
    for (const task of ec.judgingTasks)
      for (const s of task.scores) addScore(scoreMap, s.teamId, s.score, s.timeSeconds);

    // Merged state teams rank once, under the lead's id and the merge's name.
    const merges = mergeMap.get(ec.id);
    const hidden = hiddenMembers(merges), leads = mergeByLead(merges);
    for (const id of hidden) scoreMap.delete(id);
    const memberIds = [...leads.entries()].filter(([lead]) => scoreMap.has(lead)).flatMap(([, m]) => m.teamIds);

    const allTeams = scoreMap.size === 0 ? [] : await db.team.findMany({
      where: { id: { in: [...new Set([...scoreMap.keys(), ...memberIds])] } },
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
      resultScope: resolveResultScope(ec, eventScope),
      judgingVerifiedAt: ec.judgingVerifiedAt,
      verifiedStateIds: [],
      ...rankSplit(allTeams.filter(t => scoreMap.has(t.id)).map((team) => {
        const agg = scoreMap.get(team.id) ?? { totalScore: 0, bestTime: null };
        const merge = leads.get(team.id);
        if (merge) {
          const parts = merge.teamIds.map(id => allTeams.find(t => t.id === id)).filter((t): t is (typeof allTeams)[number] => !!t);
          return {
            teamId: team.id,
            teamName: merge.name,
            ...contingentFields(team.contingent),
            contingentName: [...new Set(parts.map(t => t.contingent.name))].join(" · "),
            contingentShortName: null,
            contingentLogo: null,
            totalScore: agg.totalScore,
            bestTime: agg.bestTime,
            members: parts.flatMap(t => t.members.map(m => ({
              id: m.participant.id, name: m.participant.name, contingentId: t.contingent.id, contingentName: t.contingent.name,
            }))),
            mergedTeams: parts.map(t => ({ id: t.id, name: t.name, contingentName: t.contingent.name })),
          };
        }
        return {
          teamId: team.id,
          teamName: team.name,
          ...contingentFields(team.contingent),
          totalScore: agg.totalScore,
          bestTime: agg.bestTime,
          members: team.members.map(m => ({ id: m.participant.id, name: m.participant.name })),
        };
      }), mode),
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
export function releasedRankings(c: Pick<CompetitionResult, "judgingStatus" | "verifiedStateIds" | "rankings" | "rankMode">): RankingEntry[] {
  if (c.judgingStatus === "VERIFIED") return c.rankings;
  const allowed = new Set(c.verifiedStateIds);
  return withSharedRanks(c.rankings.filter(r => r.stateId && allowed.has(r.stateId)), compareEntries, c.rankMode, r => r.stateId!);
}

/** Foreign results may be shown: the competition is VERIFIED, or its Antarabangsa judging scope is. */
export function internationalReleased(c: Pick<CompetitionResult, "judgingStatus" | "verifiedStateIds">): boolean {
  return c.judgingStatus === "VERIFIED" || c.verifiedStateIds.includes(INTERNATIONAL_SCOPE_ID);
}

/**
 * The Antarabangsa ranking: the top `places` of each country — Malaysia's from
 * the local ranking, each foreign country's from its own — merged and ranked
 * 1..n by score with the usual tie-break. Shared by the public results board
 * (Antara Bangsa view) and the MC announcement boards.
 *
 * Each part keeps its own release gate: Malaysia's teams take part once the
 * competition is VERIFIED (as Kebangsaan), the foreign teams once the
 * Antarabangsa judging scope is VERIFIED (or the whole competition is). With
 * only one of the two verified, the list ranks just that part — so when
 * Kebangsaan is verified later, Malaysia's teams join and the ranks shift.
 * Malaysian entries are tagged with Malaysia as their country for display.
 */
export function internationalRankings(
  c: Pick<CompetitionResult, "judgingStatus" | "verifiedStateIds" | "rankings" | "foreignRankings" | "rankMode">,
  places = 2,
): RankingEntry[] {
  if (c.foreignRankings.length === 0) return [];
  const malaysia = c.judgingStatus === "VERIFIED"
    ? c.rankings.slice(0, places).map(r => ({ ...r, countryName: "Malaysia", countryCode: HOME_COUNTRY_ISO2 }))
    : [];
  const foreign = internationalReleased(c) ? c.foreignRankings.filter(r => r.rank <= places) : [];
  return withSharedRanks([...malaysia, ...foreign].sort(compareEntries), compareEntries, c.rankMode);
}
