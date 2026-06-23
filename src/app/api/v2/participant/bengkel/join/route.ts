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

  // Create LMS account if it doesn't exist
  let created = false;
  try {
    let exists = false;
    try {
      const check = await eptimEdu.userExists(username);
      exists = !!check?.exists;
    } catch (e: unknown) {
      // Some LMS implementations return 404 for non-existent users
      if ((e as { status?: number }).status !== 404) throw e;
      exists = false;
    }

    if (!exists) {
      await eptimEdu.createUser({ username, password, name: participant.name });
      created = true;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "LMS account creation failed";
    console.error("[bengkel/join] account error:", msg, { username });
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Enroll in competition LMS courses matching the participant's target group
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
        await eptimEdu.enrol(username, courseId);
        enrolled++;
      } catch (e: unknown) {
        // 409 = already enrolled — expected and harmless
        if ((e as { status?: number }).status !== 409) {
          console.warn("[bengkel/join] enrol error for course", courseId, e instanceof Error ? e.message : e);
        }
      }
    })
  );

  return NextResponse.json({ username, created, enrolled });
}
