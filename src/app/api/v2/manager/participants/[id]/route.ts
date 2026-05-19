import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { Gender, EduLevel } from "@prisma/client";

async function getAuthorizedParticipant(userId: string, id: string) {
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return { error: "PROFILE_NOT_FOUND", status: 404 };

  const contingentIds = manager.contingentManagers.map((c) => c.contingentId);
  const participant = await db.participant.findUnique({ where: { id } });
  if (!participant) return { error: "NOT_FOUND", status: 404 };
  if (!contingentIds.includes(participant.contingentId))
    return { error: "FORBIDDEN", status: 403 };

  return { participant };
}

// ── PATCH /api/v2/manager/participants/[id] ──────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const auth_ = await getAuthorizedParticipant(userId, id);
  if ("error" in auth_) return NextResponse.json({ error: auth_.error }, { status: auth_.status });

  const body = await req.json();
  const { name, ic, email, phoneNumber, gender, age, eduLevel, classGrade, className, status, ppki } = body;

  if (!name || !gender || !eduLevel)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const updated = await db.participant.update({
    where: { id },
    data: {
      name,
      ic:          ic          ?? null,
      email:       email       ?? null,
      phoneNumber: phoneNumber ?? null,
      gender:      gender      as Gender,
      age:         age ? Number(age) : null,
      eduLevel:    eduLevel    as EduLevel,
      classGrade:  classGrade  ?? null,
      className:   className   ?? null,
      status:      status      ?? "ACTIVE",
      ppki:        ppki        ?? false,
    },
  });

  return NextResponse.json({ data: updated });
}

// ── DELETE /api/v2/manager/participants/[id] ─────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const auth_ = await getAuthorizedParticipant(userId, id);
  if ("error" in auth_) return NextResponse.json({ error: auth_.error }, { status: auth_.status });

  await db.participant.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
