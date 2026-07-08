import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const CANONICAL_GRADES = [
  "Prasekolah 5thn", "Prasekolah 6thn",
  "Darjah 1", "Darjah 2", "Darjah 3", "Darjah 4", "Darjah 5", "Darjah 6",
  "Tingkatan 1", "Tingkatan 2", "Tingkatan 3", "Tingkatan 4", "Tingkatan 5",
  "Tingkatan Peralihan",
];

const GRADE_CTE = Prisma.sql`
  WITH ic_clean AS (
    SELECT id, REGEXP_REPLACE(ic, '[^0-9]', '', 'g') AS ic_digits
    FROM   contestants
    WHERE  LENGTH(REGEXP_REPLACE(ic, '[^0-9]', '', 'g')) = 12
  ),
  with_age AS (
    SELECT id,
      EXTRACT(YEAR FROM NOW())::int
        - CASE
            WHEN CAST(SUBSTRING(ic_digits,1,2) AS INT)
                 <= EXTRACT(YEAR FROM NOW())::int % 100
            THEN 2000 + CAST(SUBSTRING(ic_digits,1,2) AS INT)
            ELSE 1900 + CAST(SUBSTRING(ic_digits,1,2) AS INT)
          END AS age
    FROM ic_clean
  ),
  with_suggestion AS (
    SELECT id, age,
      CASE
        WHEN age BETWEEN 7  AND 12 THEN 'Darjah '    || (age -  6)::text
        WHEN age BETWEEN 13 AND 17 THEN 'Tingkatan ' || (age - 12)::text
        ELSE NULL
      END AS suggested_grade
    FROM with_age
  )
`;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const limit       = Math.min(Number(sp.get("limit")  ?? 10), 100);
  const offset      = Number(sp.get("offset") ?? 0);
  const search      = sp.get("search")?.trim() ?? "";
  const gradeFilter = sp.get("gradeFilter") ?? "";

  const canonicalList = Prisma.join(CANONICAL_GRADES);

  const searchClause = search
    ? Prisma.sql`AND (c.name ILIKE ${`%${search}%`} OR c.ic ILIKE ${`%${search}%`} OR c."classGrade" ILIKE ${`%${search}%`})`
    : Prisma.empty;

  const gradeClause = gradeFilter === "__NULL__"
    ? Prisma.sql`AND c."classGrade" IS NULL`
    : gradeFilter
      ? Prisma.sql`AND c."classGrade" = ${gradeFilter}`
      : Prisma.empty;

  try {
    const [rows, countResult] = await Promise.all([
      db.$queryRaw<{
        id: string; name: string; ic: string | null;
        classGrade: string | null; age: number;
        suggestedGrade: string | null; contingentName: string;
      }[]>`
        ${GRADE_CTE}
        SELECT
          c.id, c.name, c.ic, c."classGrade",
          COALESCE(ws.age::int, 0)  AS age,
          ws.suggested_grade        AS "suggestedGrade",
          cont.name                 AS "contingentName"
        FROM   contestants c
        JOIN   contingents cont ON cont.id = c."contingentId"
        LEFT   JOIN with_suggestion ws ON ws.id = c.id
        WHERE  (c."classGrade" IS NULL OR c."classGrade" NOT IN (${canonicalList}))
        ${searchClause}
        ${gradeClause}
        ORDER  BY c.name ASC
        LIMIT  ${Prisma.raw(String(limit))}
        OFFSET ${Prisma.raw(String(offset))}
      `,
      db.$queryRaw<{ count: bigint }[]>`
        ${GRADE_CTE}
        SELECT COUNT(*)::bigint AS count
        FROM   contestants c
        LEFT   JOIN with_suggestion ws ON ws.id = c.id
        WHERE  (c."classGrade" IS NULL OR c."classGrade" NOT IN (${canonicalList}))
        ${searchClause}
        ${gradeClause}
      `,
    ]);

    return NextResponse.json({ data: rows, total: Number(countResult[0]?.count ?? 0) });
  } catch (err) {
    console.error("[data-watch/wrong-grade]", err);
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }
}
