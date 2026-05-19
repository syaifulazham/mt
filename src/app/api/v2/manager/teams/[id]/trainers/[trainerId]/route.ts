import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── DELETE /api/v2/manager/teams/[id]/trainers/[trainerId]  — unassign  ───────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; trainerId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: teamId, trainerId } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await db.teamTrainer.deleteMany({ where: { teamId, trainerId } });
  return NextResponse.json({ success: true });
}
