import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

function makeEcInclude(eventId: string) {
  return {
    competition: {
      include: {
        theme:        { select: { id: true, name: true, color: true } },
        // classGrades/ageGroup are needed by the Quizzly "By Grade" mapping table.
        targetGroups: {
          include: {
            targetGroup: {
              select: { id: true, name: true, code: true, schoolLevel: true, classGrades: true, ageGroup: true, minAge: true, maxAge: true },
            },
          },
        },
        _count:       { select: { teams: { where: { teamEvents: { some: { eventId } } } } } },
      },
    },
  } as const;
}

// PATCH /api/v2/organizer/events/[id]/competitions/[ecId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId, ecId } = await params;

  const {
    picName, picContact, maxTeams,
    eptimEduCourseId, eptimEduCourseTitle,
    eptimCsiCompetitionId, eptimCsiCompetitionName, eptimCsiCases,
    quizzlySessionId, quizzlySessionTitle, quizzlyAssignBy, quizzlyQuizMap,
  } = await req.json();

  if (quizzlyAssignBy !== undefined && quizzlyAssignBy !== null
      && !["target_group", "grade"].includes(quizzlyAssignBy))
    return NextResponse.json({ error: "INVALID_QUIZZLY_ASSIGN_BY" }, { status: 400 });

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await db.eventCompetition.update({
    where: { id: ecId },
    data: {
      ...(picName             !== undefined && { picName:             picName?.trim()    || null }),
      ...(picContact          !== undefined && { picContact:          picContact?.trim() || null }),
      ...(maxTeams            !== undefined && { maxTeams:            Number(maxTeams)   || 0    }),
      ...(eptimEduCourseId    !== undefined && { eptimEduCourseId:    eptimEduCourseId    ?? null }),
      ...(eptimEduCourseTitle !== undefined && { eptimEduCourseTitle: eptimEduCourseTitle ?? null }),
      ...(eptimCsiCompetitionId   !== undefined && { eptimCsiCompetitionId:   eptimCsiCompetitionId   || null }),
      ...(eptimCsiCompetitionName !== undefined && { eptimCsiCompetitionName: eptimCsiCompetitionName || null }),
      ...(eptimCsiCases !== undefined && {
        eptimCsiCases: Array.isArray(eptimCsiCases) && eptimCsiCases.length > 0 ? eptimCsiCases : Prisma.DbNull,
      }),
      ...(quizzlySessionId    !== undefined && { quizzlySessionId:    quizzlySessionId    || null }),
      ...(quizzlySessionTitle !== undefined && { quizzlySessionTitle: quizzlySessionTitle || null }),
      ...(quizzlyAssignBy     !== undefined && { quizzlyAssignBy:     quizzlyAssignBy     || null }),
      ...(quizzlyQuizMap !== undefined && {
        quizzlyQuizMap: Array.isArray(quizzlyQuizMap) && quizzlyQuizMap.length > 0 ? quizzlyQuizMap : Prisma.DbNull,
      }),
    },
    include: makeEcInclude(eventId),
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/v2/organizer/events/[id]/competitions/[ecId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId, ecId } = await params;

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.eventCompetition.delete({ where: { id: ecId } });
  return NextResponse.json({ success: true });
}
