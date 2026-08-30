import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { teamHasZoneWinner } from "@/lib/zoneWinners";

// Resolve team and contingent — returns contingent's effective stateId
async function resolveTeam(userId: string, teamId: string) {
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return null;
  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      competitionId: true,
      contingentId: true,
      contingent: {
        select: {
          contingentType: true,
          stateId: true,
          school: { select: { stateId: true } },
        },
      },
    },
  });
  if (!team || !contingentIds.includes(team.contingentId)) return null;

  // Effective stateId: SCHOOL type gets it from school, others direct
  const effectiveStateId =
    team.contingent.contingentType === "SCHOOL"
      ? (team.contingent.school?.stateId ?? null)
      : (team.contingent.stateId ?? null);

  return { id: team.id, competitionId: team.competitionId, contingentId: team.contingentId, effectiveStateId };
}

type EventRow = {
  id: string; name: string; slug: string; status: string; startDate: Date | null;
  endDate: Date | null; scope: string; venue: string | null; description: string | null;
  stateId: string | null; zoneId: string | null;
  participationPolicy: string; winnerExclusionRank: number | null;
};

// Check whether a contingent's state is eligible for an event given its scope
async function filterByLocation(events: EventRow[], effectiveStateId: string | null): Promise<EventRow[]> {
  const STATE_SCOPES = ["STATE", "ONLINE_STATE"];
  const ZONE_SCOPES  = ["ZONE",  "ONLINE_ZONE"];

  // Collect unique zoneIds from ZONE-scoped events
  const zoneIds = [...new Set(
    events.filter(e => ZONE_SCOPES.includes(e.scope) && e.zoneId).map(e => e.zoneId!)
  )];

  // Load zone→state mappings once
  const zoneStates = zoneIds.length > 0
    ? await db.zoneState.findMany({
        where: { zoneId: { in: zoneIds } },
        select: { zoneId: true, stateId: true },
      })
    : [];

  const zoneStateMap = new Map<string, Set<string>>();
  for (const zs of zoneStates) {
    if (!zoneStateMap.has(zs.zoneId)) zoneStateMap.set(zs.zoneId, new Set());
    zoneStateMap.get(zs.zoneId)!.add(zs.stateId);
  }

  return events.filter((ev) => {
    if (STATE_SCOPES.includes(ev.scope)) {
      // Must have matching stateId
      return effectiveStateId != null && ev.stateId === effectiveStateId;
    }
    if (ZONE_SCOPES.includes(ev.scope)) {
      // Contingent's state must be in the zone
      if (!ev.zoneId || effectiveStateId == null) return false;
      return zoneStateMap.get(ev.zoneId)?.has(effectiveStateId) ?? false;
    }
    // NATIONAL, OPEN, ONLINE_NATIONAL, ONLINE_OPEN — no restriction
    return true;
  });
}

// GET — list eligible events for joining (has the team's competition, not already joined, status not DRAFT/COMPLETED, location matches)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const team = await resolveTeam(userId, id);
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const joined = await db.teamEvent.findMany({
    where: { teamId: id },
    select: { eventId: true },
  });
  const joinedIds = joined.map((j) => j.eventId);

  const events = await db.event.findMany({
    where: {
      status: { notIn: ["DRAFT", "COMPLETED", "ARCHIVE"] },
      id: { notIn: joinedIds },
      participationPolicy: { not: "PREREQUISITE_SELECTED" },
      eventCompetitions: { some: { competitionId: team.competitionId } },
    },
    select: {
      id: true, name: true, slug: true, status: true,
      startDate: true, endDate: true, scope: true,
      venue: true, description: true,
      stateId: true, zoneId: true,
      participationPolicy: true, winnerExclusionRank: true,
    },
    orderBy: { startDate: "asc" },
  });

  const byLocation = await filterByLocation(events, team.effectiveStateId);

  // Filter out zone-winner-restricted events when this team has excluded winners
  const eligible: typeof byLocation = [];
  for (const ev of byLocation) {
    if (ev.participationPolicy === "ALL_EXCEPT_ZONE_WINNERS") {
      const excluded = await teamHasZoneWinner(id, ev.winnerExclusionRank ?? 3);
      if (excluded) continue;
    }
    eligible.push(ev);
  }

  // Strip internal fields before returning
  const data = eligible.map(({ stateId: _s, zoneId: _z, participationPolicy: _p, winnerExclusionRank: _w, ...rest }) => rest);

  return NextResponse.json({ data });
}

// POST — join an event (validates location eligibility before allowing)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const team = await resolveTeam(userId, id);
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { eventId } = await req.json();
  if (!eventId) return NextResponse.json({ error: "MISSING_EVENT_ID" }, { status: 400 });

  // Verify the event has this competition
  const ec = await db.eventCompetition.findFirst({
    where: { eventId, competitionId: team.competitionId },
  });
  if (!ec) return NextResponse.json({ error: "EVENT_NOT_ELIGIBLE" }, { status: 400 });

  // Verify location eligibility
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, scope: true, venue: true, description: true, stateId: true, zoneId: true, participationPolicy: true, winnerExclusionRank: true, _count: { select: { prerequisites: true } } },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  // Reject direct joins for events restricted to prerequisite-selected teams
  if (event.participationPolicy === "PREREQUISITE_SELECTED" || event._count.prerequisites > 0)
    return NextResponse.json({ error: "EVENT_REQUIRES_PREREQUISITE" }, { status: 403 });

  // Reject teams with members who are zone winners when the event excludes them
  if (event.participationPolicy === "ALL_EXCEPT_ZONE_WINNERS") {
    const excluded = await teamHasZoneWinner(id, event.winnerExclusionRank ?? 3);
    if (excluded)
      return NextResponse.json({ error: "TEAM_HAS_ZONE_WINNERS" }, { status: 403 });
  }

  const allowed = await filterByLocation([event], team.effectiveStateId);
  if (allowed.length === 0) return NextResponse.json({ error: "EVENT_LOCATION_MISMATCH" }, { status: 403 });

  const teamEvent = await db.teamEvent.upsert({
    where: { teamId_eventId: { teamId: id, eventId } },
    create: { teamId: id, eventId },
    update: {},
    include: {
      event: { select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, scope: true } },
    },
  });

  return NextResponse.json({ data: teamEvent }, { status: 201 });
}
