import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * GET — Teams registered in this event that were NOT selected in any prerequisite event.
 *
 * Use-case: after prerequisite selection, teams that were rejected (selected=false)
 * may still be registered in the next event. This endpoint identifies them so the
 * organizer can bulk-remove them.
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
        select: { prerequisite: { select: { id: true, name: true } } },
      },
    },
  });

  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (event.prerequisites.length === 0)
    return NextResponse.json({ count: 0, teams: [] });

  const prereqIds = event.prerequisites.map((p) => p.prerequisite.id);

  // Teams registered in THIS event
  const thisEventTeamIds = (
    await db.teamEvent.findMany({
      where: { eventId },
      select: { teamId: true },
    })
  ).map((te) => te.teamId);

  if (thisEventTeamIds.length === 0)
    return NextResponse.json({ count: 0, teams: [] });

  // Teams that appear in any prerequisite event
  const prereqTeamEvents = await db.teamEvent.findMany({
    where: {
      eventId: { in: prereqIds },
      teamId: { in: thisEventTeamIds },
    },
    select: { teamId: true, selected: true },
  });

  // A team is "selected" if it appears with selected=true in at least one prereq event
  const selectedInPrereq = new Set(
    prereqTeamEvents.filter((te) => te.selected).map((te) => te.teamId),
  );

  // Teams that appear in prereqs but were NEVER selected (i.e. always selected=false)
  const appearedInPrereq = new Set(prereqTeamEvents.map((te) => te.teamId));
  const unselectedIds = [...appearedInPrereq].filter(
    (id) => !selectedInPrereq.has(id),
  );

  if (unselectedIds.length === 0)
    return NextResponse.json({ count: 0, teams: [] });

  // Fetch team details
  const teams = await db.team.findMany({
    where: { id: { in: unselectedIds } },
    select: {
      id: true,
      name: true,
      contingent: {
        select: {
          name: true,
          school: { select: { name: true } },
          higherInstitution: { select: { name: true } },
        },
      },
    },
  });

  const result = teams.map((t) => ({
    id: t.id,
    teamName: t.name,
    contingentName:
      t.contingent?.name ??
      t.contingent?.school?.name ??
      t.contingent?.higherInstitution?.name ??
      null,
  }));

  return NextResponse.json({ count: result.length, teams: result });
}
