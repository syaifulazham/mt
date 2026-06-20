import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// GET — all events relevant to the manager's teams (either already joined or eligible to join)
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);

  // All teams managed by this manager
  const teams = await db.team.findMany({
    where: { contingentId: { in: contingentIds } },
    select: {
      id: true,
      name: true,
      status: true,
      competitionId: true,
      contingentId: true,
      competition: { select: { id: true, name: true, code: true } },
      teamEvents: { select: { eventId: true } },
      _count: { select: { members: true } },
    },
  });

  const competitionIds = [...new Set(teams.map((t) => t.competitionId))];

  // Events that have at least one competition the manager's teams are in
  const events = await db.event.findMany({
    where: {
      status: { notIn: ["DRAFT"] },
      eventCompetitions: { some: { competitionId: { in: competitionIds } } },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      scope: true,
      venue: true,
      description: true,
      startDate: true,
      endDate: true,
      eventCompetitions: {
        where: { competitionId: { in: competitionIds } },
        select: { competitionId: true },
      },
      teamEvents: {
        where: { team: { contingentId: { in: contingentIds } } },
        select: {
          team: {
            select: {
              id: true,
              name: true,
              status: true,
              competitionId: true,
              contingentId: true,
              competition: { select: { id: true, name: true, code: true } },
              _count: { select: { members: true } },
            },
          },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // For each event, compute eligible (unjoined) teams
  const joinedTeamIdsByEvent = new Map<string, Set<string>>();
  for (const event of events) {
    joinedTeamIdsByEvent.set(event.id, new Set(event.teamEvents.map((te) => te.team.id)));
  }

  const data = events.map((event) => {
    const eventCompIds = new Set(event.eventCompetitions.map((ec) => ec.competitionId));
    const joined = joinedTeamIdsByEvent.get(event.id)!;
    const eligibleTeams = teams
      .filter((t) => eventCompIds.has(t.competitionId) && !joined.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        competitionId: t.competitionId,
        contingentId: t.contingentId,
        competition: t.competition,
        memberCount: t._count.members,
      }));

    return {
      id: event.id,
      name: event.name,
      slug: event.slug,
      status: event.status,
      scope: event.scope,
      venue: event.venue,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      participatingTeams: event.teamEvents.map((te) => ({
        id: te.team.id,
        name: te.team.name,
        status: te.team.status,
        competitionId: te.team.competitionId,
        contingentId: te.team.contingentId,
        competition: te.team.competition,
        memberCount: te.team._count.members,
      })),
      eligibleTeams,
    };
  });

  return NextResponse.json({ data });
}
