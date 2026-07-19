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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EptimEdu is not configured on this server." }, { status: 503 });

  const { id: contingentId, teamId } = await params;
  const { courseId, force } = await req.json();

  if (!courseId)
    return NextResponse.json({ error: "MISSING_COURSE_ID" }, { status: 400 });

  const team = await db.team.findUnique({
    where: { id: teamId, contingentId },
    select: { id: true, name: true, email: true, lmsUserId: true },
  });

  if (!team)
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (!team.email)
    return NextResponse.json({ error: "Team has no email address. Set a team email before enrolling." }, { status: 400 });

  const username = emailToUsername(team.email);

  try {
    // 1. Ensure the LMS user account exists with the correct email
    let lmsUserId = team.lmsUserId;
    if (!lmsUserId) {
      const check = await eptimEdu.userExists(username);
      if (check?.exists) {
        lmsUserId = check.user.id;
      } else {
        const password = Array.from({ length: 6 }, () =>
          "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"[
            Math.floor(Math.random() * 55)
          ]).join("");
        const created = await eptimEdu.createUser({
          username,
          password,
          name: team.name,
          email: team.email,
        });
        lmsUserId = created.id;
      }
    }

    // 2. Check if already enrolled in this specific course
    const enrolments = await eptimEdu.getUserEnrolments(username);
    const raw: unknown[] = Array.isArray(enrolments)
      ? enrolments
      : Array.isArray(enrolments?.enrolments)
        ? enrolments.enrolments
        : [];
    const enrolledCourseIds = raw
      .map((e) => (e as { courseId?: string })?.courseId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (enrolledCourseIds.includes(courseId) && !force) {
      // Already enrolled — persist state and return success
      await db.team.update({
        where: { id: teamId },
        data: { lmsUserId, lmsCourseEnrolled: true },
      });
      return NextResponse.json({ success: true, username, alreadyEnrolled: true });
    }

    // 3. Enrol in the course (force re-enrol handles 409 gracefully)
    const result = await eptimEdu.enrol(username, courseId, {
      name: team.name,
      email: team.email,
      force: !!force,
    });

    await db.team.update({
      where: { id: teamId },
      data: {
        lmsUserId:         lmsUserId ?? result?.userId,
        lmsCourseEnrolled: true,
      },
    });

    return NextResponse.json({ success: true, username });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "EptimEdu API error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
