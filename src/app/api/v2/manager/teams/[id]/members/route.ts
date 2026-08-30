import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── POST /api/v2/manager/teams/[id]/members  ─────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: teamId } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);

  const team = await db.team.findUnique({
    where: { id: teamId },
    include: {
      competition: { select: { maxTeamSize: true } },
      members: true,
      teamEvents: { select: { eventId: true, selected: true } },
    },
  });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (team.teamEvents.some(te => te.selected))
    return NextResponse.json({ error: "TEAM_LOCKED" }, { status: 400 });

  if (team.members.length >= team.competition.maxTeamSize)
    return NextResponse.json({ error: "TEAM_FULL" }, { status: 400 });

  const body = await req.json();
  const { participantId } = body;
  if (!participantId) return NextResponse.json({ error: "MISSING_PARTICIPANT" }, { status: 400 });

  const participant = await db.participant.findUnique({ where: { id: participantId } });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(participant.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Reject if the participant is already in another team registered for any
  // event this team has joined (a participant may not compete in multiple
  // competitions within the same event)
  const eventIds = team.teamEvents.map((te) => te.eventId);
  if (eventIds.length > 0) {
    const conflict = await db.teamMember.findFirst({
      where: {
        participantId,
        teamId: { not: teamId },
        team: { teamEvents: { some: { eventId: { in: eventIds } } } },
      },
      select: { id: true },
    });
    if (conflict)
      return NextResponse.json({ error: "PARTICIPANT_IN_SAME_EVENT" }, { status: 400 });
  }

  const member = await db.teamMember.create({
    data: { teamId, participantId },
    include: {
      participant: { select: { id: true, name: true, gender: true, eduLevel: true, classGrade: true } },
    },
  });

  return NextResponse.json({ data: member }, { status: 201 });
}
