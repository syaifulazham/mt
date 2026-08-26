import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// Resolve team and contingent — returns contingent's effective stateId
async function resolveTeam(contingentId: string, teamId: string) {
  const team = await db.team.findFirst({
    where: { id: teamId, contingentId },
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
  if (!team) return null;

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
};

async function filterByLocation(events: EventRow[], effectiveStateId: string | null): Promise<EventRow[]> {
  const STATE_SCOPES = ["STATE", "ONLINE_STATE"];
  const ZONE_SCOPES  = ["ZONE",  "ONLINE_ZONE"];

  const zoneIds = [...new Set(
    events.filter(e => ZONE_SCOPES.includes(e.scope) && e.zoneId).map(e => e.zoneId!)
  )];

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
      return effectiveStateId != null && ev.stateId === effectiveStateId;
    }
    if (ZONE_SCOPES.includes(ev.scope)) {
      if (!ev.zoneId || effectiveStateId == null) return false;
      return zoneStateMap.get(ev.zoneId)?.has(effectiveStateId) ?? false;
    }
    return true;
  });
}

// GET — list eligible events (has the team's competition, no prerequisites, not already joined, location matches)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, teamId } = await params;
  const team = await resolveTeam(id, teamId);
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const includeCompleted = req.nextUrl.searchParams.get("includeCompleted") === "true";

  const joined = await db.teamEvent.findMany({
    where: { teamId },
    select: { eventId: true },
  });
  const joinedIds = joined.map(j => j.eventId);

  const events = await db.event.findMany({
    where: {
      status: includeCompleted ? { notIn: ["DRAFT", "ARCHIVE"] } : { notIn: ["DRAFT", "COMPLETED", "ARCHIVE"] },
      id: { notIn: joinedIds },
      prerequisites: { none: {} },
      eventCompetitions: { some: { competitionId: team.competitionId } },
    },
    select: {
      id: true, name: true, slug: true, status: true,
      startDate: true, endDate: true, scope: true,
      venue: true, description: true,
      stateId: true, zoneId: true,
    },
    orderBy: { startDate: "asc" },
  });

  const eligible = await filterByLocation(events, team.effectiveStateId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const data = eligible.map(({ stateId: _s, zoneId: _z, ...rest }) => rest);

  return NextResponse.json({ data });
}

// POST — register team to an event (validates prerequisites and location)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id, teamId } = await params;
  const team = await resolveTeam(id, teamId);
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { eventId } = await req.json();
  if (!eventId) return NextResponse.json({ error: "MISSING_EVENT_ID" }, { status: 400 });

  const ec = await db.eventCompetition.findFirst({
    where: { eventId, competitionId: team.competitionId },
  });
  if (!ec) return NextResponse.json({ error: "EVENT_NOT_ELIGIBLE" }, { status: 400 });

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, stateId: true, zoneId: true, scope: true, _count: { select: { prerequisites: true } } },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  if (event._count.prerequisites > 0)
    return NextResponse.json({ error: "EVENT_REQUIRES_PREREQUISITE" }, { status: 403 });

  const allowed = await filterByLocation([{
    ...event, name: "", slug: "", status: "", startDate: null, endDate: null, venue: null, description: null,
  }], team.effectiveStateId);
  if (allowed.length === 0)
    return NextResponse.json({ error: "EVENT_LOCATION_MISMATCH" }, { status: 403 });

  const teamEvent = await db.teamEvent.upsert({
    where: { teamId_eventId: { teamId, eventId } },
    create: { teamId, eventId },
    update: {},
    include: {
      event: { select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, scope: true } },
    },
  });

  return NextResponse.json({ data: teamEvent }, { status: 201 });
}
