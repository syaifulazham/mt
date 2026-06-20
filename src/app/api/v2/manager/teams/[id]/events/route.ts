import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

async function resolveTeam(userId: string, teamId: string) {
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return null;
  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const team = await db.team.findUnique({ where: { id: teamId }, select: { id: true, competitionId: true, contingentId: true } });
  if (!team || !contingentIds.includes(team.contingentId)) return null;
  return team;
}

// GET — list eligible events for joining (has the team's competition, not already joined, status not DRAFT/COMPLETED)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const team = await resolveTeam(userId, id);
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const joined = await db.teamEvent.findMany({
    where: { teamId: id },
    select: { eventId: true },
  });
  const joinedIds = joined.map((j) => j.eventId);

  const events = await db.event.findMany({
    where: {
      status: { notIn: ["DRAFT", "COMPLETED"] },
      id: { notIn: joinedIds },
      eventCompetitions: { some: { competitionId: team.competitionId } },
    },
    select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, scope: true, venue: true, description: true },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json({ data: events });
}

// POST — join an event
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const team = await resolveTeam(userId, id);
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { eventId } = await req.json();
  if (!eventId) return NextResponse.json({ error: "MISSING_EVENT_ID" }, { status: 400 });

  // Verify the event has this competition
  const ec = await db.eventCompetition.findFirst({
    where: { eventId, competitionId: team.competitionId },
  });
  if (!ec) return NextResponse.json({ error: "EVENT_NOT_ELIGIBLE" }, { status: 400 });

  const teamEvent = await db.teamEvent.upsert({
    where: { teamId_eventId: { teamId: id, eventId } },
    create: { teamId: id, eventId },
    update: {},
    include: {
      event: { select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, scope: true } },
    },
  });

  return NextResponse.json({ data: teamEvent }, { status: 201 });
}
