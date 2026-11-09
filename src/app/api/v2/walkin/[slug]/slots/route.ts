import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { slotAvailabilityResponse } from "@/lib/walkin-slot-server";

// GET /api/v2/walkin/[slug]/slots?passcode=...&competitionId=...&date=YYYY-MM-DD
// Counter-facing slot availability (booked slots per session).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sp = req.nextUrl.searchParams;
  const passcode = sp.get("passcode");
  const competitionId = sp.get("competitionId");

  const endpoint = await db.walkInEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { passcode: true, active: true, walkInCompetitionId: true, eventId: true },
  });
  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.passcode || endpoint.passcode !== passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  const wicId = endpoint.walkInCompetitionId ?? competitionId;
  if (!wicId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId, eventId: endpoint.eventId },
    select: { walkInSlotSchedule: true, event: { select: { startDate: true, endDate: true } } },
  });
  const rawCfg = wic?.walkInSlotSchedule;
  if (!wic || !isValidSlotScheduleConfig(rawCfg))
    return NextResponse.json({ error: "NO_SCHEDULE" }, { status: 400 });

  return NextResponse.json(await slotAvailabilityResponse(wicId, rawCfg, wic.event, sp.get("date")));
}
