import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

/** POST { courseId } — enrol the participant in one LMS course */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const { courseId } = await req.json() as { courseId: string };
  if (!courseId) return NextResponse.json({ error: "MISSING_COURSE_ID" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { ic: true },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const icDigits = participant.ic?.replace(/\D/g, "") ?? "";
  if (!icDigits) return NextResponse.json({ error: "NO_IC" }, { status: 400 });

  try {
    await eptimEdu.enrol(icDigits, courseId);
    return NextResponse.json({ ok: true, courseId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Enrolment failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
