import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventResultsClient } from "@/components/organizer/events/EventResultsClient";

export const metadata: Metadata = { title: "Keputusan" };

const ZONE_SCOPES = ["ZONE", "ONLINE_ZONE"];

export default async function EventResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, scope: true,
      eventCompetitions: {
        select: {
          id: true,
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

  const isZoneScope = ZONE_SCOPES.includes(event.scope);

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
    rankings: RankEntry[];
    stateGroups: StateGroup[];
  };

  const competitionRankings: CompetitionRankingOut[] = [];

  for (const ec of event.eventCompetitions) {
    const targetGroup = ec.competition.targetGroups[0]?.targetGroup ?? null;

    const scoreMap = new Map<string, { total: number; minTime: number | null }>();
    for (const task of ec.judgingTasks) {
      for (const s of task.scores) {
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
        id: ec.competition.id, name: ec.competition.name, code: ec.competition.code,
        targetGroup, rankings: [], stateGroups: [],
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
        teamName: t.name,
        contingentName: t.contingent.name,
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

    const rankings: RankEntry[] = [...teamsWithScores]
      .sort(compareScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    let stateGroups: StateGroup[] = [];
    if (isZoneScope) {
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
          const sortedTeams = [...teams].sort(compareScore).map((r, i) => ({ ...r, rank: i + 1 }));
          const bestScore = sortedTeams[0]?.totalScore ?? 0;
          return { stateId, stateName, bestScore, teams: sortedTeams };
        })
        .sort((a, b) => compareScore(
          { totalScore: a.bestScore, bestTime: a.teams[0]?.bestTime ?? null },
          { totalScore: b.bestScore, bestTime: b.teams[0]?.bestTime ?? null },
        ));
    }

    competitionRankings.push({
      id: ec.competition.id, name: ec.competition.name, code: ec.competition.code,
      targetGroup, rankings, stateGroups,
    });
  }

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventResultsClient
        event={{ id: event.id, name: event.name, slug: event.slug, scope: event.scope }}
        competitionRankings={competitionRankings}
        endpoints={event.resultsEndpoints.map((ep) => ({ ...ep, createdAt: ep.createdAt.toISOString() }))}
        canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)}
      />
    </OrganizerShell>
  );
}
