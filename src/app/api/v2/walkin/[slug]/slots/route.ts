import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSlotSchedule, isValidSlotScheduleConfig, type SlotScheduleConfig } from "@/lib/walkin-slots";

// GET /api/v2/walkin/[slug]/slots?passcode=...&competitionId=...
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
    select: { walkInSlotSchedule: true },
  });
  const rawCfg = wic?.walkInSlotSchedule;
  if (!wic || !isValidSlotScheduleConfig(rawCfg))
    return NextResponse.json({ error: "NO_SCHEDULE" }, { status: 400 });

  const cfg: SlotScheduleConfig = rawCfg;

  const booked = await db.walkInRegistration.findMany({
    where: {
      walkInCompetitionId: wicId,
      status: { in: ["PENDING", "CONFIRMED"] },
      sessionNumber: { not: null },
    },
    select: { sessionNumber: true, slotNumber: true },
  });

  const sessions = buildSlotSchedule(cfg)
    .filter((b): b is Extract<typeof b, { type: "session" }> => b.type === "session")
    .map((b) => ({
      n: b.n,
      start: b.start,
      end: b.end,
      booked: booked.filter((r) => r.sessionNumber === b.n).map((r) => r.slotNumber),
    }));

  return NextResponse.json({ config: cfg, sessions });
}
