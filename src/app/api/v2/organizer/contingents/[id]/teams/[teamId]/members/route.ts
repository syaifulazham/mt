import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

// POST — add a participant (from the same contingent) to a team
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: contingentId, teamId } = await params;
  const body = await req.json();
  const { participantId } = body;
  if (!participantId) return NextResponse.json({ error: "MISSING_PARTICIPANT" }, { status: 400 });

  // Fetch team with current members count and competition maxTeamSize
  const team = await db.team.findUnique({
    where: { id: teamId, contingentId },
    select: {
      id: true,
      contingentId: true,
      competition: { select: { maxTeamSize: true } },
      _count: { select: { members: true } },
    },
  });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });

  // Check max members
  if (team._count.members >= team.competition.maxTeamSize) {
    return NextResponse.json({ error: "TEAM_FULL", maxTeamSize: team.competition.maxTeamSize }, { status: 400 });
  }

  // Verify participant belongs to the same contingent
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { id: true, contingentId: true, name: true },
  });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });
  if (participant.contingentId !== contingentId) {
    return NextResponse.json({ error: "DIFFERENT_CONTINGENT" }, { status: 403 });
  }

  // Check if already a member of this team
  const existing = await db.teamMember.findFirst({
    where: { teamId, participantId },
  });
  if (existing) return NextResponse.json({ error: "ALREADY_MEMBER" }, { status: 409 });

  const member = await db.teamMember.create({
    data: { teamId, participantId },
    select: {
      id: true,
      participant: {
        select: {
          id: true, name: true, ic: true, email: true,
          gender: true, age: true, eduLevel: true, status: true,
        },
      },
    },
  });

  return NextResponse.json({ data: member }, { status: 201 });
}

// DELETE — remove a member from a team
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: contingentId, teamId } = await params;
  const body = await req.json().catch(() => ({}));
  const { memberId } = body;
  if (!memberId) return NextResponse.json({ error: "MISSING_MEMBER_ID" }, { status: 400 });

  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    select: { id: true, teamId: true, team: { select: { contingentId: true } } },
  });
  if (!member || member.teamId !== teamId || member.team.contingentId !== contingentId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await db.teamMember.delete({ where: { id: memberId } });
  return NextResponse.json({ deleted: true });
}
