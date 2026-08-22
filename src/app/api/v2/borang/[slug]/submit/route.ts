import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";

// POST /api/v2/borang/[slug]/submit — public walk-in form submission (no auth)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const { competitionId, name, schoolName, sessionNumber, slotNumber } = body;
  const ic = typeof body.ic === "string" ? body.ic.replace(/[\s-]/g, "") : "";

  if (!competitionId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });
  if (!ic || !/^\d{6,12}$/.test(ic))
    return NextResponse.json({ error: "INVALID_IC" }, { status: 400 });
  if (typeof name !== "string" || name.trim().length < 3)
    return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });

  const endpoint = await db.walkInFormEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { id: true, active: true, eventId: true },
  });
  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: competitionId, eventId: endpoint.eventId },
    select: { id: true, walkInSlotSchedule: true },
  });
  if (!wic) return NextResponse.json({ error: "COMPETITION_NOT_FOUND" }, { status: 404 });

  // One active submission per IC + competition (NO_MATCH does not block re-submission)
  const dup = await db.walkInFormSubmission.findFirst({
    where: {
      walkInCompetitionId: wic.id,
      ic,
      status: { in: ["PENDING", "PROCESSED"] },
    },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ error: "DUPLICATE_SUBMISSION" }, { status: 409 });

  // Slot selection required when a slot schedule is configured
  const rawCfg = wic.walkInSlotSchedule;
  const scheduleCfg = isValidSlotScheduleConfig(rawCfg) ? rawCfg : null;
  if (scheduleCfg) {
    const validSession = Number.isInteger(sessionNumber) && sessionNumber >= 1 && sessionNumber <= scheduleCfg.totalSessions;
    const validSlot    = Number.isInteger(slotNumber)    && slotNumber    >= 1 && slotNumber    <= scheduleCfg.slotsPerSession;
    if (!validSession || !validSlot)
      return NextResponse.json({ error: "SLOT_REQUIRED" }, { status: 400 });

    const [takenReg, takenSub] = await Promise.all([
      db.walkInRegistration.findFirst({
        where: {
          walkInCompetitionId: wic.id,
          sessionNumber, slotNumber,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { id: true },
      }),
      db.walkInFormSubmission.findFirst({
        where: {
          walkInCompetitionId: wic.id,
          sessionNumber, slotNumber,
          status: "PENDING",
        },
        select: { id: true },
      }),
    ]);
    if (takenReg || takenSub) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  }

  try {
    const sub = await db.walkInFormSubmission.create({
      data: {
        endpointId: endpoint.id,
        walkInCompetitionId: wic.id,
        ic,
        name: name.trim().toUpperCase(),
        schoolName: typeof schoolName === "string" && schoolName.trim() ? schoolName.trim() : null,
        ...(scheduleCfg && { sessionNumber, slotNumber }),
      },
      select: { id: true, status: true, sessionNumber: true, slotNumber: true },
    });
    return NextResponse.json({ data: sub }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined) ?? [];
      if (target.includes("sessionNumber"))
        return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
      return NextResponse.json({ error: "DUPLICATE_SUBMISSION" }, { status: 409 });
    }
    throw e;
  }
}
