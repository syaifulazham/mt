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
  stateId: string | null;
  stateName: string | null;
  stateFlag: string | null;
  totalScore: number;
  bestTime: number | null;
  members: { id: string; name: string }[];
}

interface CompetitionResult {
  id: string;
  name: string;
  code: string;
  targetGroups: { code: string; name: string }[];
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
  if (endpoint.passcode) {
    if (!body.passcode) {
      return NextResponse.json({ error: "PASSCODE_REQUIRED" }, { status: 401 });
    }
    if (endpoint.passcode !== body.passcode) {
      return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 401 });
    }
  }

  // 4. Determine which competitions to include
  const targetCompetitionIds: string[] | null =
    endpoint.competitionIds.length > 0 ? endpoint.competitionIds : null;

  const competitions: CompetitionResult[] = [];

  if (endpoint.isWalkIn) {
    // ── Walk-in results ──────────────────────────────────────────────────────
    const walkInComps = await db.eventWalkInCompetition.findMany({
      where: {
        eventId: endpoint.eventId,
        ...(targetCompetitionIds ? { id: { in: targetCompetitionIds } } : {}),
      },
      include: {
        competition: {
          select: {
            id: true, name: true, code: true,
            targetGroups: { select: { targetGroup: { select: { code: true, name: true } } } },
          },
        },
        judgingEndpoints: {
          include: { scores: true },
        },
      },
    });

    for (const wc of walkInComps) {
      const regScoreMap = new Map<string, { totalScore: number; bestTime: number | null }>();

      for (const ep of wc.judgingEndpoints) {
        for (const score of ep.scores) {
          const existing = regScoreMap.get(score.walkInRegistrationId) ?? { totalScore: 0, bestTime: null };
          if (score.score !== null) existing.totalScore += score.score;
          if (score.timeSeconds !== null) {
            if (existing.bestTime === null || score.timeSeconds < existing.bestTime) {
              existing.bestTime = score.timeSeconds;
            }
          }
          regScoreMap.set(score.walkInRegistrationId, existing);
        }
      }

      if (regScoreMap.size === 0) {
        competitions.push({
          id: wc.id,
          name: wc.competition.name,
          code: wc.competition.code,
          targetGroups: wc.competition.targetGroups.map(t => ({ code: t.targetGroup.code, name: t.targetGroup.name })),
          rankings: [],
        });
        continue;
      }

      const regIds = Array.from(regScoreMap.keys());
      const registrations = await db.walkInRegistration.findMany({
        where: { id: { in: regIds } },
        select: {
          id: true,
          participant: { select: { id: true, name: true } },
          contingent: {
            select: {
              id: true, name: true, shortName: true, logoUrl: true,
              contingentType: true, stateId: true,
              state: { select: { id: true, name: true, flagUrl: true } },
              school: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
              higherInstitution: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
            },
          },
        },
      });

      const ranked: Omit<RankingEntry, "rank">[] = registrations.map((reg) => {
        const agg = regScoreMap.get(reg.id) ?? { totalScore: 0, bestTime: null };
        const st = reg.contingent.state ?? reg.contingent.school?.state ?? reg.contingent.higherInstitution?.state;
        return {
          teamId: reg.id,
          teamName: reg.participant.name,
          contingentId: reg.contingent.id,
          contingentName: reg.contingent.name,
          contingentShortName: reg.contingent.shortName ?? null,
          contingentLogo: reg.contingent.logoUrl ?? null,
          stateId: st?.id ?? null,
          stateName: st?.name ?? null,
          stateFlag: st?.flagUrl ?? null,
          totalScore: agg.totalScore,
          bestTime: agg.bestTime,
          members: [{ id: reg.participant.id, name: reg.participant.name }],
        };
      });

      ranked.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (a.bestTime === null && b.bestTime === null) return 0;
        if (a.bestTime === null) return 1;
        if (b.bestTime === null) return -1;
        return a.bestTime - b.bestTime;
      });

      competitions.push({
        id: wc.id,
        name: wc.competition.name,
        code: wc.competition.code,
        targetGroups: wc.competition.targetGroups.map(t => ({ code: t.targetGroup.code, name: t.targetGroup.name })),
        rankings: ranked.map((entry, idx) => ({ rank: idx + 1, ...entry })),
      });
    }
  } else {
    // ── Main competition results ─────────────────────────────────────────────
    const eventCompetitions = await db.eventCompetition.findMany({
      where: {
        eventId: endpoint.eventId,
        ...(targetCompetitionIds
          ? { id: { in: targetCompetitionIds } }
          : {}),
      },
      include: {
        competition: {
          select: {
            id: true, name: true, code: true,
            targetGroups: { select: { targetGroup: { select: { code: true, name: true } } } },
          },
        },
        judgingTasks: {
          include: {
            scores: true,
          },
        },
      },
    });

    for (const ec of eventCompetitions) {
      const teamScoreMap = new Map<string, { totalScore: number; bestTime: number | null }>();

      for (const task of ec.judgingTasks) {
        for (const score of task.scores) {
          const existing = teamScoreMap.get(score.teamId) ?? {
            totalScore: 0,
            bestTime: null,
          };

          if (score.score !== null) {
            existing.totalScore += score.score;
          }

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
          targetGroups: ec.competition.targetGroups.map(t => ({ code: t.targetGroup.code, name: t.targetGroup.name })),
          rankings: [],
        });
        continue;
      }

      const teamIds = Array.from(teamScoreMap.keys());
      const teams = await db.team.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          name: true,
          members: { select: { participant: { select: { id: true, name: true } } } },
          contingent: {
            select: {
              id: true,
              name: true,
              shortName: true,
              logoUrl: true,
              contingentType: true,
              stateId: true,
              state: { select: { id: true, name: true, flagUrl: true } },
              school: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
              higherInstitution: { select: { state: { select: { id: true, name: true, flagUrl: true } } } },
            },
          },
        },
      });

      const ranked: Omit<RankingEntry, "rank">[] = teams.map((team) => {
        const agg = teamScoreMap.get(team.id) ?? { totalScore: 0, bestTime: null };
        return {
          teamId: team.id,
          teamName: team.name,
          contingentId: team.contingent.id,
          contingentName: team.contingent.name,
          contingentShortName: team.contingent.shortName ?? null,
          contingentLogo: team.contingent.logoUrl ?? null,
          stateId: (team.contingent.state ?? team.contingent.school?.state ?? team.contingent.higherInstitution?.state)?.id ?? null,
          stateName: (team.contingent.state ?? team.contingent.school?.state ?? team.contingent.higherInstitution?.state)?.name ?? null,
          stateFlag: (team.contingent.state ?? team.contingent.school?.state ?? team.contingent.higherInstitution?.state)?.flagUrl ?? null,
          totalScore: agg.totalScore,
          bestTime: agg.bestTime,
          members: team.members.map(m => ({ id: m.participant.id, name: m.participant.name })),
        };
      });

      ranked.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (a.bestTime === null && b.bestTime === null) return 0;
        if (a.bestTime === null) return 1;
        if (b.bestTime === null) return -1;
        return a.bestTime - b.bestTime;
      });

      competitions.push({
        id: ec.id,
        name: ec.competition.name,
        code: ec.competition.code,
        targetGroups: ec.competition.targetGroups.map(t => ({ code: t.targetGroup.code, name: t.targetGroup.name })),
        rankings: ranked.map((entry, idx) => ({ rank: idx + 1, ...entry })),
      });
    }
  }

  return NextResponse.json({
    endpoint: {
      id: endpoint.id,
      label: endpoint.label,
      status: endpoint.status,
      isWalkIn: endpoint.isWalkIn,
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
