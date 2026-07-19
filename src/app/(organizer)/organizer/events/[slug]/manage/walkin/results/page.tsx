import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { WalkInResultsClient } from "@/components/organizer/events/WalkInResultsClient";

export const metadata: Metadata = { title: "Keputusan Walk-in" };

export default async function WalkInResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, scope: true,
      walkInCompetitions: {
        select: {
          id: true,
          competition: { select: { id: true, name: true, code: true } },
          judgingEndpoints: {
            select: {
              id: true,
              scores: {
                select: {
                  walkInRegistrationId: true,
                  score: true,
                  timeSeconds: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      resultsEndpoints: {
        where: { isWalkIn: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  // Pre-aggregate rankings per walk-in competition
  type RankEntry = {
    registrationId: string; participantName: string;
    contingentName: string; contingentLogo: string | null;
    totalScore: number; bestTime: number | null; rank: number;
  };

  const competitionRankings: { id: string; name: string; code: string; rankings: RankEntry[] }[] = [];

  for (const wc of event.walkInCompetitions) {
    const scoreMap = new Map<string, { total: number; minTime: number | null }>();
    for (const ep of wc.judgingEndpoints) {
      for (const s of ep.scores) {
        const cur = scoreMap.get(s.walkInRegistrationId) ?? { total: 0, minTime: null };
        cur.total += s.score ?? 0;
        if (s.timeSeconds != null) {
          cur.minTime = cur.minTime == null ? s.timeSeconds : Math.min(cur.minTime, s.timeSeconds);
        }
        scoreMap.set(s.walkInRegistrationId, cur);
      }
    }
    if (scoreMap.size === 0) {
      competitionRankings.push({ id: wc.competition.id, name: wc.competition.name, code: wc.competition.code, rankings: [] });
      continue;
    }

    const registrations = await db.walkInRegistration.findMany({
      where: { id: { in: [...scoreMap.keys()] } },
      select: {
        id: true,
        participant: { select: { name: true } },
        contingent: { select: { name: true, logoUrl: true } },
      },
    });

    const sorted = registrations
      .map(r => {
        const agg = scoreMap.get(r.id)!;
        return {
          registrationId: r.id,
          participantName: r.participant.name,
          contingentName: r.contingent.name,
          contingentLogo: r.contingent.logoUrl,
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

    competitionRankings.push({ id: wc.competition.id, name: wc.competition.name, code: wc.competition.code, rankings: sorted });
  }

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <WalkInResultsClient
        event={{ id: event.id, name: event.name, slug: event.slug, scope: event.scope }}
        competitionRankings={competitionRankings}
        endpoints={event.resultsEndpoints.map(ep => ({ ...ep, createdAt: ep.createdAt.toISOString() }))}
        canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)}
      />
    </OrganizerShell>
  );
}
