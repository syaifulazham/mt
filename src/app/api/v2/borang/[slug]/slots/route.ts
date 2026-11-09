import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { slotAvailabilityResponse } from "@/lib/walkin-slot-server";

// GET /api/v2/borang/[slug]/slots?competitionId=...&date=YYYY-MM-DD — public slot availability (no auth)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const wicId = req.nextUrl.searchParams.get("competitionId");
  if (!wicId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });

  const endpoint = await db.walkInFormEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { active: true, eventId: true },
  });
  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId, eventId: endpoint.eventId },
    select: { walkInSlotSchedule: true, event: { select: { startDate: true, endDate: true } } },
  });
  const rawCfg = wic?.walkInSlotSchedule;
  if (!wic || !isValidSlotScheduleConfig(rawCfg))
    return NextResponse.json({ error: "NO_SCHEDULE" }, { status: 400 });

  return NextResponse.json(await slotAvailabilityResponse(wicId, rawCfg, wic.event, req.nextUrl.searchParams.get("date")));
}
