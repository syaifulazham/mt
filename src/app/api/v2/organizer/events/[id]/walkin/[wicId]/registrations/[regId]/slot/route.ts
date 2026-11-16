import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { claimSlot, isSlotConflict, slotAvailabilityResponse, slotDatesOf } from "@/lib/walkin-slot-server";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
type P = { params: Promise<{ id: string; wicId: string; regId: string }> };

async function load(eventId: string, wicId: string, regId: string) {
  const reg = await db.walkInRegistration.findFirst({
    where: { id: regId, walkInCompetitionId: wicId, walkInCompetition: { eventId } },
    select: {
      id: true, status: true, slotDate: true, sessionNumber: true, slotNumber: true,
      walkInCompetition: { select: { walkInSlotSchedule: true, event: { select: { startDate: true, endDate: true } } } },
    },
  });
  if (!reg) return null;
  const raw = reg.walkInCompetition.walkInSlotSchedule;
  return { reg, cfg: isValidSlotScheduleConfig(raw) ? raw : null, event: reg.walkInCompetition.event };
}

// GET ?date=YYYY-MM-DD — the schedule, open dates and booked slots for picking
// this registration's slot.
export async function GET(req: NextRequest, { params }: P) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId, regId } = await params;
  const x = await load(id, wicId, regId);
  if (!x) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!x.cfg) return NextResponse.json({ error: "Jadual slot belum ditetapkan" }, { status: 400 });
  const date = new URL(req.url).searchParams.get("date");
  const data = await slotAvailabilityResponse(wicId, x.cfg, x.event, date);
  return NextResponse.json({
    data: { ...data, current: { slotDate: x.reg.slotDate, sessionNumber: x.reg.sessionNumber, slotNumber: x.reg.slotNumber } },
  });
}

// PATCH { slotDate?, sessionNumber, slotNumber } — give the registration a
// slot (or move it to another free one).
export async function PATCH(req: NextRequest, { params }: P) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, wicId, regId } = await params;
  const x = await load(id, wicId, regId);
  if (!x) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!x.cfg) return NextResponse.json({ error: "Jadual slot belum ditetapkan" }, { status: 400 });
  if (x.reg.status !== "PENDING" && x.reg.status !== "CONFIRMED")
    return NextResponse.json({ error: "Hanya pendaftaran aktif boleh diberi slot" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const same = body.slotDate === x.reg.slotDate && body.sessionNumber === x.reg.sessionNumber && body.slotNumber === x.reg.slotNumber;
  if (same) return NextResponse.json({ data: { slotDate: x.reg.slotDate, sessionNumber: x.reg.sessionNumber, slotNumber: x.reg.slotNumber } });

  const claim = await claimSlot(wicId, x.cfg, slotDatesOf(x.event, x.cfg), body);
  if ("error" in claim) {
    const msg = claim.error === "SLOT_TAKEN" ? "Slot ini sudah diambil" : claim.error === "DATE_REQUIRED" ? "Pilih tarikh yang dibuka" : "Pilih sesi dan slot";
    return NextResponse.json({ error: msg }, { status: claim.status });
  }
  const slot = claim.slot!;
  try {
    await db.walkInRegistration.update({ where: { id: regId }, data: slot });
  } catch (e) {
    if (isSlotConflict(e)) return NextResponse.json({ error: "Slot ini sudah diambil" }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ data: slot });
}
