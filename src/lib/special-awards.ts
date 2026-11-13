import { db } from "@/lib/db";
import { competitionTitle } from "@/lib/competition-split";
import { compareScoreTime, parseSharedRankMode, withSharedRanks } from "@/lib/sharedRank";
import { hiddenMembers, mergeByLead, mergesByEc } from "@/lib/team-merge-server";

// Anugerah Tambahan (SpecialAward): awards beside a competition's ranked places.
// TEMPLATE awards rank the competition's teams live by the scores of the tasks
// judged on the chosen templates (A, or A + B summed; ties to the best time,
// then shared under the event's rank mode). CUSTOM awards list the winners
// picked by hand. Merged state teams rank as one, under their merge's name.

export type AwardWinner = {
  rank: number;
  /** A recipient typed by hand: no team / participant record; `participantName` / `teamName` hold the name. */
  custom?: boolean;
  teamId: string | null; teamName: string | null;
  participantId: string | null; participantName: string | null;
  contingentName: string | null; stateName: string | null;
  /** TEMPLATE awards: the summed score and best time. */
  score: number | null; bestTime: number | null;
};

export type AwardDto = {
  id: string; name: string; basis: string; recipientType: string; method: string;
  eventCompetitionId: string | null; competition: { code: string; name: string; participationType: string } | null;
  templateIds: string[]; templates: { id: string; name: string; code: string }[];
  places: number; position: number;
  winners: AwardWinner[];
  /** Why a TEMPLATE award can't resolve (e.g. individual award on a team competition). */
  warning: string | null;
};

const TEAM_SELECT = {
  id: true, name: true,
  contingent: {
    select: {
      name: true, shortName: true,
      state: { select: { name: true } }, school: { select: { state: { select: { name: true } } } },
      higherInstitution: { select: { state: { select: { name: true } } } },
    },
  },
  members: { select: { participant: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
} as const;

type TeamRow = {
  id: string; name: string;
  contingent: { name: string; shortName: string | null; state: { name: string } | null; school: { state: { name: string } | null } | null; higherInstitution: { state: { name: string } | null } | null };
  members: { participant: { id: string; name: string } }[];
};
const stateOf = (t: TeamRow) => t.contingent.state?.name ?? t.contingent.school?.state?.name ?? t.contingent.higherInstitution?.state?.name ?? null;

/** Every special award of an event, with its winners resolved. */
export async function loadSpecialAwards(eventId: string): Promise<AwardDto[]> {
  const [awards, event] = await Promise.all([
    db.specialAward.findMany({
      where: { eventId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        eventCompetition: { select: { splitLabel: true, competition: { select: { code: true, name: true, participationType: true } } } },
        winners: {
          orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
          include: {
            team: { select: TEAM_SELECT },
            participant: {
              select: {
                id: true, name: true,
                teamMembers: { select: { team: { select: TEAM_SELECT } }, take: 1 },
                contingent: { select: { name: true, state: { select: { name: true } }, school: { select: { state: { select: { name: true } } } } } },
              },
            },
          },
        },
      },
    }),
    db.event.findUnique({ where: { id: eventId }, select: { sharedRankMode: true } }),
  ]);
  const templateIds = [...new Set(awards.flatMap(a => a.templateIds))];
  const templates = new Map((templateIds.length
    ? await db.judgingTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true, code: true } })
    : []).map(t => [t.id, t]));
  const merges = await mergesByEc([...new Set(awards.map(a => a.eventCompetitionId).filter((x): x is string => !!x))]);
  const mode = parseSharedRankMode(event?.sharedRankMode);

  const out: AwardDto[] = [];
  for (const a of awards) {
    const base = {
      id: a.id, name: a.name, basis: a.basis, recipientType: a.recipientType, method: a.method,
      eventCompetitionId: a.eventCompetitionId,
      competition: a.eventCompetition ? { ...a.eventCompetition.competition, name: competitionTitle(a.eventCompetition.competition.name, a.eventCompetition.splitLabel) } : null,
      templateIds: a.templateIds, templates: a.templateIds.map(id => templates.get(id)).filter((t): t is { id: string; name: string; code: string } => !!t),
      places: a.places, position: a.position,
    };
    if (a.method === "TEMPLATE" && a.eventCompetitionId) {
      const { winners, warning } = await templateWinners(a.eventCompetitionId, a.templateIds, a.places, a.recipientType,
        a.eventCompetition?.competition.participationType ?? "TEAM", merges.get(a.eventCompetitionId), mode);
      out.push({ ...base, winners, warning });
      continue;
    }
    out.push({
      ...base, warning: null,
      winners: a.winners.map(w => {
        if (w.customName) {
          const individual = a.recipientType === "INDIVIDUAL";
          return {
            rank: w.rank, custom: true,
            teamId: null, teamName: individual ? null : w.customName,
            participantId: null, participantName: individual ? w.customName : null,
            contingentName: w.customNote, stateName: null, score: null, bestTime: null,
          };
        }
        if (w.team) {
          return {
            rank: w.rank, teamId: w.team.id, teamName: w.team.name, participantId: null, participantName: null,
            contingentName: w.team.contingent.name, stateName: stateOf(w.team as TeamRow), score: null, bestTime: null,
          };
        }
        const p = w.participant;
        const team = p?.teamMembers[0]?.team as TeamRow | undefined;
        return {
          rank: w.rank, teamId: team?.id ?? null, teamName: team?.name ?? null,
          participantId: p?.id ?? null, participantName: p?.name ?? null,
          contingentName: p?.contingent?.name ?? team?.contingent.name ?? null,
          stateName: p?.contingent?.state?.name ?? p?.contingent?.school?.state?.name ?? (team ? stateOf(team) : null),
          score: null, bestTime: null,
        };
      }),
    });
  }
  return out;
}

