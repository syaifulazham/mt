import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// POST — counter staff registers a participant (immediately CONFIRMED)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { participantId, passcode, registeredBy } = await req.json();

  if (!participantId) return NextResponse.json({ error: "MISSING_PARTICIPANT" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { routeSlug: slug },
    select: { id: true, passcode: true, endpointActive: true, maxSlots: true, _count: { select: { registrations: true } } },
  });

  if (!wic || !wic.endpointActive)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!wic.passcode || wic.passcode !== passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });
  if (wic.maxSlots > 0 && wic._count.registrations >= wic.maxSlots)
    return NextResponse.json({ error: "SLOTS_FULL" }, { status: 409 });

  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { id: true, contingentId: true },
  });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  try {
    const reg = await db.walkInRegistration.create({
      data: {
        walkInCompetitionId: wic.id,
        participantId,
        contingentId: participant.contingentId,
        status:       "CONFIRMED",
        method:       "COUNTER",
        registeredBy: registeredBy?.trim() || null,
        confirmedAt:  new Date(),
      },
    });
    return NextResponse.json({ data: reg }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });
    throw e;
  }
}
