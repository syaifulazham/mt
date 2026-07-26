import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";

type ParticipantRow = {
  id: string;
  name: string;
  ic: string | null;
  gender: string;
  eduLevel: string;
  classGrade: string | null;
  contingentName: string | null;
  teamName: string;
  stateName: string | null;
  competitionCode: string;
  competitionName: string;
};

type TeamRow = {
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  competitionCode: string;
  competitionName: string;
  targetGroupCode: string | null;
  targetGroupName: string | null;
  members: bigint;
  memberNames: string | null;
};

type TrainerRow = {
  name: string;
  email: string | null;
  phoneNumber: string | null;
  contingentName: string | null;
  stateName: string | null;
  teams: bigint;
  participants: bigint;
  teamNames: string[] | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const { searchParams } = req.nextUrl;
  const typeParam     = searchParams.get("type");
  const type          = typeParam === "teams" ? "teams" : typeParam === "trainers" ? "trainers" : "participants";
  const q             = (searchParams.get("q") ?? "").trim();
  const competitionId = searchParams.get("competitionId") ?? "";
  const stateId       = searchParams.get("stateId") ?? "";
  const targetGroupId = searchParams.get("targetGroupId") ?? "";

  try {
    if (type === "participants") {
      const extraConditions = Prisma.sql`
        ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
        ${stateId ? Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${stateId}` : Prisma.empty}
        ${targetGroupId
          ? Prisma.sql`AND EXISTS (SELECT 1 FROM target_groups tg WHERE tg.id = ${targetGroupId} AND ${targetGroupMatchSql("p", "tg")})`
          : Prisma.empty}
        ${q ? Prisma.sql`AND (p.name ILIKE ${"%" + q + "%"} OR t.name ILIKE ${"%" + q + "%"})` : Prisma.empty}
      `;

      const rows = await db.$queryRaw<ParticipantRow[]>`
        SELECT
          p.id,
          p.name,
          p.ic,
          p.gender,
          p."eduLevel",
          p."classGrade",
          cont.name AS "contingentName",
          t.name    AS "teamName",
          COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
          c.code    AS "competitionCode",
          c.name    AS "competitionName"
        FROM team_members tm
        JOIN contestants          p          ON p.id   = tm."contestantId"
        JOIN teams                t          ON t.id   = tm."teamId"
        JOIN team_events          te         ON te."teamId" = t.id AND te."eventId" = ${eventId}
        JOIN competitions         c          ON c.id   = t."competitionId"
        LEFT JOIN event_competitions   ec    ON ec."competitionId" = c.id AND ec."eventId" = ${eventId}
        LEFT JOIN contingents     cont       ON cont.id = t."contingentId"
        LEFT JOIN states          s          ON s.id   = cont."stateId"
        LEFT JOIN schools         sch        ON sch.id = cont."schoolId"
        LEFT JOIN states          sch_state  ON sch_state.id = sch."stateId"
        LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
        LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
        WHERE 1=1 ${extraConditions}
        ORDER BY c.code, t.name, p.name
      `;

      return NextResponse.json({ type, data: rows });
    }

    if (type === "trainers") {
      const extraConditions = Prisma.sql`
        ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
        ${stateId ? Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${stateId}` : Prisma.empty}
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

      const rows = await db.$queryRaw<TrainerRow[]>`
        SELECT
          tr.name,
          tr.email,
          tr."phoneNumber",
          cont.name AS "contingentName",
          COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
          COUNT(DISTINCT t.id)               AS teams,
          COUNT(DISTINCT tm."contestantId")  AS participants,
          ARRAY_AGG(DISTINCT t.name ORDER BY t.name) AS "teamNames"
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
        WHERE 1=1 ${extraConditions}
        GROUP BY tr.id, tr.name, tr.email, tr."phoneNumber", cont.name,
          COALESCE(s.name, sch_state.name, hi_state.name)
        ORDER BY cont.name, tr.name
      `;

      return NextResponse.json({
        type,
        data: rows.map(r => ({
          name:           r.name,
          email:          r.email,
          phoneNumber:    r.phoneNumber,
          contingentName: r.contingentName,
          stateName:      r.stateName,
          teams:          Number(r.teams),
          participants:   Number(r.participants),
          teamNames:      r.teamNames ?? [],
        })),
      });
    }

    // teams
    const extraConditions = Prisma.sql`
      ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
      ${stateId ? Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${stateId}` : Prisma.empty}
      ${targetGroupId
        ? Prisma.sql`AND EXISTS (
            SELECT 1
            FROM team_members tm2
            JOIN contestants   p2 ON p2.id = tm2."contestantId"
            JOIN target_groups tg ON tg.id = ${targetGroupId}
            WHERE tm2."teamId" = t.id AND ${targetGroupMatchSql("p2", "tg")}
          )`
        : Prisma.empty}
      ${q ? Prisma.sql`AND (t.name ILIKE ${"%" + q + "%"} OR cont.name ILIKE ${"%" + q + "%"})` : Prisma.empty}
    `;

    const rows = await db.$queryRaw<TeamRow[]>`
      SELECT
        t.name    AS "teamName",
        cont.name AS "contingentName",
        COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
        c.code    AS "competitionCode",
        c.name    AS "competitionName",
        (SELECT tg.code FROM competition_target_groups ctg2
         JOIN target_groups tg ON tg.id = ctg2."targetGroupId"
         WHERE ctg2."competitionId" = c.id LIMIT 1) AS "targetGroupCode",
        (SELECT tg.name FROM competition_target_groups ctg2
         JOIN target_groups tg ON tg.id = ctg2."targetGroupId"
         WHERE ctg2."competitionId" = c.id LIMIT 1) AS "targetGroupName",
        COUNT(DISTINCT tm."contestantId")                          AS members,
        STRING_AGG(p.name, ', ' ORDER BY p.name)                  AS "memberNames"
      FROM teams t
      JOIN team_events          te         ON te."teamId" = t.id AND te."eventId" = ${eventId}
      JOIN competitions         c          ON c.id   = t."competitionId"
      LEFT JOIN event_competitions   ec    ON ec."competitionId" = c.id AND ec."eventId" = ${eventId}
      LEFT JOIN team_members    tm         ON tm."teamId" = t.id
      LEFT JOIN contestants     p          ON p.id = tm."contestantId"
      LEFT JOIN contingents     cont       ON cont.id = t."contingentId"
      LEFT JOIN states          s          ON s.id   = cont."stateId"
      LEFT JOIN schools         sch        ON sch.id = cont."schoolId"
      LEFT JOIN states          sch_state  ON sch_state.id = sch."stateId"
      LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
      LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
      WHERE 1=1 ${extraConditions}
      GROUP BY t.id, t.name, cont.name,
        COALESCE(s.name, sch_state.name, hi_state.name), c.code, c.name
      ORDER BY c.code, COALESCE(s.name, sch_state.name, hi_state.name), cont.name, t.name
    `;

    return NextResponse.json({
      type,
      data: rows.map(r => ({
        teamName:        r.teamName,
        contingentName:  r.contingentName,
        stateName:       r.stateName,
        competitionCode: r.competitionCode,
        competitionName: r.competitionName,
        targetGroupCode: r.targetGroupCode,
        targetGroupName: r.targetGroupName,
        members:         Number(r.members),
        memberNames:     r.memberNames ?? "",
      })),
    });
  } catch (e) {
    console.error("[preregistration/export]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 422 });
  }
}
