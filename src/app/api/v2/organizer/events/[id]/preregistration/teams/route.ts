import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";

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
  hasDuplicateMember: boolean;
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
  const targetGroupId = searchParams.get("targetGroupId") ?? "";
  const duplicates    = searchParams.get("duplicates") === "true";
  const page          = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize      = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  try {
    const extraConditions = Prisma.sql`
      ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
      ${stateId
        ? Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${stateId}`
        : Prisma.empty}
      ${targetGroupId
        ? Prisma.sql`AND EXISTS (
            SELECT 1
            FROM team_members tm2
            JOIN contestants   p2 ON p2.id = tm2."contestantId"
            JOIN target_groups tg ON tg.id = ${targetGroupId}
            WHERE tm2."teamId" = t.id AND ${targetGroupMatchSql("p2", "tg")}
          )`
        : Prisma.empty}
      ${q
        ? Prisma.sql`AND (t.name ILIKE ${"%" + q + "%"} OR cont.name ILIKE ${"%" + q + "%"})`
        : Prisma.empty}
    `;

    const duplicateFilter = Prisma.sql`
      AND EXISTS (
        SELECT 1
        FROM team_members tm1
        WHERE tm1."teamId" = t.id
          AND tm1."contestantId" IN (
            SELECT tm2."contestantId"
            FROM team_members tm2
            JOIN team_events te2 ON te2."teamId" = tm2."teamId" AND te2."eventId" = ${eventId}
            GROUP BY tm2."contestantId"
            HAVING COUNT(DISTINCT tm2."teamId") > 1
          )
      )
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
          te.acceptance AS acceptance,
          EXISTS (
            SELECT 1
            FROM team_members tm1
            WHERE tm1."teamId" = t.id
              AND tm1."contestantId" IN (
                SELECT tm2."contestantId"
                FROM team_members tm2
                JOIN team_events te2 ON te2."teamId" = tm2."teamId" AND te2."eventId" = ${eventId}
                GROUP BY tm2."contestantId"
                HAVING COUNT(DISTINCT tm2."teamId") > 1
              )
          ) AS "hasDuplicateMember"
        ${fromJoins}
        WHERE 1=1 ${extraConditions} ${duplicates ? duplicateFilter : Prisma.empty}
        GROUP BY t.id, t.name, cont.name,
          COALESCE(s.name, sch_state.name, hi_state.name), c.code, c.name, te.selected, te.acceptance
        ORDER BY COALESCE(s.name, sch_state.name, hi_state.name), cont.name, t.name
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
      db.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT t.id) AS total
        ${fromJoins}
        WHERE 1=1 ${extraConditions} ${duplicates ? duplicateFilter : Prisma.empty}
      `,
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    // For teams with duplicate members, fetch which members are shared and their other teams
    const dupTeamIds = rows.filter(r => r.hasDuplicateMember).map(r => r.id);
    type DupRow = { teamId: string; memberName: string; otherTeamName: string };
    let dupDetails: DupRow[] = [];
    if (dupTeamIds.length > 0) {
      dupDetails = await db.$queryRaw<DupRow[]>`
        SELECT
          tm1."teamId"  AS "teamId",
          p.name        AS "memberName",
          t2.name       AS "otherTeamName"
        FROM team_members tm1
        JOIN contestants p ON p.id = tm1."contestantId"
        JOIN team_members tm2 ON tm2."contestantId" = tm1."contestantId" AND tm2."teamId" != tm1."teamId"
        JOIN team_events te2 ON te2."teamId" = tm2."teamId" AND te2."eventId" = ${eventId}
        JOIN teams t2 ON t2.id = tm2."teamId"
        WHERE tm1."teamId" IN (${Prisma.join(dupTeamIds)})
        ORDER BY p.name, t2.name
      `;
    }

    // Group duplicate details by teamId
    const dupMap = new Map<string, { memberName: string; otherTeams: string[] }[]>();
    for (const d of dupDetails) {
      if (!dupMap.has(d.teamId)) dupMap.set(d.teamId, []);
      const arr = dupMap.get(d.teamId)!;
      const existing = arr.find(x => x.memberName === d.memberName);
      if (existing) {
        if (!existing.otherTeams.includes(d.otherTeamName)) existing.otherTeams.push(d.otherTeamName);
      } else {
        arr.push({ memberName: d.memberName, otherTeams: [d.otherTeamName] });
      }
    }

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
        hasDuplicateMember: r.hasDuplicateMember ?? false,
        duplicateMembers: dupMap.get(r.id) ?? [],
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
    const acceptance: string | undefined = body?.acceptance;

    // Remove by acceptance status (e.g. all PENDING teams)
    if (acceptance && teamIds.length === 0) {
      const VALID_ACCEPTANCE = ["PENDING", "HOLD", "ACCEPT", "REJECT"];
      if (!VALID_ACCEPTANCE.includes(acceptance))
        return NextResponse.json({ error: "INVALID_ACCEPTANCE" }, { status: 400 });

      const result = await db.teamEvent.deleteMany({
        where: { eventId, acceptance },
      });
      return NextResponse.json({ success: true, removed: result.count });
    }

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
