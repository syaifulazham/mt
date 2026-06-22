import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

/** POST — auto-enrol in published non-invite-only courses, then generate SSO login URL */
export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { ic: true, eduLevel: true, ppki: true },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const icDigits = participant.ic?.replace(/\D/g, "") ?? "";
  if (!icDigits) return NextResponse.json({ error: "NO_IC" }, { status: 400 });

  // Auto-enrol in competition LMS courses matching the participant's target group
  try {
    const competitions = await db.competition.findMany({
      where: {
        eptimEduCourseId: { not: null },
        targetGroups: {
          some: {
            targetGroup: {
              schoolLevel: participant.eduLevel,
              ...(participant.ppki ? {} : { ppki: false }),
            },
          },
        },
      },
      select: { eptimEduCourseId: true },
    });

    const courseIds = [...new Set(competitions.map(c => c.eptimEduCourseId!))] ;
    if (courseIds.length > 0) {
      await Promise.allSettled(
        courseIds.map(courseId => eptimEdu.enrol(icDigits, courseId))
      );
    }
  } catch (e) {
    // Non-fatal — proceed to SSO token even if auto-enrol fails
    console.error("[bengkel/signin POST] auto-enrol error:", e);
  }

  // Generate SSO token
  try {
    const result = await eptimEdu.createSsoToken(icDigits);
    return NextResponse.json({ loginUrl: result.loginUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    console.error("[bengkel/signin POST] eptim-edu error:", msg, { icDigits });
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
