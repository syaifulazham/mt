import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { buildSlotSchedule, isValidSlotScheduleConfig, type SlotScheduleConfig } from "@/lib/walkin-slots";

// GET /api/v2/participant/walkin/slots?walkInCompetitionId=...
// Returns the slot schedule config + booked slots per session for the picker UI.
export async function GET(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const wicId = req.nextUrl.searchParams.get("walkInCompetitionId");
  if (!wicId) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId },
    select: { publishToPortal: true, walkInSlotSchedule: true },
  });
  if (!wic || !wic.publishToPortal) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const rawCfg = wic.walkInSlotSchedule;
  if (!isValidSlotScheduleConfig(rawCfg))
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
