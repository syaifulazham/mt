import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { heldSlot, isSlotConflict, slotDatesOf, slotTaken } from "@/lib/walkin-slot-server";
import { cleanIc, registrationHasIc, submissionHasIc } from "@/lib/walkin-team";

// POST { walkInCompetitionId, slotDate } — a participant whose walk-in entry
// has no date (booked before the event had a date step) picks one. Only an
// undated entry can be dated here; the session/slot must be free on that date.
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.walkInCompetitionId !== "string" || typeof body.slotDate !== "string")
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: body.walkInCompetitionId },
    select: { id: true, publishToPortal: true, walkInSlotSchedule: true, event: { select: { startDate: true, endDate: true } } },
  });
  if (!wic || !wic.publishToPortal) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const cfg = isValidSlotScheduleConfig(wic.walkInSlotSchedule) ? wic.walkInSlotSchedule : null;
  if (!cfg || !slotDatesOf(wic.event, cfg).includes(body.slotDate))
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });

  const selfIc = cleanIc(session.ic ?? "");
  const pick = { slotDate: true, sessionNumber: true, slotNumber: true, id: true } as const;
  const reg = await db.walkInRegistration.findFirst({
    where: {
      walkInCompetitionId: wic.id, status: { in: ["PENDING", "CONFIRMED"] },
      OR: [
        { participantId: session.participantId },
        { team: { members: { some: { participantId: session.participantId } } } },
        ...(selfIc ? [registrationHasIc(selfIc)] : []),
      ],
    },
    select: pick,
  });
  const sub = reg ? null : selfIc
    ? await db.walkInFormSubmission.findFirst({ where: { walkInCompetitionId: wic.id, status: "PENDING", ...submissionHasIc(selfIc) }, select: pick })
    : null;
  const entry = reg ?? sub;
  if (!entry) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });
  if (entry.slotDate) return NextResponse.json({ error: "DATE_ALREADY_SET" }, { status: 409 });

  const slot = heldSlot({ ...entry, slotDate: body.slotDate });
  if (slot && await slotTaken(wic.id, slot)) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  try {
    const where = { id: entry.id, slotDate: "" };
    const r = reg
      ? await db.walkInRegistration.updateMany({ where, data: { slotDate: body.slotDate } })
      : await db.walkInFormSubmission.updateMany({ where, data: { slotDate: body.slotDate } });
    if (r.count === 0) return NextResponse.json({ error: "DATE_ALREADY_SET" }, { status: 409 });
  } catch (e) {
    if (isSlotConflict(e)) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ data: { slotDate: body.slotDate } });
}
