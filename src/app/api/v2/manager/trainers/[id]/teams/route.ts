import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

async function resolveTrainerAndContingents(userId: string, trainerId: string) {
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return { error: "PROFILE_NOT_FOUND", status: 404 } as const;

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const trainer = await db.trainer.findUnique({ where: { id: trainerId } });
  if (!trainer) return { error: "TRAINER_NOT_FOUND", status: 404 } as const;
  if (!contingentIds.includes(trainer.contingentId))
    return { error: "FORBIDDEN", status: 403 } as const;

  return { trainer, contingentIds };
}

// ── POST /api/v2/manager/trainers/[id]/teams  — assign trainer to a team  ────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: trainerId } = await params;
  const result = await resolveTrainerAndContingents(userId, trainerId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { teamId } = await req.json();
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM" }, { status: 400 });

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  if (!result.contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const assignment = await db.teamTrainer.upsert({
    where:  { teamId_trainerId: { teamId, trainerId } },
    create: { teamId, trainerId },
    update: {},
    include: { team: { select: { id: true, name: true, competition: { select: { name: true, code: true } } } } },
  });

  return NextResponse.json({ data: assignment }, { status: 201 });
}

// ── DELETE /api/v2/manager/trainers/[id]/teams  — unassign from a team  ──────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: trainerId } = await params;
  const result = await resolveTrainerAndContingents(userId, trainerId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { teamId } = await req.json();
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM" }, { status: 400 });

  await db.teamTrainer.deleteMany({ where: { trainerId, teamId } });
  return NextResponse.json({ success: true });
}
