import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { Prisma } from "@prisma/client";
import { isValidSlotScheduleConfig, type SlotScheduleConfig } from "@/lib/walkin-slots";

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { walkInCompetitionId, sessionNumber, slotNumber } = body as {
    walkInCompetitionId?: string; sessionNumber?: number; slotNumber?: number;
  };
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
      walkInSlotSchedule: true,
      _count: { select: { registrations: true } },
    },
  });

  if (!wic || !wic.publishToPortal)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Check slots
  if (wic.maxSlots > 0 && wic._count.registrations >= wic.maxSlots)
    return NextResponse.json({ error: "SLOTS_FULL" }, { status: 409 });

  const { participantId, contingentId } = session;

  // Slot selection required when a slot schedule is configured
  const rawCfg = wic.walkInSlotSchedule;
  const scheduleCfg = isValidSlotScheduleConfig(rawCfg) ? rawCfg : null;
  if (scheduleCfg) {
    const cfg = scheduleCfg;
    const validSession = Number.isInteger(sessionNumber) && sessionNumber! >= 1 && sessionNumber! <= cfg.totalSessions;
    const validSlot    = Number.isInteger(slotNumber)    && slotNumber!    >= 1 && slotNumber!    <= cfg.slotsPerSession;
    if (!validSession || !validSlot)
      return NextResponse.json({ error: "SLOT_REQUIRED" }, { status: 400 });

    const [takenReg, takenSub] = await Promise.all([
      db.walkInRegistration.findFirst({
        where: {
          walkInCompetitionId,
          sessionNumber: sessionNumber!,
          slotNumber: slotNumber!,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { id: true },
      }),
      db.walkInFormSubmission.findFirst({
        where: {
          walkInCompetitionId,
          sessionNumber: sessionNumber!,
          slotNumber: slotNumber!,
          status: "PENDING",
        },
        select: { id: true },
      }),
    ]);
    if (takenReg || takenSub) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  }

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
        ...(scheduleCfg && { sessionNumber: sessionNumber!, slotNumber: slotNumber! }),
      },
      select: { id: true, status: true, sessionNumber: true, slotNumber: true },
    });
    return NextResponse.json({ data: reg }, { status: 201 });
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
