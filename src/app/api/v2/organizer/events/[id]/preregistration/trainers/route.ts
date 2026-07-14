import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";

const PAGE_SIZE = 50;

type TrainerRow = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  contingentName: string | null;
  stateName: string | null;
  teams: bigint;
  participants: bigint;
  teamNames: string[] | null;
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
        ? Prisma.sql`AND (tr.name ILIKE ${"%" + q + "%"} OR tr.email ILIKE ${"%" + q + "%"} OR tr."phoneNumber" ILIKE ${"%" + q + "%"} OR cont.name ILIKE ${"%" + q + "%"})`
        : Prisma.empty}
    `;

    const fromJoins = Prisma.sql`
      FROM trainers tr
      JOIN team_trainers        tt         ON tt."trainerId" = tr.id
      JOIN teams                t          ON t.id   = tt."teamId"
      JOIN team_events          te         ON te."teamId"  = t.id  AND te."eventId" = ${eventId}
      JOIN competitions         c          ON c.id   = t."competitionId"
      LEFT JOIN team_members    tm         ON tm."teamId" = t.id
      LEFT JOIN contingents     cont       ON cont.id = tr."contingentId"
      LEFT JOIN states          s          ON s.id   = cont."stateId"
      LEFT JOIN schools         sch        ON sch.id = cont."schoolId"
      LEFT JOIN states          sch_state  ON sch_state.id = sch."stateId"
      LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
      LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
    `;

    const [rows, countRows] = await Promise.all([
      db.$queryRaw<TrainerRow[]>`
        SELECT
          tr.id,
          tr.name,
          tr.email,
          tr."phoneNumber",
          cont.name AS "contingentName",
          COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
          COUNT(DISTINCT t.id)               AS teams,
          COUNT(DISTINCT tm."contestantId")  AS participants,
          ARRAY_AGG(DISTINCT t.name ORDER BY t.name) AS "teamNames"
        ${fromJoins}
        WHERE 1=1 ${extraConditions}
        GROUP BY tr.id, tr.name, tr.email, tr."phoneNumber", cont.name,
          COALESCE(s.name, sch_state.name, hi_state.name)
        ORDER BY cont.name, tr.name
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
      db.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT tr.id) AS total
        ${fromJoins}
        WHERE 1=1 ${extraConditions}
      `,
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      data: rows.map(r => ({
        id:             r.id,
        name:           r.name,
        email:          r.email,
        phoneNumber:    r.phoneNumber,
        contingentName: r.contingentName,
        stateName:      r.stateName,
        teams:          Number(r.teams),
        participants:   Number(r.participants),
        teamNames:      r.teamNames ?? [],
      })),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error("[preregistration/trainers]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 422 });
  }
}
