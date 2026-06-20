import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      theme:        { select: { id: true, name: true, color: true } },
      targetGroups: { include: { targetGroup: true } },
      eventCompetitions: {
        include: { event: { select: { id: true, name: true, slug: true, startDate: true, status: true, scope: true } } },
        orderBy: { createdAt: "asc" },
      },
      docs: { orderBy: { uploadedAt: "desc" } },
      _count: { select: { teams: true } },
    },
  });

  if (!competition) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: competition });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const {
    code, name, description, themeId,
    participationType, minTeamSize, maxTeamSize,
    maxParticipantsPerContingent, maxTotalParticipants,
    targetGroupIds,
    eptimEduCourseId, eptimEduCourseTitle,
    thirdPartyIntegration,
  } = await req.json();

  try {
    const competition = await db.$transaction(async (tx) => {
      if (Array.isArray(targetGroupIds)) {
        await tx.competitionTargetGroup.deleteMany({ where: { competitionId: id } });
        if (targetGroupIds.length > 0) {
          await tx.competitionTargetGroup.createMany({
            data: targetGroupIds.map((tgId: string) => ({ competitionId: id, targetGroupId: tgId })),
          });
        }
      }

      return tx.competition.update({
        where: { id },
        data: {
          ...(code        && { code:        code.trim().toUpperCase() }),
          ...(name        && { name:        name.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(themeId     !== undefined && { themeId:     themeId || null }),
          ...(participationType           && { participationType }),
          ...(minTeamSize !== undefined   && { minTeamSize:                  Number(minTeamSize)  }),
          ...(maxTeamSize !== undefined   && { maxTeamSize:                  Number(maxTeamSize)  }),
          ...(maxParticipantsPerContingent !== undefined && { maxParticipantsPerContingent: Number(maxParticipantsPerContingent) }),
          ...(maxTotalParticipants !== undefined         && { maxTotalParticipants:         Number(maxTotalParticipants)         }),
          ...(eptimEduCourseId       !== undefined && { eptimEduCourseId:    eptimEduCourseId    || null }),
          ...(eptimEduCourseTitle    !== undefined && { eptimEduCourseTitle: eptimEduCourseTitle || null }),
          ...(thirdPartyIntegration  !== undefined && { thirdPartyIntegration: thirdPartyIntegration || "none" }),
        },
        include: {
          targetGroups: { include: { targetGroup: { select: { id: true, name: true, schoolLevel: true } } } },
        },
      });
    });
    return NextResponse.json({ data: competition });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const competition = await db.competition.findUnique({ where: { id } });
  if (!competition) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.competition.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
