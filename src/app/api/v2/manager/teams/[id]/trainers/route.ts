import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── POST /api/v2/manager/teams/[id]/trainers  — assign a trainer  ─────────────
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

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { trainerId } = await req.json();
  if (!trainerId) return NextResponse.json({ error: "MISSING_TRAINER" }, { status: 400 });

  const trainer = await db.trainer.findUnique({ where: { id: trainerId } });
  if (!trainer) return NextResponse.json({ error: "TRAINER_NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(trainer.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await db.teamTrainer.upsert({
    where:  { teamId_trainerId: { teamId, trainerId } },
    create: { teamId, trainerId },
    update: {},
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
