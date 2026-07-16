import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

function emailToUsername(email: string): string {
  return email
    .toLowerCase()
    .replace(/@/g, "_at_")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
    .padEnd(3, "x");
}

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

  // Verify actual EptimEdu enrolment per course (real-time, falls back to DB flag on error)
  let enrolledCourseIds: string[] = [];
  if (team.email && eptimEduConfigured()) {
    try {
      const username = emailToUsername(team.email);
      const result = await eptimEdu.getUserEnrolments(username);
      // Handle both array and { enrolments: [] } response shapes
      const raw: unknown[] = Array.isArray(result)
        ? result
        : Array.isArray(result?.enrolments)
          ? result.enrolments
          : [];
      enrolledCourseIds = raw
        .map((e) => (e as { courseId?: string })?.courseId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      // Sync DB flag if it no longer matches reality (fire-and-forget)
      const actuallyEnrolled = enrolledCourseIds.length > 0;
      if (actuallyEnrolled !== team.lmsCourseEnrolled) {
        db.team.update({ where: { id: teamId }, data: { lmsCourseEnrolled: actuallyEnrolled } }).catch(() => {});
      }
    } catch {
      // EptimEdu unavailable — fall back to DB flag conservatively
      if (team.lmsCourseEnrolled) {
        enrolledCourseIds = eventCourses
          .map((ec) => ec.courseId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
      }
    }
  } else if (team.lmsCourseEnrolled) {
    enrolledCourseIds = eventCourses
      .map((ec) => ec.courseId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  return NextResponse.json({
    id: team.id,
    email: team.email,
    lmsUserId: team.lmsUserId,
    lmsCourseEnrolled: team.lmsCourseEnrolled,
    enrolledCourseIds,
    competition: team.competition,
    eventCourses,
    members: team.members,
    trainers: team.trainers,
  });
}
