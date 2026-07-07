import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * POST — Register all "selected" teams from this event's prerequisite event
 * into the current event.  Skips teams already registered.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { prerequisiteEventId: true },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (!event.prerequisiteEventId)
    return NextResponse.json({ error: "NO_PREREQUISITE" }, { status: 400 });

  // Fetch selected teams from the prerequisite event
  const selectedTeamEvents = await db.teamEvent.findMany({
    where: { eventId: event.prerequisiteEventId, selected: true },
    select: { teamId: true },
  });

  if (selectedTeamEvents.length === 0)
    return NextResponse.json({ added: 0, skipped: 0 });

  const teamIds = selectedTeamEvents.map((te) => te.teamId);

  // Find which are already registered to the current event
  const existing = await db.teamEvent.findMany({
    where: { eventId, teamId: { in: teamIds } },
    select: { teamId: true },
  });
  const existingIds = new Set(existing.map((e) => e.teamId));
  const toAdd = teamIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await db.teamEvent.createMany({
      data: toAdd.map((teamId) => ({ teamId, eventId })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    added:   toAdd.length,
    skipped: existingIds.size,
  });
}
