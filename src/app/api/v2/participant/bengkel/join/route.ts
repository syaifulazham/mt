import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "LMS_NOT_CONFIGURED" }, { status: 503 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { name: true, ic: true, eduLevel: true, ppki: true },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (!participant.ic)
    return NextResponse.json({ error: "NO_IC" }, { status: 422 });

  const icDigits = participant.ic.replace(/\D/g, "");
  const username = icDigits;
  const password = participant.name.trim().slice(0, 2).toLowerCase() + icDigits.slice(0, 6);

  // Check whether an LMS account already exists (to populate the `created` flag)
  const existsBefore = await eptimEdu.userExists(username).then(r => !!r?.exists).catch(() => false);

  // Enroll in competition LMS courses matching the participant's target group.
  // enrol() auto-provisions the user if the account doesn't exist yet.
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

  const courseIds = [...new Set(competitions.map(c => c.eptimEduCourseId!))];
  let enrolled = 0;
  await Promise.allSettled(
    courseIds.map(async courseId => {
      try {
        await eptimEdu.enrol(username, courseId, { password, name: participant.name });
        enrolled++;
      } catch (e: unknown) {
        console.warn("[bengkel/join] enrol error for course", courseId, e instanceof Error ? e.message : e);
      }
    })
  );

  return NextResponse.json({ username, created: !existsBefore, enrolled });
}
