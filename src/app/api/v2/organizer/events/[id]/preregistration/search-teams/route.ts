import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const STATE_SCOPES = ["STATE", "ONLINE_STATE"];
const ZONE_SCOPES  = ["ZONE",  "ONLINE_ZONE"];

/**
 * GET — Search all teams globally, filtered by event eligibility:
 *   1. Competition must be offered by this event (eventCompetitions)
 *   2. Contingent state must match the event scope/area
 *   Teams already registered are flagged with alreadyRegistered = true
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const { searchParams } = req.nextUrl;
  const q             = (searchParams.get("q") ?? "").trim();
  const competitionId = searchParams.get("competitionId") ?? "";

  if (q.length < 2)
    return NextResponse.json({ data: [] });

  // Load event + its competitions
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, scope: true, stateId: true, zoneId: true,
      eventCompetitions: { select: { competitionId: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const eventCompIds = event.eventCompetitions.map((ec) => ec.competitionId);
  if (eventCompIds.length === 0)
    return NextResponse.json({ data: [] });

  // Build scope-based state filter
  let scopeCondition = Prisma.empty;
  if (STATE_SCOPES.includes(event.scope) && event.stateId) {
    scopeCondition = Prisma.sql`
      AND COALESCE(s.id, sch_state.id, hi_state.id) = ${event.stateId}
    `;
  } else if (ZONE_SCOPES.includes(event.scope) && event.zoneId) {
    // Load zone's states
    const zoneStates = await db.zoneState.findMany({
      where: { zoneId: event.zoneId },
      select: { stateId: true },
    });
    const zoneStateIds = zoneStates.map((zs) => zs.stateId);
    if (zoneStateIds.length === 0)
      return NextResponse.json({ data: [] });
    scopeCondition = Prisma.sql`
      AND COALESCE(s.id, sch_state.id, hi_state.id) IN (${Prisma.join(zoneStateIds)})
    `;
  }
  // NATIONAL / OPEN / etc. → no scope restriction

  const compFilter = competitionId
    ? Prisma.sql`AND c.id = ${competitionId}`
    : Prisma.sql`AND c.id IN (${Prisma.join(eventCompIds)})`;

  type SearchRow = {
    id: string;
    teamName: string;
    contingentName: string | null;
    stateName: string | null;
    competitionCode: string;
    competitionName: string;
    members: bigint;
  };

  const rows = await db.$queryRaw<SearchRow[]>`
    SELECT
      t.id,
      t.name   AS "teamName",
      cont.name AS "contingentName",
      COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
      c.code   AS "competitionCode",
      c.name   AS "competitionName",
      COUNT(DISTINCT tm."contestantId") AS members
    FROM teams t
    JOIN competitions         c          ON c.id   = t."competitionId"
    LEFT JOIN team_members    tm         ON tm."teamId" = t.id
    LEFT JOIN contingents     cont       ON cont.id = t."contingentId"
    LEFT JOIN states          s          ON s.id   = cont."stateId"
    LEFT JOIN schools         sch        ON sch.id = cont."schoolId"
    LEFT JOIN states          sch_state  ON sch_state.id = sch."stateId"
    LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
    LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
    WHERE (t.name ILIKE ${"%" + q + "%"} OR cont.name ILIKE ${"%" + q + "%"})
      ${compFilter}
      ${scopeCondition}
    GROUP BY t.id, t.name, cont.name,
      COALESCE(s.name, sch_state.name, hi_state.name), c.code, c.name
    ORDER BY c.code, t.name
    LIMIT 50
  `;

  // Check which are already registered
  const teamIds = rows.map((r) => r.id);
  const alreadySet = new Set(
    teamIds.length > 0
      ? (await db.teamEvent.findMany({
          where: { eventId, teamId: { in: teamIds } },
          select: { teamId: true },
        })).map((e) => e.teamId)
      : [],
  );

  return NextResponse.json({
    data: rows.map((r) => ({
      id:                r.id,
      teamName:          r.teamName,
      contingentName:    r.contingentName,
      stateName:         r.stateName,
      competitionCode:   r.competitionCode,
      competitionName:   r.competitionName,
      members:           Number(r.members),
      alreadyRegistered: alreadySet.has(r.id),
    })),
  });
}
