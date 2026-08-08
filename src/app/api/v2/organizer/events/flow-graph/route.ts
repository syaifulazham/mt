import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Fetch all events with prerequisites and aggregate team counts
  const events = await db.event.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      scope: true,
      status: true,
      startDate: true,
      endDate: true,
      state: { select: { name: true } },
      zone:  { select: { name: true } },
      prerequisites:    { select: { prerequisiteId: true } },
      asPrerequisiteOf: { select: { eventId: true } },
      _count: { select: { teamEvents: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const eventIds = events.map((e) => e.id);

  // Participant counts: sum members of teams registered in each event
  const participantRows = await db.$queryRaw<{ eventId: string; cnt: bigint }[]>`
    SELECT te."eventId", COUNT(tm.id) AS cnt
    FROM "team_events" te
    JOIN "team_members" tm ON tm."teamId" = te."teamId"
    WHERE te."eventId" = ANY(${eventIds}::text[])
    GROUP BY te."eventId"
  `;
  const participantMap = new Map(participantRows.map((r) => [r.eventId, Number(r.cnt)]));

  // Selected-team counts per event
  const selectedRows = await db.$queryRaw<{ eventId: string; cnt: bigint }[]>`
    SELECT te."eventId", COUNT(*) AS cnt
    FROM "team_events" te
    WHERE te."eventId" = ANY(${eventIds}::text[])
      AND te."selected" = true
    GROUP BY te."eventId"
  `;
  const selectedMap = new Map(selectedRows.map((r) => [r.eventId, Number(r.cnt)]));

  // Selected-participant counts per event
  const selectedParticipantRows = await db.$queryRaw<{ eventId: string; cnt: bigint }[]>`
    SELECT te."eventId", COUNT(tm.id) AS cnt
    FROM "team_events" te
    JOIN "team_members" tm ON tm."teamId" = te."teamId"
    WHERE te."eventId" = ANY(${eventIds}::text[])
      AND te."selected" = true
    GROUP BY te."eventId"
  `;
  const selectedParticipantMap = new Map(selectedParticipantRows.map((r) => [r.eventId, Number(r.cnt)]));

  // Build prerequisite edge pairs
  const edgePairs: { from: string; to: string }[] = [];
  for (const ev of events) {
    for (const p of ev.prerequisites) {
      edgePairs.push({ from: p.prerequisiteId, to: ev.id });
    }
  }

  // For each edge, compute how many selected-in-prereq teams are registered in successor
  const edges = await Promise.all(
    edgePairs.map(async ({ from, to }) => {
      // Teams selected in prerequisite event
      const selectedInPrereq = await db.teamEvent.findMany({
        where: { eventId: from, selected: true },
        select: { teamId: true },
      });
      const selectedIds = selectedInPrereq.map((te) => te.teamId);

      if (selectedIds.length === 0) {
        return { from, to, selectedTeams: 0, transferredTeams: 0, transferredParticipants: 0 };
      }

      // How many of those actually registered in the successor event
      const transferred = await db.teamEvent.findMany({
        where: { eventId: to, teamId: { in: selectedIds } },
        select: { teamId: true },
      });
      const transferredIds = transferred.map((te) => te.teamId);

      // Participant count in those transferred teams
      const participantCount = await db.teamMember.count({
        where: { teamId: { in: transferredIds } },
      });

      return {
        from,
        to,
        selectedTeams:          selectedIds.length,
        transferredTeams:       transferredIds.length,
        transferredParticipants: participantCount,
      };
    }),
  );

  const nodes = events.map((ev) => ({
    id:                   ev.id,
    name:                 ev.name,
    slug:                 ev.slug,
    scope:                ev.scope,
    status:               ev.status,
    startDate:            ev.startDate?.toISOString() ?? null,
    endDate:              ev.endDate?.toISOString() ?? null,
    locationName:         ev.state?.name ?? ev.zone?.name ?? null,
    totalTeams:           ev._count.teamEvents,
    totalParticipants:    participantMap.get(ev.id) ?? 0,
    selectedTeams:        selectedMap.get(ev.id) ?? 0,
    selectedParticipants: selectedParticipantMap.get(ev.id) ?? 0,
    prerequisiteIds:      ev.prerequisites.map((p) => p.prerequisiteId),
    successorIds:         ev.asPrerequisiteOf.map((p) => p.eventId),
  }));

  return NextResponse.json({ nodes, edges });
}
