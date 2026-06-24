import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

const STATE_SCOPES = new Set(["STATE", "ONLINE_STATE"]);
const ZONE_SCOPES  = new Set(["ZONE",  "ONLINE_ZONE"]);

// GET — all events relevant to the manager's teams (either already joined or eligible to join)
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);

  // Resolve effective stateId for each contingent (SCHOOL → school.stateId, others → contingent.stateId)
  const contingents = await db.contingent.findMany({
    where: { id: { in: contingentIds } },
    select: {
      id: true,
      contingentType: true,
      stateId: true,
      school: { select: { stateId: true } },
    },
  });
  const contingentStateMap = new Map<string, string | null>();
  for (const c of contingents) {
    const stateId = c.contingentType === "SCHOOL" ? (c.school?.stateId ?? null) : (c.stateId ?? null);
    contingentStateMap.set(c.id, stateId);
  }

  // All teams managed by this manager
  const teams = await db.team.findMany({
    where: { contingentId: { in: contingentIds } },
    select: {
      id: true,
      name: true,
      status: true,
      competitionId: true,
      contingentId: true,
      competition: { select: { id: true, name: true, code: true } },
      teamEvents: { select: { eventId: true } },
      _count: { select: { members: true } },
    },
  });

  const competitionIds = [...new Set(teams.map((t) => t.competitionId))];

  // Events that have at least one competition the manager's teams are in
  const events = await db.event.findMany({
    where: {
      status: { notIn: ["DRAFT", "ARCHIVE"] },
      eventCompetitions: { some: { competitionId: { in: competitionIds } } },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      scope: true,
      venue: true,
      description: true,
      startDate: true,
      endDate: true,
      stateId: true,
      zoneId: true,
      eventCompetitions: {
        where: { competitionId: { in: competitionIds } },
        select: { competitionId: true },
      },
      teamEvents: {
        where: { team: { contingentId: { in: contingentIds } } },
        select: {
          team: {
            select: {
              id: true,
              name: true,
              status: true,
              competitionId: true,
              contingentId: true,
              competition: { select: { id: true, name: true, code: true } },
              _count: { select: { members: true } },
            },
          },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Load zone→state mappings for ZONE-scoped events
  const zoneIds = [...new Set(events.filter(e => ZONE_SCOPES.has(e.scope) && e.zoneId).map(e => e.zoneId!))];
  const zoneStateRows = zoneIds.length > 0
    ? await db.zoneState.findMany({ where: { zoneId: { in: zoneIds } }, select: { zoneId: true, stateId: true } })
    : [];
  const zoneStateMap = new Map<string, Set<string>>();
  for (const zs of zoneStateRows) {
    if (!zoneStateMap.has(zs.zoneId)) zoneStateMap.set(zs.zoneId, new Set());
    zoneStateMap.get(zs.zoneId)!.add(zs.stateId);
  }

  // Check if a team's contingent is eligible for an event based on scope
  function isLocationEligible(eventScope: string, eventStateId: string | null, eventZoneId: string | null, contingentId: string): boolean {
    if (STATE_SCOPES.has(eventScope)) {
      const stateId = contingentStateMap.get(contingentId) ?? null;
      return stateId != null && stateId === eventStateId;
    }
    if (ZONE_SCOPES.has(eventScope)) {
      if (!eventZoneId) return false;
      const stateId = contingentStateMap.get(contingentId) ?? null;
      if (stateId == null) return false;
      return zoneStateMap.get(eventZoneId)?.has(stateId) ?? false;
    }
    return true; // NATIONAL, OPEN, etc.
  }

  // For each event, compute eligible (unjoined) teams filtered by location
  const joinedTeamIdsByEvent = new Map<string, Set<string>>();
  for (const event of events) {
    joinedTeamIdsByEvent.set(event.id, new Set(event.teamEvents.map((te) => te.team.id)));
  }

  const data = events
    .map((event) => {
      const eventCompIds = new Set(event.eventCompetitions.map((ec) => ec.competitionId));
      const joined = joinedTeamIdsByEvent.get(event.id)!;

      const eligibleTeams = teams
        .filter((t) =>
          eventCompIds.has(t.competitionId) &&
          !joined.has(t.id) &&
          isLocationEligible(event.scope, event.stateId, event.zoneId, t.contingentId)
        )
        .map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          competitionId: t.competitionId,
          contingentId: t.contingentId,
          competition: t.competition,
          memberCount: t._count.members,
        }));

      const participatingTeams = event.teamEvents.map((te) => ({
        id: te.team.id,
        name: te.team.name,
        status: te.team.status,
        competitionId: te.team.competitionId,
        contingentId: te.team.contingentId,
        competition: te.team.competition,
        memberCount: te.team._count.members,
      }));

      return {
        id: event.id,
        name: event.name,
        slug: event.slug,
        status: event.status,
        scope: event.scope,
        venue: event.venue,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        participatingTeams,
        eligibleTeams,
      };
    })
    // Show event only if the contingent is already participating OR has eligible teams
    .filter((ev) => ev.participatingTeams.length > 0 || ev.eligibleTeams.length > 0);

  return NextResponse.json({ data });
}
