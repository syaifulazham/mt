import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventResultsClient } from "@/components/organizer/events/EventResultsClient";

export const metadata: Metadata = { title: "Keputusan" };

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
          competition: { select: { id: true, name: true, code: true } },
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
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  // Pre-aggregate rankings per competition
  type RankEntry = {
    teamId: string; teamName: string;
    contingentName: string; contingentLogo: string | null;
    totalScore: number; bestTime: number | null; rank: number;
  };

  const competitionRankings: { id: string; name: string; code: string; rankings: RankEntry[] }[] = [];

  for (const ec of event.eventCompetitions) {
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
      competitionRankings.push({ id: ec.competition.id, name: ec.competition.name, code: ec.competition.code, rankings: [] });
      continue;
    }

    const teams = await db.team.findMany({
      where: { id: { in: [...scoreMap.keys()] } },
      select: { id: true, name: true, contingent: { select: { name: true, logoUrl: true } } },
    });

    const sorted = teams
      .map(t => {
        const agg = scoreMap.get(t.id)!;
        return { teamId: t.id, teamName: t.name, contingentName: t.contingent.name, contingentLogo: t.contingent.logoUrl, totalScore: agg.total, bestTime: agg.minTime };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (a.bestTime != null && b.bestTime != null) return a.bestTime - b.bestTime;
        if (a.bestTime != null) return -1;
        if (b.bestTime != null) return 1;
        return 0;
      })
      .map((r, i) => ({ ...r, rank: i + 1 }));

    competitionRankings.push({ id: ec.competition.id, name: ec.competition.name, code: ec.competition.code, rankings: sorted });
  }

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventResultsClient
        event={{ id: event.id, name: event.name, slug: event.slug, scope: event.scope }}
        competitionRankings={competitionRankings}
        endpoints={event.resultsEndpoints}
        canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)}
      />
    </OrganizerShell>
  );
}
