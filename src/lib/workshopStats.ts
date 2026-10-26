import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";

// Workshops are the EptimEdu courses attached to competitions
// (competitions."eptimEduCourseId"). A workshop's participants are the members
// of the teams registered for its competition(s). A participant counts once per
// workshop even if the course is attached to several competitions, and once in
// the all-workshops totals.
//
// (Counting everyone *eligible* by target group was tried: ~20 s, and it just
// mirrors the whole participant base per school level, so it was left out.)

export const WORKSHOP_DIMENSIONS = ["state", "schoolCategory", "ethnicity", "gender", "targetGroup"] as const;
export type WorkshopDimension = (typeof WORKSHOP_DIMENSIONS)[number];

export type Breakdown = Record<WorkshopDimension, { label: string; count: number }[]>;

export type WorkshopCompetition = { id: string; code: string; name: string; teams: number; teamsLmsEnrolled: number };

export type WorkshopRow = {
  courseId: string;
  title: string;
  competitions: WorkshopCompetition[];
  participants: number;
  breakdown: Breakdown;
};

export type WorkshopStats = {
  totalParticipants: number;
  overall: Breakdown;
  workshops: WorkshopRow[];
};

const ETHNICITY_LABEL: Record<string, string> = {
  MELAYU:                 "Melayu",
  CINA:                   "Cina",
  INDIA:                  "India",
  ORANG_ASLI_SEMENANJUNG: "Orang Asli",
  BUMIPUTRA_SABAH:        "Bumiputra Sabah",
  BUMIPUTRA_SARAWAK:      "Bumiputra Sarawak",
  LAIN_LAIN:              "Lain-lain",
};
const GENDER_LABEL: Record<string, string> = { MALE: "Lelaki", FEMALE: "Perempuan" };
// Non-school contingents have no school category; show their type instead.
const CONTINGENT_TYPE_LABEL: Record<string, string> = {
  HIGHER:        "(IPT)",
  INDEPENDENT:   "(Bebas)",
  INTERNATIONAL: "(Antarabangsa)",
};

function emptyBreakdown(): Breakdown {
  return { state: [], schoolCategory: [], ethnicity: [], gender: [], targetGroup: [] };
}

function label(dim: WorkshopDimension, raw: string | null): string {
  if (raw == null || raw === "") {
    return dim === "targetGroup" ? "Tidak sepadan" : dim === "state" ? "Tiada negeri" : "Tidak dinyatakan";
  }
  if (dim === "ethnicity") return ETHNICITY_LABEL[raw] ?? raw;
  if (dim === "gender") return GENDER_LABEL[raw] ?? raw;
  if (dim === "schoolCategory") return CONTINGENT_TYPE_LABEL[raw] ?? raw;
  return raw;
}

