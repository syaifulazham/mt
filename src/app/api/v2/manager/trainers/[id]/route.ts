import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

const TRAINER_INCLUDE = {
  teams: {
    include: {
      team: { select: { id: true, name: true, competition: { select: { name: true, code: true } } } },
    },
  },
};

async function resolveTrainer(userId: string, trainerId: string) {
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return { error: "PROFILE_NOT_FOUND", status: 404 } as const;

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const trainer = await db.trainer.findUnique({ where: { id: trainerId }, include: TRAINER_INCLUDE });
  if (!trainer) return { error: "NOT_FOUND", status: 404 } as const;
  if (!contingentIds.includes(trainer.contingentId))
    return { error: "FORBIDDEN", status: 403 } as const;

  return { trainer };
}

// ── GET /api/v2/manager/trainers/[id]  ────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const result = await resolveTrainer(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.trainer });
}

// ── PATCH /api/v2/manager/trainers/[id]  ─────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const result = await resolveTrainer(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await req.json();
  const { name, ic, email, phoneNumber } = body;
  if (!name?.trim()) return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  const updated = await db.trainer.update({
    where: { id },
    data: {
      name:        name.trim(),
      ic:          ic?.trim()          ?? null,
      email:       email?.trim()       ?? null,
      phoneNumber: phoneNumber?.trim() ?? null,
    },
    include: TRAINER_INCLUDE,
  });

  return NextResponse.json({ data: updated });
}

// ── DELETE /api/v2/manager/trainers/[id]  ────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const result = await resolveTrainer(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  await db.trainer.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
