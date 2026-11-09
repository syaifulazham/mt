import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { heldSlot, isSlotConflict, slotDatesOf, slotTaken } from "@/lib/walkin-slot-server";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

// PATCH { slotDate } — set the date of a pending entry (multi-day events). The
// date must be one of its competition's open dates, and its session/slot must
// be free on that date.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, subId } = await params;
  const body = await req.json().catch(() => ({}));

  const sub = await db.walkInFormSubmission.findFirst({
    where: { id: subId, walkInCompetition: { eventId: id } },
    select: {
      id: true, status: true, walkInCompetitionId: true, slotDate: true, sessionNumber: true, slotNumber: true,
      walkInCompetition: { select: { walkInSlotSchedule: true, event: { select: { startDate: true, endDate: true } } } },
    },
  });
  if (!sub) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (sub.status !== "PENDING") return NextResponse.json({ error: "ALREADY_PROCESSED" }, { status: 409 });
  const cfg = isValidSlotScheduleConfig(sub.walkInCompetition.walkInSlotSchedule) ? sub.walkInCompetition.walkInSlotSchedule : null;
  const dates = cfg ? slotDatesOf(sub.walkInCompetition.event, cfg) : [];
  if (typeof body.slotDate !== "string" || !dates.includes(body.slotDate))
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  if (body.slotDate === sub.slotDate) return NextResponse.json({ data: { slotDate: sub.slotDate } });

  const slot = heldSlot({ ...sub, slotDate: body.slotDate });
  if (slot && await slotTaken(sub.walkInCompetitionId, slot)) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  try {
    await db.walkInFormSubmission.update({ where: { id: sub.id }, data: { slotDate: body.slotDate } });
  } catch (e) {
    if (isSlotConflict(e)) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ data: { slotDate: body.slotDate } });
}

// DELETE — remove a form submission (releases its session-slot)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, subId } = await params;

  const sub = await db.walkInFormSubmission.findFirst({
    where: { id: subId, walkInCompetition: { eventId: id } },
    select: { id: true, status: true },
  });
  if (!sub) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.walkInFormSubmission.delete({ where: { id: sub.id } });

  return NextResponse.json({ deleted: true });
}
