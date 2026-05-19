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
    include: { competition: { select: { maxTeamSize: true } }, members: true },
  });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (team.members.length >= team.competition.maxTeamSize)
    return NextResponse.json({ error: "TEAM_FULL" }, { status: 400 });

  const body = await req.json();
  const { participantId } = body;
  if (!participantId) return NextResponse.json({ error: "MISSING_PARTICIPANT" }, { status: 400 });

  const participant = await db.participant.findUnique({ where: { id: participantId } });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(participant.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const member = await db.teamMember.create({
    data: { teamId, participantId },
    include: {
      participant: { select: { id: true, name: true, gender: true, eduLevel: true, classGrade: true } },
    },
  });

  return NextResponse.json({ data: member }, { status: 201 });
}
