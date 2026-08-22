import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// POST — process a pending form submission
// body: { action: "match", participantId } | { action: "no_match" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, subId } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const sub = await db.walkInFormSubmission.findFirst({
    where: { id: subId, endpoint: { eventId: id } },
    select: {
      id: true, status: true, walkInCompetitionId: true,
      sessionNumber: true, slotNumber: true,
      walkInCompetition: {
        select: { event: { select: { walkInUniqueParticipation: true } } },
      },
    },
  });
  if (!sub) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (sub.status !== "PENDING")
    return NextResponse.json({ error: "ALREADY_PROCESSED" }, { status: 409 });

  if (action === "no_match") {
    await db.walkInFormSubmission.update({
      where: { id: sub.id },
      data: { status: "NO_MATCH", processedAt: new Date() },
    });
    return NextResponse.json({ success: true, status: "NO_MATCH" });
  }

  if (action !== "match" || !body.participantId)
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where: { id: body.participantId },
    select: { id: true, contingentId: true },
  });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  // Penyertaan Unik: one active walk-in registration per participant per event
  if (sub.walkInCompetition.event.walkInUniqueParticipation) {
    const existing = await db.walkInRegistration.findFirst({
      where: {
        participantId: participant.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        walkInCompetition: { eventId: id },
      },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "UNIQUE_PARTICIPATION" }, { status: 409 });
  }

  // Slot must still be free (the submission's own PENDING reservation is excluded by status change)
  if (sub.sessionNumber != null && sub.slotNumber != null) {
    const taken = await db.walkInRegistration.findFirst({
      where: {
        walkInCompetitionId: sub.walkInCompetitionId,
        sessionNumber: sub.sessionNumber,
        slotNumber: sub.slotNumber,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  }

  try {
    const [reg] = await db.$transaction([
      db.walkInRegistration.create({
        data: {
          walkInCompetitionId: sub.walkInCompetitionId,
          participantId: participant.id,
          contingentId: participant.contingentId,
          status: "CONFIRMED",
          method: "COUNTER",
          confirmedAt: new Date(),
          ...(sub.sessionNumber != null && sub.slotNumber != null && {
            sessionNumber: sub.sessionNumber,
            slotNumber: sub.slotNumber,
          }),
        },
        select: { id: true, status: true },
      }),
      db.walkInFormSubmission.update({
        where: { id: sub.id },
        data: {
          status: "PROCESSED",
          participantId: participant.id,
          processedAt: new Date(),
        },
      }),
    ]);

    await db.walkInFormSubmission.update({
      where: { id: sub.id },
      data: { walkInRegistrationId: reg.id },
    });

    return NextResponse.json({ success: true, status: "PROCESSED", registrationId: reg.id });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined) ?? [];
      if (target.includes("sessionNumber"))
        return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
      return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });
    }
    throw e;
  }
}
