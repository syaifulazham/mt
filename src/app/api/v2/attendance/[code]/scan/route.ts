import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/v2/attendance/[code]/scan
 * Public — passcode gated.
 * Body: { contingentId: string, passcode: string }
 *
 * Validates passcode against AttendanceEndpoint, then marks all
 * TeamEvent rows for the contingent in the event as attended.
 * Returns greeting data.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => ({})) as {
    contingentId?: string;
    passcode?: string;
  };

  const endpoint = await db.attendanceEndpoint.findUnique({
    where: { routeCode: code },
    select: { id: true, passcode: true, active: true, eventId: true },
  });

  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.active) return NextResponse.json({ error: "ENDPOINT_RETIRED" }, { status: 410 });
  if (body.passcode !== endpoint.passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  const scannedCode = body.contingentId?.trim();
  if (!scannedCode) return NextResponse.json({ error: "MISSING_CODE" }, { status: 400 });

  // Resolve as contingentId
  const contingent = await db.contingent.findUnique({
    where: { id: scannedCode },
    select: {
      id: true, name: true, shortName: true, logoUrl: true,
      _count: { select: { trainers: true } },
    },
  });

  if (!contingent) return NextResponse.json({ error: "CONTINGENT_NOT_FOUND" }, { status: 404 });

  const now = new Date();

  const { count } = await db.teamEvent.updateMany({
    where: { eventId: endpoint.eventId, team: { contingentId: contingent.id }, acceptance: "ACCEPT" },
    data: { attendedAt: now },
  });

  if (count === 0)
    return NextResponse.json({ error: "NO_TEAMS_REGISTERED" }, { status: 404 });

  const teamEvents = await db.teamEvent.findMany({
    where: { eventId: endpoint.eventId, team: { contingentId: contingent.id }, acceptance: "ACCEPT" },
    select: { team: { select: { _count: { select: { members: true } } } } },
  });
  const participants = teamEvents.reduce((s, te) => s + te.team._count.members, 0);

  return NextResponse.json({
    contingentName: contingent.name,
    contingentShortName: contingent.shortName ?? null,
    logoUrl:        contingent.logoUrl,
    teams:          count,
    participants,
    trainers:       contingent._count.trainers,
    attendedAt:     now.toISOString(),
  });
}
