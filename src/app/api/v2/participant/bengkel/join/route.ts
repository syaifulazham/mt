import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!eptimEduConfigured()) {
    return NextResponse.json({ error: "LMS_NOT_CONFIGURED" }, { status: 503 });
  }

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { name: true, ic: true, eduLevel: true, ppki: true },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (!participant.ic) {
    return NextResponse.json({ error: "NO_IC" }, { status: 422 });
  }

  const icDigits  = participant.ic.replace(/\D/g, "");
  const username  = icDigits;
  const password  = participant.name.trim().slice(0, 2).toLowerCase() + icDigits.slice(0, 6);

  // Create LMS account if it doesn't exist
  let created = false;
  try {
    const check = await eptimEdu.userExists(username);
    if (!check?.exists) {
      await eptimEdu.createUser({ username, password, name: participant.name });
      created = true;
    }
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) {
      await eptimEdu.createUser({ username, password, name: participant.name });
      created = true;
    } else {
      throw e;
    }
  }

  // Enroll in all matching competitions' LMS courses
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
    select: { eptimEduCourseId: true, name: true },
  });

  let enrolled = 0;
  for (const comp of competitions) {
    if (!comp.eptimEduCourseId) continue;
    try {
      await eptimEdu.enrol(username, comp.eptimEduCourseId);
      enrolled++;
    } catch (e: unknown) {
      // 409 = already enrolled, ignore
      if ((e as { status?: number }).status !== 409) throw e;
    }
  }

  return NextResponse.json({ username, created, enrolled });
}
