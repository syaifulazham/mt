import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// POST /api/v2/walkin/[slug]/form-process — counter processes a pending public-form submission
// body: { submissionId, participantId, passcode }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { submissionId, participantId, passcode } = await req.json();

  if (!submissionId || !participantId)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const endpoint = await db.walkInEndpoint.findUnique({
    where: { routeSlug: slug },
    select: {
      passcode: true, active: true, eventId: true,
      event: { select: { walkInUniqueParticipation: true } },
    },
  });
  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.passcode || endpoint.passcode !== passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  const sub = await db.walkInFormSubmission.findFirst({
    where: { id: submissionId, endpoint: { eventId: endpoint.eventId } },
    select: {
      id: true, status: true, walkInCompetitionId: true,
      sessionNumber: true, slotNumber: true,
    },
  });
  if (!sub) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (sub.status !== "PENDING")
    return NextResponse.json({ error: "ALREADY_PROCESSED" }, { status: 409 });

  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { id: true, contingentId: true },
  });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  // Penyertaan Unik: one active walk-in registration per participant per event
  if (endpoint.event.walkInUniqueParticipation) {
    const existing = await db.walkInRegistration.findFirst({
      where: {
        participantId,
        status: { in: ["PENDING", "CONFIRMED"] },
        walkInCompetition: { eventId: endpoint.eventId },
      },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "UNIQUE_PARTICIPATION" }, { status: 409 });
  }

  // Slot must still be free (submission's own reservation is excluded as it becomes PROCESSED)
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
    const reg = await db.walkInRegistration.create({
      data: {
        walkInCompetitionId: sub.walkInCompetitionId,
        participantId,
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
    });
    await db.walkInFormSubmission.update({
      where: { id: sub.id },
      data: {
        status: "PROCESSED",
        participantId,
        walkInRegistrationId: reg.id,
        processedAt: new Date(),
      },
    });
    return NextResponse.json({ data: { registrationId: reg.id, status: reg.status } }, { status: 201 });
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
