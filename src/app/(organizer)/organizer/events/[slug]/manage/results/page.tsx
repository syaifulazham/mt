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
    contingentName: string; contingentFullName: string; contingentLogo: string | null;
    totalScore: number; bestTime: number | null; rank: number;
  };

  type StateRankEntry = {
    rank: number; stateId: string; stateName: string;
    totalScore: number; bestTime: number | null; teamCount: number;
  };

  type CompetitionRankingOut = {
    id: string; name: string; code: string;
    targetGroup: { id: string; code: string; name: string } | null;
    rankings: RankEntry[];
    stateRankings: StateRankEntry[];
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
        targetGroup, rankings: [], stateRankings: [],
      });
      continue;
    }

    const teams = await db.team.findMany({
      where: { id: { in: [...scoreMap.keys()] } },
      select: {
        id: true,
        name: true,
        contingent: {
          select: {
            name: true,
            shortName: true,
            logoUrl: true,
            stateId: true,
            school: { select: { stateId: true } },
            higherInstitution: { select: { stateId: true } },
          },
        },
      },
    });

    // Team-level rankings (always computed)
    const sorted: RankEntry[] = teams
      .map((t) => {
        const agg = scoreMap.get(t.id)!;
        const displayName = t.contingent.shortName ?? t.contingent.name;
        return {
          teamId: t.id,
          teamName: t.name,
          contingentName: displayName,
          contingentFullName: t.contingent.name,
          contingentLogo: t.contingent.logoUrl,
          totalScore: agg.total,
          bestTime: agg.minTime,
        };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (a.bestTime != null && b.bestTime != null) return a.bestTime - b.bestTime;
        if (a.bestTime != null) return -1;
        if (b.bestTime != null) return 1;
        return 0;
      })
      .map((r, i) => ({ ...r, rank: i + 1 }));

    // State-level rankings (computed for ZONE scope)
    let stateRankings: StateRankEntry[] = [];
    if (isZoneScope) {
      const stateIdSet = new Set<string>();
      for (const t of teams) {
        const sid = t.contingent.stateId ?? t.contingent.school?.stateId ?? t.contingent.higherInstitution?.stateId;
        if (sid) stateIdSet.add(sid);
      }

      const states = await db.state.findMany({
        where: { id: { in: [...stateIdSet] } },
        select: { id: true, name: true },
      });
      const stateNameMap = new Map(states.map((s) => [s.id, s.name]));

      const stateAgg = new Map<string, { total: number; minTime: number | null; teamCount: number; stateName: string }>();
      for (const t of teams) {
        const stateId = t.contingent.stateId ?? t.contingent.school?.stateId ?? t.contingent.higherInstitution?.stateId;
        if (!stateId) continue;
        const stateName = stateNameMap.get(stateId) ?? stateId;
        const agg = scoreMap.get(t.id)!;
        const cur = stateAgg.get(stateId) ?? { total: 0, minTime: null, teamCount: 0, stateName };
        cur.total += agg.total;
        cur.teamCount++;
        if (agg.minTime != null) {
          cur.minTime = cur.minTime == null ? agg.minTime : Math.min(cur.minTime, agg.minTime);
        }
        stateAgg.set(stateId, cur);
      }

      stateRankings = [...stateAgg.entries()]
        .sort(([, a], [, b]) => {
          if (b.total !== a.total) return b.total - a.total;
          if (a.minTime != null && b.minTime != null) return a.minTime - b.minTime;
          if (a.minTime != null) return -1;
          if (b.minTime != null) return 1;
          return 0;
        })
        .map(([stateId, data], i) => ({
          rank: i + 1,
          stateId,
          stateName: data.stateName,
          totalScore: data.total,
          bestTime: data.minTime,
          teamCount: data.teamCount,
        }));
    }

    competitionRankings.push({
      id: ec.competition.id, name: ec.competition.name, code: ec.competition.code,
      targetGroup, rankings: sorted, stateRankings,
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
