import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface RankingEntry {
  rank: number;
  teamId: string;
  teamName: string;
  contingentId: string;
  contingentName: string;
  contingentShortName: string | null;
  contingentLogo: string | null;
  totalScore: number;
  bestTime: number | null;
}

interface CompetitionResult {
  id: string;
  name: string;
  code: string;
  rankings: RankingEntry[];
}

// POST /api/results/[slug]
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: { passcode?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  // 1. Find the endpoint
  const endpoint = await db.resultsEndpoint.findUnique({
    where: { routeSlug: slug },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          scope: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  if (!endpoint) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // 2. Check status
  if (endpoint.status === "CLOSED") {
    return NextResponse.json({ error: "ENDPOINT_CLOSED" }, { status: 403 });
  }

  // 3. Check passcode
  if (endpoint.passcode && endpoint.passcode !== body.passcode) {
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 401 });
  }

  // 4. Determine which competitions to include
  const targetCompetitionIds: string[] | null =
    endpoint.competitionIds.length > 0 ? endpoint.competitionIds : null;

  // Fetch all EventCompetitions for this event (filtered to targetCompetitionIds if set)
  const eventCompetitions = await db.eventCompetition.findMany({
    where: {
      eventId: endpoint.eventId,
      ...(targetCompetitionIds
        ? { id: { in: targetCompetitionIds } }
        : {}),
    },
    include: {
      competition: {
        select: { id: true, name: true, code: true },
      },
      judgingTasks: {
        include: {
          scores: true,
        },
      },
    },
  });

  // 5. Build rankings for each competition
  const competitions: CompetitionResult[] = [];

  for (const ec of eventCompetitions) {
    // Aggregate scores per team across all judging tasks
    const teamScoreMap = new Map<string, { totalScore: number; bestTime: number | null }>();

    for (const task of ec.judgingTasks) {
      for (const score of task.scores) {
        const existing = teamScoreMap.get(score.teamId) ?? {
          totalScore: 0,
          bestTime: null,
        };

        // Accumulate score (skip null)
        if (score.score !== null) {
          existing.totalScore += score.score;
        }

        // Track minimum non-null timeSeconds
        if (score.timeSeconds !== null) {
          if (existing.bestTime === null || score.timeSeconds < existing.bestTime) {
            existing.bestTime = score.timeSeconds;
          }
        }

        teamScoreMap.set(score.teamId, existing);
      }
    }

    if (teamScoreMap.size === 0) {
      competitions.push({
        id: ec.id,
        name: ec.competition.name,
        code: ec.competition.code,
        rankings: [],
      });
      continue;
    }

    // Fetch team details for all teams that have scores
    const teamIds = Array.from(teamScoreMap.keys());
    const teams = await db.team.findMany({
      where: { id: { in: teamIds } },
      select: {
        id: true,
        name: true,
        contingent: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
            contingentType: true,
          },
        },
      },
    });

    // Build sorted ranking entries
    const ranked: Omit<RankingEntry, "rank">[] = teams.map((team) => {
      const agg = teamScoreMap.get(team.id) ?? { totalScore: 0, bestTime: null };
      return {
        teamId: team.id,
        teamName: team.name,
        contingentId: team.contingent.id,
        contingentName: team.contingent.name,
        contingentShortName: team.contingent.shortName ?? null,
        contingentLogo: team.contingent.logoUrl ?? null,
        totalScore: agg.totalScore,
        bestTime: agg.bestTime,
      };
    });

    // Sort: totalScore desc, bestTime asc (nulls last)
    ranked.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (a.bestTime === null && b.bestTime === null) return 0;
      if (a.bestTime === null) return 1;
      if (b.bestTime === null) return -1;
      return a.bestTime - b.bestTime;
    });

    const rankings: RankingEntry[] = ranked.map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
    }));

    competitions.push({
      id: ec.id,
      name: ec.competition.name,
      code: ec.competition.code,
      rankings,
    });
  }

  return NextResponse.json({
    endpoint: {
      id: endpoint.id,
      label: endpoint.label,
      status: endpoint.status,
    },
    event: {
      id: endpoint.event.id,
      name: endpoint.event.name,
      scope: endpoint.event.scope,
      startDate: endpoint.event.startDate,
      endDate: endpoint.event.endDate,
    },
    competitions,
  });
}
