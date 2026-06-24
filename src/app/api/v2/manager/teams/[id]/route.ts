import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

const TEAM_INCLUDE = {
  competition: { select: { id: true, name: true, code: true, maxTeamSize: true, minTeamSize: true, eptimEduCourseId: true } },
  members: {
    include: {
      participant: { select: { id: true, name: true, gender: true, eduLevel: true, classGrade: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  trainers: {
    include: {
      trainer: { select: { id: true, name: true, phoneNumber: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  teamEvents: {
    include: {
      event: { select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, scope: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

async function resolveTeam(userId: string, teamId: string) {
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return { error: "PROFILE_NOT_FOUND", status: 404 } as const;

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const team = await db.team.findUnique({ where: { id: teamId }, include: TEAM_INCLUDE });
  if (!team) return { error: "NOT_FOUND", status: 404 } as const;
  if (!contingentIds.includes(team.contingentId))
    return { error: "FORBIDDEN", status: 403 } as const;

  return { team };
}

// ── GET /api/v2/manager/teams/[id]  ──────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const result = await resolveTeam(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ data: result.team });
}

// ── PATCH /api/v2/manager/teams/[id]  ────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const result = await resolveTeam(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await req.json();
  const { name, email } = body;

  if (name !== undefined && !name?.trim())
    return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  // Email uniqueness check: no other team may use the same email
  if (email !== undefined && email !== null && email !== "") {
    const conflict = await db.team.findFirst({
      where: { email, id: { not: id } },
    });
    if (conflict)
      return NextResponse.json({ error: "Email already used by another team." }, { status: 409 });
  }

  // If email is changing, check whether it differs from the current value
  const currentTeam = result.team;
  const newEmail = email !== undefined ? (email?.trim() || null) : undefined;
  const emailChanged = newEmail !== undefined && newEmail !== currentTeam.email;

  const updated = await db.team.update({
    where: { id },
    data: {
      ...(name      !== undefined && { name: name.trim() }),
      ...(newEmail  !== undefined && { email: newEmail }),
      // Reset LMS registration whenever the team email changes
      ...(emailChanged && {
        lmsUserId:        null,
        lmsPassword:      null,
        lmsCourseEnrolled: false,
      }),
    },
    include: TEAM_INCLUDE,
  });

  return NextResponse.json({ data: updated });
}

// ── DELETE /api/v2/manager/teams/[id]  ───────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const result = await resolveTeam(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  await db.team.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
