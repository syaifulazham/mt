import type { Metadata } from "next";
import { parseSharedRankMode, withSharedRanks } from "@/lib/sharedRank";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { resolveResultScope, type ResultScope } from "@/lib/resultScope";
import { flagEmoji, isForeignCountry } from "@/lib/countries";
import { EventResultsClient } from "@/components/organizer/events/EventResultsClient";
import { eventJudgingProgress, type JudgingRow } from "@/lib/judgingStatus";
import { hiddenMembers, mergeByLead, mergesByEc } from "@/lib/team-merge-server";
import { loadSpecialAwards } from "@/lib/special-awards";
import { competitionTitle } from "@/lib/competition-split";
import { SpecialAwardsSummary } from "@/components/organizer/awards/SpecialAwardsSummary";

export const metadata: Metadata = { title: "Keputusan" };

export default async function EventResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, scope: true, sharedRankMode: true,
      eventCompetitions: {
        select: {
          id: true,
          judgingStatus: true, judgingVerifiedAt: true, judgingVerifiedBy: true,
          resultScope: true, judgingMethod: true, duelConfig: true, splitLabel: true,
          competition: {
            select: {
              id: true,
              name: true,
              code: true,
              targetGroups: {
                select: { targetGroup: { select: { id: true, code: true, name: true } } },
                take: 1,
              },
            },
          },
          judgingTasks: {
            select: {
              id: true,
              scores: { select: { teamId: true, score: true, timeSeconds: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      resultsEndpoints: {
        where: { isWalkIn: false },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!event) redirect("/organizer/events");
  const rankMode = parseSharedRankMode(event.sharedRankMode);

  type RankEntry = {
    teamId: string; teamName: string;
    contingentName: string; contingentLogo: string | null;
    totalScore: number; bestTime: number | null; rank: number;
    selected: boolean;
  };

  type StateGroup = {
    stateId: string; stateName: string;
    bestScore: number;
    teams: RankEntry[];
  };

  type CompetitionRankingOut = {
    id: string; name: string; code: string;
    targetGroup: { id: string; code: string; name: string } | null;
    judging: { status: string; verifiedAt: string | null; verifiedBy: string | null; statusUrl: string; rows: JudgingRow[] };
    rankings: RankEntry[];
    stateGroups: StateGroup[];
    /** Penghakiman → Konfigurasi keputusan: the view the page opens in. */
    resultScope: ResultScope;
  };

  const competitionRankings: CompetitionRankingOut[] = [];
  // Per-state judging rows ("Semua" + states with teams) for the verification table.
  const progress = new Map((await eventJudgingProgress(event.id)).map((p) => [p.id, p.rows]));
  // Merged state teams rank once, under the lead team's id and the merge's name.
  const merges = await mergesByEc(event.eventCompetitions.map((ec) => ec.id));

  for (const ec of event.eventCompetitions) {
    const targetGroup = ec.competition.targetGroups[0]?.targetGroup ?? null;
    const resultScope = resolveResultScope(ec, event.scope);
    const judging = {
      status:     ec.judgingStatus,
      verifiedAt: ec.judgingVerifiedAt?.toISOString() ?? null,
      verifiedBy: ec.judgingVerifiedBy,
      statusUrl:  `/api/v2/organizer/events/${event.id}/competitions/${ec.id}/judging-status`,
      rows:       progress.get(ec.id) ?? [],
    };

    const scoreMap = new Map<string, { total: number; minTime: number | null }>();
    const hidden = hiddenMembers(merges.get(ec.id)), leads = mergeByLead(merges.get(ec.id));
    for (const task of ec.judgingTasks) {
      for (const s of task.scores) {
        if (hidden.has(s.teamId)) continue;
        const cur = scoreMap.get(s.teamId) ?? { total: 0, minTime: null };
        cur.total += s.score ?? 0;
        if (s.timeSeconds != null) {
          cur.minTime = cur.minTime == null ? s.timeSeconds : Math.min(cur.minTime, s.timeSeconds);
        }
        scoreMap.set(s.teamId, cur);
      }
    }

    if (scoreMap.size === 0) {
      competitionRankings.push({
        id: ec.id, name: competitionTitle(ec.competition.name, ec.splitLabel), code: ec.competition.code,
        targetGroup, judging, rankings: [], stateGroups: [], resultScope,
      });
      continue;
    }

    const teamIds = [...scoreMap.keys()];

    const [teams, teamEvents] = await Promise.all([
      db.team.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          name: true,
          contingent: {
            select: {
              name: true,
              logoUrl: true,
              stateId: true,
              school: { select: { stateId: true } },
              higherInstitution: { select: { stateId: true } },
              country: { select: { name: true, codeIso2: true } },
            },
          },
        },
      }),
      db.teamEvent.findMany({
        where: { eventId: event.id, teamId: { in: teamIds } },
        select: { teamId: true, selected: true },
      }),
    ]);

    const selectedMap = new Map(teamEvents.map((te) => [te.teamId, te.selected]));

    type TeamWithScore = {
      teamId: string; teamName: string;
      contingentName: string; contingentLogo: string | null;
      totalScore: number; bestTime: number | null;
      effectiveStateId: string | null;
      selected: boolean;
    };

    const teamsWithScores: TeamWithScore[] = teams.map((t) => {
      const agg = scoreMap.get(t.id)!;
      const sid = t.contingent.stateId ?? t.contingent.school?.stateId ?? t.contingent.higherInstitution?.stateId ?? null;
      return {
        teamId: t.id,
        teamName: leads.get(t.id)?.name ?? t.name,
        // Foreign teams are ranked here with everyone (the public board keeps them
        // to the Antara Bangsa view); the country tells them apart.
        contingentName: isForeignCountry(t.contingent.country)
          ? `${t.contingent.name} · ${flagEmoji(t.contingent.country!.codeIso2)} ${t.contingent.country!.name}`
          : t.contingent.name,
        contingentLogo: t.contingent.logoUrl,
        totalScore: agg.total,
        bestTime: agg.minTime,
        effectiveStateId: sid,
        selected: selectedMap.get(t.id) ?? false,
      };
    });

    function compareScore(a: { totalScore: number; bestTime: number | null }, b: { totalScore: number; bestTime: number | null }) {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (a.bestTime != null && b.bestTime != null) return a.bestTime - b.bestTime;
      if (a.bestTime != null) return -1;
      if (b.bestTime != null) return 1;
      return 0;
    }

    // Equal score and time share a rank; the event's sharedRankMode decides 1, 2, 2, 4 or 1, 2, 2, 3.
    const rankings: RankEntry[] = withSharedRanks([...teamsWithScores].sort(compareScore), compareScore, rankMode);

    let stateGroups: StateGroup[] = [];
    // Always built, so either view can be shown; the default follows resultScope.
    {
      const stateIdSet = new Set(teamsWithScores.map((t) => t.effectiveStateId).filter(Boolean) as string[]);
      const states = await db.state.findMany({
        where: { id: { in: [...stateIdSet] } },
        select: { id: true, name: true },
      });
      const stateNameMap = new Map(states.map((s) => [s.id, s.name]));

      const groupMap = new Map<string, { stateName: string; teams: TeamWithScore[] }>();
      for (const t of teamsWithScores) {
        if (!t.effectiveStateId) continue;
        const stateName = stateNameMap.get(t.effectiveStateId) ?? t.effectiveStateId;
        if (!groupMap.has(t.effectiveStateId)) {
          groupMap.set(t.effectiveStateId, { stateName, teams: [] });
        }
        groupMap.get(t.effectiveStateId)!.teams.push(t);
      }

      stateGroups = [...groupMap.entries()]
        .map(([stateId, { stateName, teams }]) => {
          const sortedTeams = withSharedRanks([...teams].sort(compareScore), compareScore, rankMode);
          const bestScore = sortedTeams[0]?.totalScore ?? 0;
          return { stateId, stateName, bestScore, teams: sortedTeams };
        })
        .sort((a, b) => compareScore(
          { totalScore: a.bestScore, bestTime: a.teams[0]?.bestTime ?? null },
          { totalScore: b.bestScore, bestTime: b.teams[0]?.bestTime ?? null },
        ));
    }

    competitionRankings.push({
      id: ec.id, name: competitionTitle(ec.competition.name, ec.splitLabel), code: ec.competition.code,
      targetGroup, judging, rankings, stateGroups, resultScope,
    });
  }

  const specialAwards = await loadSpecialAwards(event.id);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventResultsClient
        event={{ id: event.id, name: event.name, slug: event.slug, scope: event.scope }}
        competitionRankings={competitionRankings}
        endpoints={event.resultsEndpoints.map((ep) => ({ ...ep, createdAt: ep.createdAt.toISOString() }))}
        canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)}
        isSuperAdmin={session.role === "SUPER_ADMIN"}
      />
      <SpecialAwardsSummary awards={specialAwards} eventSlug={event.slug} />
    </OrganizerShell>
  );
}
