import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { slotAvailabilityResponse } from "@/lib/walkin-slot-server";

// GET /api/v2/participant/walkin/slots?walkInCompetitionId=...&date=YYYY-MM-DD
// Returns the slot schedule config, the event's dates (multi-day events) and
// booked slots per session on that date for the picker UI.
export async function GET(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const wicId = req.nextUrl.searchParams.get("walkInCompetitionId");
  if (!wicId) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId },
    select: { publishToPortal: true, walkInSlotSchedule: true, event: { select: { startDate: true, endDate: true } } },
  });
  if (!wic || !wic.publishToPortal) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const rawCfg = wic.walkInSlotSchedule;
  if (!isValidSlotScheduleConfig(rawCfg))
    return NextResponse.json({ error: "NO_SCHEDULE" }, { status: 400 });

  return NextResponse.json(await slotAvailabilityResponse(wicId, rawCfg, wic.event, req.nextUrl.searchParams.get("date")));
}
