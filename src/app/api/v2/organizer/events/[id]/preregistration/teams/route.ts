import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

type TeamRow = {
  id: string;
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  competitionCode: string;
  competitionName: string;
  members: bigint;
  selected: boolean;
  acceptance: string;
};

type CountRow = { total: bigint };

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
  const stateId       = searchParams.get("stateId") ?? "";
  const page          = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize      = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  try {
    const extraConditions = Prisma.sql`
      ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
      ${stateId
        ? Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${stateId}`
        : Prisma.empty}
      ${q
        ? Prisma.sql`AND (t.name ILIKE ${"%" + q + "%"} OR cont.name ILIKE ${"%" + q + "%"})`
        : Prisma.empty}
    `;

    const fromJoins = Prisma.sql`
      FROM teams t
      JOIN team_events          te         ON te."teamId"  = t.id  AND te."eventId" = ${eventId}
      JOIN competitions         c          ON c.id   = t."competitionId"
      LEFT JOIN event_competitions   ec    ON ec."competitionId" = c.id AND ec."eventId" = ${eventId}
      LEFT JOIN team_members    tm         ON tm."teamId" = t.id
      LEFT JOIN contingents     cont       ON cont.id = t."contingentId"
      LEFT JOIN states          s          ON s.id   = cont."stateId"
      LEFT JOIN schools         sch        ON sch.id = cont."schoolId"
      LEFT JOIN states          sch_state  ON sch_state.id = sch."stateId"
      LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
      LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
    `;

    const [rows, countRows] = await Promise.all([
      db.$queryRaw<TeamRow[]>`
        SELECT
          t.id,
          t.name   AS "teamName",
          cont.name AS "contingentName",
          COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
          c.code   AS "competitionCode",
          c.name   AS "competitionName",
          COUNT(DISTINCT tm."contestantId") AS members,
          te.selected   AS selected,
          te.acceptance AS acceptance
        ${fromJoins}
        WHERE 1=1 ${extraConditions}
        GROUP BY t.id, t.name, cont.name,
          COALESCE(s.name, sch_state.name, hi_state.name), c.code, c.name, te.selected, te.acceptance
        ORDER BY c.code, t.name
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
      db.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT t.id) AS total
        ${fromJoins}
        WHERE 1=1 ${extraConditions}
      `,
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      data: rows.map(r => ({
        id:              r.id,
        teamName:        r.teamName,
        contingentName:  r.contingentName,
        stateName:       r.stateName,
        competitionCode: r.competitionCode,
        competitionName: r.competitionName,
        members:         Number(r.members),
        selected:        r.selected ?? false,
        acceptance:      r.acceptance ?? "PENDING",
      })),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error("[preregistration/teams]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 422 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  try {
    const body = await req.json();
    const teamIds: string[] = Array.isArray(body?.teamIds) ? body.teamIds : [];
    if (teamIds.length === 0) return NextResponse.json({ error: "NO_TEAMS" }, { status: 400 });

    await db.teamEvent.deleteMany({
      where: { eventId, teamId: { in: teamIds } },
    });

    return NextResponse.json({ success: true, removed: teamIds.length });
  } catch (e) {
    console.error("[preregistration/teams DELETE]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 422 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  try {
    const body = await req.json();
    const teamId: string = body?.teamId;
    const selected: boolean = body?.selected;
    if (!teamId || typeof selected !== "boolean")
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

    await db.teamEvent.update({
      where: { teamId_eventId: { teamId, eventId } },
      data: { selected },
    });

    return NextResponse.json({ success: true, teamId, selected });
  } catch (e) {
    console.error("[preregistration/teams PATCH]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 422 });
  }
}
