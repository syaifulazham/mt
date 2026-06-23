import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  name: string;
  classGrade: string | null;
  eduLevel: string;
  competitionCode: string;
  competitionName: string;
  teamName: string;
  stateName: string | null;
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
    const baseConditions = Prisma.sql`
      ec."eventId" = ${eventId}
      ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
      ${stateId ? Prisma.sql`AND COALESCE(s.id, sch_state.id) = ${stateId}` : Prisma.empty}
      ${q ? Prisma.sql`AND (p.name ILIKE ${"%" + q + "%"} OR t.name ILIKE ${"%" + q + "%"})` : Prisma.empty}
    `;

    const [rows, countRows] = await Promise.all([
      db.$queryRaw<Row[]>`
        SELECT
          p.id,
          p.name,
          p."classGrade",
          p."eduLevel",
          c.code        AS "competitionCode",
          c.name        AS "competitionName",
          t.name        AS "teamName",
          COALESCE(s.name, sch_state.name) AS "stateName"
        FROM team_members tm
        JOIN contestants        p          ON p.id  = tm."contestantId"
        JOIN teams              t          ON t.id  = tm."teamId"
        JOIN competitions       c          ON c.id  = t."competitionId"
        JOIN event_competitions ec         ON ec."competitionId" = c.id
        LEFT JOIN contingents   cont       ON cont.id = p."contingentId"
        LEFT JOIN states        s          ON s.id    = cont."stateId"
        LEFT JOIN schools       sch        ON sch.id  = cont."schoolId"
        LEFT JOIN states        sch_state  ON sch_state.id = sch."stateId"
        WHERE ${baseConditions}
        ORDER BY c.code, t.name, p.name
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
      db.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS total
        FROM team_members tm
        JOIN contestants        p          ON p.id  = tm."contestantId"
        JOIN teams              t          ON t.id  = tm."teamId"
        JOIN competitions       c          ON c.id  = t."competitionId"
        JOIN event_competitions ec         ON ec."competitionId" = c.id
        LEFT JOIN contingents   cont       ON cont.id = p."contingentId"
        LEFT JOIN states        s          ON s.id    = cont."stateId"
        LEFT JOIN schools       sch        ON sch.id  = cont."schoolId"
        LEFT JOIN states        sch_state  ON sch_state.id = sch."stateId"
        WHERE ${baseConditions}
      `,
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({ data: rows, total, page, pageSize });
  } catch (e) {
    console.error("[preregistration]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 422 });
  }
}
