import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * GET — Teams registered in this event that were NOT selected in any prerequisite event
 *       (either unselected there, or absent from every prerequisite). Matched by team id.
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

  // Teams registered in THIS event. Rows an administrator added as a wildcard
  // are deliberate exceptions and are never flagged.
  const thisEventRows = await db.teamEvent.findMany({
    where: { eventId },
    select: { teamId: true, wildcard: true },
  });
  const thisEventTeamIds = thisEventRows.filter((te) => !te.wildcard).map((te) => te.teamId);

  if (thisEventTeamIds.length === 0)
    return NextResponse.json({ count: 0, teams: [] });

  // Rows for those teams in any prerequisite event
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
  const appearedInPrereq = new Set(prereqTeamEvents.map((te) => te.teamId));

  // Flag every team that was never selected in a prerequisite, by id. This
  // includes teams that are in no prerequisite at all — e.g. a same-named
  // sibling team of the one that was actually selected.
  const unselectedIds = thisEventTeamIds.filter((id) => !selectedInPrereq.has(id));

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
      members: {
        select: { participant: { select: { name: true } } },
        orderBy: { participant: { name: "asc" } },
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
    memberNames: t.members.map((m) => m.participant.name),
    /** NOT_SELECTED: in a prerequisite but never selected; NOT_IN_PREREQ: in none of them. */
    reason: appearedInPrereq.has(t.id) ? "NOT_SELECTED" : "NOT_IN_PREREQ",
  }));

  return NextResponse.json({ count: result.length, teams: result });
}