/** All workshops, or just one when `courseId` is given. */
export async function getWorkshopStats(courseId?: string): Promise<WorkshopStats> {
  const competitions = await db.competition.findMany({
    where: { eptimEduCourseId: courseId ?? { not: null } },
    select: { id: true, code: true, name: true, eptimEduCourseId: true, eptimEduCourseTitle: true },
    orderBy: { code: "asc" },
  });

  const teamCounts = await db.team.groupBy({
    by: ["competitionId", "lmsCourseEnrolled"],
    where: { competitionId: { in: competitions.map((c) => c.id) } },
    _count: { _all: true },
  });

  // One row per (course, participant), with the participant's target group in
  // that competition (null if their profile fits none of its groups).
  const base = Prisma.sql`
    SELECT DISTINCT ON (c."eptimEduCourseId", p.id)
           c."eptimEduCourseId" AS course, p.id AS pid, tg.name AS tg
    FROM competitions c
    JOIN teams t         ON t."competitionId" = c.id
    JOIN team_members tm ON tm."teamId" = t.id
    JOIN contestants p   ON p.id = tm."contestantId"
    LEFT JOIN LATERAL (
      SELECT tg.name
      FROM competition_target_groups ctg
      JOIN target_groups tg ON tg.id = ctg."targetGroupId"
      WHERE ctg."competitionId" = c.id AND ${targetGroupMatchSql("p", "tg")}
      ORDER BY tg.name
      LIMIT 1
    ) tg ON true
    WHERE c."eptimEduCourseId" IS NOT NULL
      ${courseId ? Prisma.sql`AND c."eptimEduCourseId" = ${courseId}` : Prisma.empty}
    ORDER BY c."eptimEduCourseId", p.id, tg.name`;

  // Unpivot each participant into one row per dimension, then count per course
  // and across all courses in one pass (course IS NULL = all workshops).
  const rows = await db.$queryRaw<{ course: string | null; dim: string; val: string | null; n: number }[]>`
    WITH base AS (${base}),
    detail AS (
      SELECT b.course, b.pid, b.tg,
             COALESCE(ss.name, cs.name)                                   AS state,
             CASE WHEN ct."contingentType" = 'SCHOOL' THEN s.category::text
                  ELSE ct."contingentType"::text END                       AS category,
             p.ethnicity::text                                            AS ethnicity,
             p.gender::text                                               AS gender
      FROM base b
      JOIN contestants p      ON p.id = b.pid
      JOIN contingents ct     ON ct.id = p."contingentId"
      LEFT JOIN schools s     ON s.id = ct."schoolId"
      LEFT JOIN states ss     ON ss.id = s."stateId"
      LEFT JOIN states cs     ON cs.id = ct."stateId"
    )
    SELECT d.course, v.dim, v.val, COUNT(DISTINCT d.pid)::int AS n
    FROM detail d
    CROSS JOIN LATERAL (VALUES
      ('total', NULL::text),
      ('state', d.state),
      ('schoolCategory', d.category),
      ('ethnicity', d.ethnicity),
      ('gender', d.gender),
      ('targetGroup', d.tg)
    ) AS v(dim, val)
    GROUP BY GROUPING SETS ((d.course, v.dim, v.val), (v.dim, v.val))
  `;

  // ── Shape the result ──────────────────────────────────────────────────────
  const byCourse = new Map<string | null, { total: number; breakdown: Breakdown }>();
  const bucket = (course: string | null) => {
    let b = byCourse.get(course);
    if (!b) byCourse.set(course, (b = { total: 0, breakdown: emptyBreakdown() }));
    return b;
  };
  for (const r of rows) {
    const b = bucket(r.course);
    if (r.dim === "total") { b.total = r.n; continue; }
    const dim = r.dim as WorkshopDimension;
    const list = b.breakdown[dim];
    const l = label(dim, r.val);
    const existing = list.find((x) => x.label === l);
    if (existing) existing.count += r.n; else list.push({ label: l, count: r.n });
  }
  for (const b of byCourse.values()) {
    for (const dim of WORKSHOP_DIMENSIONS) b.breakdown[dim].sort((a, c) => c.count - a.count);
  }

  const workshops = new Map<string, WorkshopRow>();
  for (const c of competitions) {
    const cid = c.eptimEduCourseId!;
    let w = workshops.get(cid);
    if (!w) {
      const stats = byCourse.get(cid);
      w = {
        courseId: cid,
        title: c.eptimEduCourseTitle ?? cid,
        competitions: [],
        participants: stats?.total ?? 0,
        breakdown: stats?.breakdown ?? emptyBreakdown(),
      };
      workshops.set(cid, w);
    }
    const tc = teamCounts.filter((t) => t.competitionId === c.id);
    w.competitions.push({
      id: c.id, code: c.code, name: c.name,
      teams: tc.reduce((s, t) => s + t._count._all, 0),
      teamsLmsEnrolled: tc.filter((t) => t.lmsCourseEnrolled).reduce((s, t) => s + t._count._all, 0),
    });
  }

  const overall = byCourse.get(null);
  return {
    totalParticipants: overall?.total ?? 0,
    overall: overall?.breakdown ?? emptyBreakdown(),
    workshops: [...workshops.values()],
  };
}

// ── Participant list (for the XLSX download) ───────────────────────────────

export type WorkshopParticipant = {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  classGrade: string | null;
  ethnicity: string;
  school: string;          // school name, or the contingent name for non-school contingents
  schoolCode: string | null;
  schoolCategory: string;
  state: string;
  competitionCode: string;
  team: string;
};

/** Registered participants of one workshop, once each (first team by competition code). */
export async function getWorkshopParticipants(courseId: string): Promise<WorkshopParticipant[]> {
  const rows = await db.$queryRaw<{
    id: string; name: string; age: number | null; gender: string | null; classGrade: string | null;
    ethnicity: string | null; school: string; schoolCode: string | null; category: string | null;
    state: string | null; competitionCode: string; team: string;
  }[]>`
    SELECT DISTINCT ON (p.id)
           p.id, p.name, p.age, p.gender::text AS gender, p."classGrade", p.ethnicity::text AS ethnicity,
           COALESCE(s.name, ct.name)                                  AS school,
           s.code                                                     AS "schoolCode",
           CASE WHEN ct."contingentType" = 'SCHOOL' THEN s.category::text
                ELSE ct."contingentType"::text END                     AS category,
           COALESCE(ss.name, cs.name)                                 AS state,
           c.code                                                     AS "competitionCode",
           t.name                                                     AS team
    FROM competitions c
    JOIN teams t         ON t."competitionId" = c.id
    JOIN team_members tm ON tm."teamId" = t.id
    JOIN contestants p   ON p.id = tm."contestantId"
    JOIN contingents ct  ON ct.id = p."contingentId"
    LEFT JOIN schools s  ON s.id = ct."schoolId"
    LEFT JOIN states ss  ON ss.id = s."stateId"
    LEFT JOIN states cs  ON cs.id = ct."stateId"
    WHERE c."eptimEduCourseId" = ${courseId}
    ORDER BY p.id, c.code, t.name
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    age: r.age,
    gender: label("gender", r.gender),
    classGrade: r.classGrade?.trim() || null,
    ethnicity: label("ethnicity", r.ethnicity),
    school: r.school,
    schoolCode: r.schoolCode,
    schoolCategory: label("schoolCategory", r.category),
    state: label("state", r.state),
    competitionCode: r.competitionCode,
    team: r.team,
  }));
}