/** Top `places` ranks of a competition by the scores of its tasks on `templateIds`. */
async function templateWinners(
  ecId: string, templateIds: string[], places: number, recipientType: string, participationType: string,
  merges: Parameters<typeof hiddenMembers>[0], mode: ReturnType<typeof parseSharedRankMode>,
): Promise<{ winners: AwardWinner[]; warning: string | null }> {
  if (!templateIds.length) return { winners: [], warning: "Pilih sekurang-kurangnya satu templat." };
  if (recipientType === "INDIVIDUAL" && participationType !== "INDIVIDUAL")
    return { winners: [], warning: "Markah dinilai bagi pasukan — anugerah individu bagi pertandingan berpasukan perlu dipilih secara manual." };

  const scores = await db.judgingScore.findMany({
    where: { judgingTask: { eventCompetitionId: ecId, judgingTemplateId: { in: templateIds } } },
    select: { teamId: true, score: true, timeSeconds: true },
  });
  const hidden = hiddenMembers(merges), leads = mergeByLead(merges);
  const agg = new Map<string, { totalScore: number; bestTime: number | null }>();
  for (const s of scores) {
    if (hidden.has(s.teamId)) continue;
    const cur = agg.get(s.teamId) ?? { totalScore: 0, bestTime: null };
    cur.totalScore += s.score ?? 0;
    if (s.timeSeconds != null && (cur.bestTime === null || s.timeSeconds < cur.bestTime)) cur.bestTime = s.timeSeconds;
    agg.set(s.teamId, cur);
  }
  if (!agg.size) return { winners: [], warning: null };
  const ranked = withSharedRanks(
    [...agg.entries()].map(([teamId, a]) => ({ teamId, ...a })).sort(compareScoreTime), compareScoreTime, mode,
  ).filter(r => r.rank <= places);
  const teams = new Map((await db.team.findMany({ where: { id: { in: ranked.map(r => r.teamId) } }, select: TEAM_SELECT }))
    .map(t => [t.id, t as TeamRow]));

  const winners: AwardWinner[] = [];
  for (const r of ranked) {
    const t = teams.get(r.teamId);
    if (!t) continue;
    const merge = leads.get(t.id);
    const row = {
      rank: r.rank, teamId: t.id, teamName: merge?.name ?? t.name,
      contingentName: merge ? null : t.contingent.name, stateName: stateOf(t),
      score: Math.round(r.totalScore * 100) / 100, bestTime: r.bestTime,
    };
    if (recipientType === "INDIVIDUAL") {
      for (const m of t.members) winners.push({ ...row, participantId: m.participant.id, participantName: m.participant.name });
    } else {
      winners.push({ ...row, participantId: null, participantName: null });
    }
  }
  return { winners, warning: null };
}
