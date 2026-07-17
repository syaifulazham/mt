import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * POST /api/v2/organizer/events/[id]/attendance/scan
 * Body: { code: string }  — raw QR / barcode value (expected to be a contingentId)
 *
 * 1. Verify organizer session.
 * 2. Find contingent by id = code.
 * 3. Mark all TeamEvent rows for this contingent + event as attended (updateMany).
 * 4. Return summary: contingentName, logoUrl, teams, participants, trainers, attendedAt.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as { code?: string };
  const code = body.code?.trim();

  if (!code) return NextResponse.json({ error: "MISSING_CODE" }, { status: 400 });

  // Try to resolve as a contingentId
  const contingent = await db.contingent.findUnique({
    where: { id: code },
    select: {
      id: true,
      name: true,
      shortName: true,
      logoUrl: true,
      _count: { select: { trainers: true } },
    },
  });

  if (!contingent) return NextResponse.json({ error: "CONTINGENT_NOT_FOUND" }, { status: 404 });

  const now = new Date();

  // Mark all teams of this contingent in this event as attended
  const { count } = await db.teamEvent.updateMany({
    where: {
      eventId,
      team: { contingentId: contingent.id },
    },
    data: { attendedAt: now },
  });

  if (count === 0) {
    return NextResponse.json({ error: "NO_TEAMS_REGISTERED" }, { status: 404 });
  }

  // Compute participant count (sum member counts across teams in this event)
  const teamEvents = await db.teamEvent.findMany({
    where: { eventId, team: { contingentId: contingent.id } },
    select: { team: { select: { _count: { select: { members: true } } } } },
  });

  const participants = teamEvents.reduce((s, te) => s + te.team._count.members, 0);

  return NextResponse.json({
    contingentName: contingent.shortName ?? contingent.name,
    logoUrl:        contingent.logoUrl,
    teams:          count,
    participants,
    trainers:       contingent._count.trainers,
    attendedAt:     now.toISOString(),
  });
}
