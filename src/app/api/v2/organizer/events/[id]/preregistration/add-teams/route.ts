import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const STATE_SCOPES = ["STATE", "ONLINE_STATE"];
const ZONE_SCOPES  = ["ZONE",  "ONLINE_ZONE"];

/**
 * POST — Add teams to an event's preregistration.
 * Body: { teamIds: string[] }
 * Validates eligibility (competition + scope) and skips duplicates.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json();
  const teamIds: string[] = Array.isArray(body?.teamIds) ? body.teamIds : [];
  if (teamIds.length === 0)
    return NextResponse.json({ error: "NO_TEAMS" }, { status: 400 });

  // Load event
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, scope: true, stateId: true, zoneId: true,
      eventCompetitions: { select: { competitionId: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const eventCompIds = new Set(event.eventCompetitions.map((ec) => ec.competitionId));

  // Load requested teams with contingent location info
  const teams = await db.team.findMany({
    where: { id: { in: teamIds } },
    select: {
      id: true,
      competitionId: true,
      contingent: {
        select: {
          stateId: true,
          school: { select: { stateId: true } },
          higherInstitution: { select: { stateId: true } },
        },
      },
    },
  });

  // Build zone→state set if needed
  let zoneStateIds: Set<string> | null = null;
  if (ZONE_SCOPES.includes(event.scope) && event.zoneId) {
    const zoneStates = await db.zoneState.findMany({
      where: { zoneId: event.zoneId },
      select: { stateId: true },
    });
    zoneStateIds = new Set(zoneStates.map((zs) => zs.stateId));
  }

  function getEffectiveStateId(t: (typeof teams)[number]): string | null {
    return t.contingent?.school?.stateId
      ?? t.contingent?.higherInstitution?.stateId
      ?? t.contingent?.stateId
      ?? null;
  }

  function isLocationEligible(t: (typeof teams)[number]): boolean {
    if (STATE_SCOPES.includes(event!.scope)) {
      const stateId = getEffectiveStateId(t);
      return stateId != null && stateId === event!.stateId;
    }
    if (ZONE_SCOPES.includes(event!.scope)) {
      if (!zoneStateIds) return false;
      const stateId = getEffectiveStateId(t);
      return stateId != null && zoneStateIds.has(stateId);
    }
    return true; // NATIONAL, OPEN, etc.
  }

  // Filter to eligible teams
  const eligible = teams.filter(
    (t) => eventCompIds.has(t.competitionId) && isLocationEligible(t),
  );

  const eligibleIds = eligible.map((t) => t.id);

  // Filter out already-registered
  const existing = await db.teamEvent.findMany({
    where: { eventId, teamId: { in: eligibleIds } },
    select: { teamId: true },
  });
  const existingIds = new Set(existing.map((e) => e.teamId));
  const toAdd = eligibleIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await db.teamEvent.createMany({
      data: toAdd.map((teamId) => ({ teamId, eventId })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    added:    toAdd.length,
    skipped:  existingIds.size,
    ineligible: teamIds.length - eligible.length,
  });
}
