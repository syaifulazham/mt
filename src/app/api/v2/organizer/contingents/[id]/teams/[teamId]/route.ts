import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, teamId } = await params;

  const team = await db.team.findUnique({
    where: { id: teamId, contingentId: id },
    select: {
      id: true,
      email: true,
      lmsUserId: true,
      lmsCourseEnrolled: true,
      competition: {
        select: {
          id: true,
          code: true,
          name: true,
          eptimEduCourseId: true,
          eptimEduCourseTitle: true,
        },
      },
      teamEvents: {
        select: {
          event: {
            select: {
              id: true,
              name: true,
              eventCompetitions: {
                where: { competition: { teams: { some: { id: teamId } } } },
                select: {
                  eptimEduCourseId: true,
                  eptimEduCourseTitle: true,
                },
                take: 1,
              },
            },
          },
        },
      },
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          participant: {
            select: {
              id: true, name: true, ic: true, email: true, gender: true,
              age: true, eduLevel: true, status: true,
            },
          },
        },
      },
      trainers: {
        orderBy: { trainer: { name: "asc" } },
        select: {
          trainer: {
            select: { id: true, name: true, ic: true, phoneNumber: true, status: true },
          },
        },
      },
    },
  });

  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Flatten event courses: use event-specific override, fall back to competition default
  const eventCourses = team.teamEvents.map((te) => {
    const ec = te.event.eventCompetitions[0];
    return {
      eventId: te.event.id,
      eventName: te.event.name,
      courseId: ec?.eptimEduCourseId ?? team.competition?.eptimEduCourseId ?? null,
      courseTitle: ec?.eptimEduCourseTitle ?? team.competition?.eptimEduCourseTitle ?? null,
    };
  });

  return NextResponse.json({
    id: team.id,
    email: team.email,
    lmsUserId: team.lmsUserId,
    lmsCourseEnrolled: team.lmsCourseEnrolled,
    competition: team.competition,
    eventCourses,
    members: team.members,
    trainers: team.trainers,
  });
}
