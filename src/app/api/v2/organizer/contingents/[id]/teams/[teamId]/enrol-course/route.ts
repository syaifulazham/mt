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
  const { courseId } = await req.json();

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
    const result = await eptimEdu.enrol(username, courseId, { name: team.name });

    if (!result?.userId)
      throw new Error("Enrolment call succeeded but EptimEdu returned no userId.");

    await db.team.update({
      where: { id: teamId },
      data: {
        lmsUserId:         team.lmsUserId ?? result.userId,
        lmsCourseEnrolled: true,
      },
    });

    return NextResponse.json({ success: true, username });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "EptimEdu API error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
