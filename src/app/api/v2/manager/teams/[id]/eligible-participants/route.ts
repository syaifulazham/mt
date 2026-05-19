import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { Participant, TargetGroup } from "@prisma/client";

function isEligible(participant: Participant, groups: TargetGroup[]): boolean {
  if (groups.length === 0) return true; // no restrictions

  return groups.some((g) => {
    // Level must match (schoolLevel === eduLevel, same string values)
    if (g.schoolLevel.toUpperCase() !== participant.eduLevel) return false;

    // Grade-based group
    if (g.classGrades.length > 0) {
      return !!participant.classGrade && g.classGrades.includes(participant.classGrade);
    }

    // Age-based group
    if (g.minAge > 0 || g.maxAge > 0) {
      if (participant.age == null) return false;
      if (g.minAge > 0 && participant.age < g.minAge) return false;
      if (g.maxAge > 0 && participant.age > g.maxAge) return false;
      return true;
    }

    // No grade or age filter — schoolLevel match is sufficient
    return true;
  });
}

// ── GET /api/v2/manager/teams/[id]/eligible-participants  ────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
      members: { select: { participantId: true } },
      competition: {
        include: {
          targetGroups: { include: { targetGroup: true } },
        },
      },
    },
  });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const alreadyInTeam = new Set(team.members.map((m) => m.participantId));
  const targetGroups  = team.competition.targetGroups.map((ctg) => ctg.targetGroup);

  const participants = await db.participant.findMany({
    where: {
      contingentId: { in: contingentIds },
      status: "ACTIVE",
    },
    orderBy: { name: "asc" },
  });

  const eligible = participants.filter(
    (p) => !alreadyInTeam.has(p.id) && isEligible(p, targetGroups),
  );

  return NextResponse.json({ data: eligible, targetGroups });
}
