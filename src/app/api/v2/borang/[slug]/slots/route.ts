import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSlotSchedule, isValidSlotScheduleConfig, type SlotScheduleConfig } from "@/lib/walkin-slots";

// GET /api/v2/borang/[slug]/slots?competitionId=... — public slot availability (no auth)
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
    select: { walkInSlotSchedule: true },
  });
  const rawCfg = wic?.walkInSlotSchedule;
  if (!wic || !isValidSlotScheduleConfig(rawCfg))
    return NextResponse.json({ error: "NO_SCHEDULE" }, { status: 400 });

  const cfg: SlotScheduleConfig = rawCfg;

  const [regs, subs] = await Promise.all([
    db.walkInRegistration.findMany({
      where: {
        walkInCompetitionId: wicId,
        status: { in: ["PENDING", "CONFIRMED"] },
        sessionNumber: { not: null },
      },
      select: { sessionNumber: true, slotNumber: true },
    }),
    db.walkInFormSubmission.findMany({
      where: {
        walkInCompetitionId: wicId,
        status: "PENDING",
        sessionNumber: { not: null },
      },
      select: { sessionNumber: true, slotNumber: true },
    }),
  ]);
  const booked = [...regs, ...subs];

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
