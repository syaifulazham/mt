import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * GET — Lightweight check: are all "selected" teams from prerequisite events
 *       already registered in this event?
 *
 * Returns per-prerequisite counts so the UI can show a tally banner.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      prerequisites: {
        select: {
          prerequisite: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (event.prerequisites.length === 0)
    return NextResponse.json({ isTallied: true, prerequisites: [], totalSelected: 0, totalRegistered: 0, missing: 0 });

  // Collect all teams marked `selected=true` in each prerequisite event
  const prereqIds = event.prerequisites.map((p) => p.prerequisite.id);

  const selectedTeamEvents = await db.teamEvent.findMany({
    where: { eventId: { in: prereqIds }, selected: true },
    select: { teamId: true, eventId: true },
  });

  // Unique team IDs across all prerequisites
  const allSelectedIds = [...new Set(selectedTeamEvents.map((te) => te.teamId))];

  // Which of those are already in the current event?
  const registeredSet = new Set(
    (await db.teamEvent.findMany({
      where: { eventId, teamId: { in: allSelectedIds } },
      select: { teamId: true },
    })).map((te) => te.teamId),
  );

  // Build per-prerequisite summary
  const perPrereq = event.prerequisites.map((p) => {
    const pid = p.prerequisite.id;
    const selectedForThis = selectedTeamEvents
      .filter((te) => te.eventId === pid)
      .map((te) => te.teamId);
    const uniqueSelected   = [...new Set(selectedForThis)];
    const registeredCount  = uniqueSelected.filter((id) => registeredSet.has(id)).length;
    const missingCount     = uniqueSelected.length - registeredCount;
    return {
      id:             pid,
      name:           p.prerequisite.name,
      slug:           p.prerequisite.slug,
      selectedCount:  uniqueSelected.length,
      registeredCount,
      missingCount,
    };
  });

  const totalSelected   = allSelectedIds.length;
  const totalRegistered = allSelectedIds.filter((id) => registeredSet.has(id)).length;
  const missing         = totalSelected - totalRegistered;

  return NextResponse.json({
    isTallied:    missing === 0,
    totalSelected,
    totalRegistered,
    missing,
    prerequisites: perPrereq,
  });
}
