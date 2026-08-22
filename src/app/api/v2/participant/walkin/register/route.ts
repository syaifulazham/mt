import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { walkInCompetitionId } = body as { walkInCompetitionId?: string };
  if (!walkInCompetitionId)
    return NextResponse.json({ error: "MISSING_WALK_IN_COMPETITION_ID" }, { status: 400 });

  // Verify EventWalkInCompetition exists and is published to portal
  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: walkInCompetitionId },
    select: {
      id: true,
      maxSlots: true,
      publishToPortal: true,
      event: { select: { id: true, walkInUniqueParticipation: true } },
      _count: { select: { registrations: true } },
    },
  });

  if (!wic || !wic.publishToPortal)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Check slots
  if (wic.maxSlots > 0 && wic._count.registrations >= wic.maxSlots)
    return NextResponse.json({ error: "SLOTS_FULL" }, { status: 409 });

  const { participantId, contingentId } = session;

  // Penyertaan Unik: one active walk-in registration per participant per event
  if (wic.event.walkInUniqueParticipation) {
    const existing = await db.walkInRegistration.findFirst({
      where: {
        participantId,
        status: { in: ["PENDING", "CONFIRMED"] },
        walkInCompetition: { eventId: wic.event.id },
      },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "UNIQUE_PARTICIPATION" }, { status: 409 });
  }

  try {
    const reg = await db.walkInRegistration.create({
      data: {
        walkInCompetitionId,
        participantId,
        contingentId,
        status: "PENDING",
        method: "PORTAL",
      },
      select: { id: true, status: true },
    });
    return NextResponse.json({ data: reg }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });
    throw e;
  }
}
