import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { quizzlyConfigured, quizzlyErrorMessage, quizzlyUpsertParticipant } from "@/lib/asiaspark-quizzly";

/** Quizzly's `personal_id` is unique per org; the IC is the natural key here. */
function toPersonalId(ic: string): string {
  return ic.replace(/\D/g, "").slice(0, 64);
}

// POST /api/v2/participant/quizzly/register — create the Quizzly participant
export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!quizzlyConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, name: true, ic: true, email: true, age: true, gender: true, classGrade: true,
      contingent: { select: { name: true } },
      quizzlyAccess: true,
    },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const personalId = toPersonalId(participant.ic ?? "");
  if (!personalId)
    return NextResponse.json(
      { error: "Nombor kad pengenalan diperlukan sebelum mendaftar Asia Spark Quiz. Kemas kini profil anda." },
      { status: 400 },
    );

  try {
    // upsert=true upstream, so re-registering after a failure is harmless.
    const created = await quizzlyUpsertParticipant({
      personalId,
      fullName:    participant.name,
      grade:       participant.classGrade,
      school:      participant.contingent?.name ?? null,
      nationality: "MY",
      email:       participant.email,
      age:         participant.age,
      gender:      participant.gender === "MALE" ? "male" : participant.gender === "FEMALE" ? "female" : null,
    });

    const access = await db.participantQuizzlyAccess.upsert({
      where:  { participantId: participant.id },
      create: { participantId: participant.id, quizzlyParticipantId: created.id, personalId },
      update: { quizzlyParticipantId: created.id, personalId },
    });

    return NextResponse.json({ ok: true, personalId: access.personalId });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[quizzly] register failed for participant ${participant.id} (${personalId}):`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    return NextResponse.json({ error: quizzlyErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
