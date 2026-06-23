import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// Age → expected grade:
//   7  → Darjah 1  …  12 → Darjah 6
//   13 → Tingkatan 1 … 17 → Tingkatan 5

const GRADE_CTE = Prisma.sql`
  WITH ic_clean AS (
    SELECT id, name, ic, "classGrade", "contingentId",
           REGEXP_REPLACE(ic, '[^0-9]', '', 'g') AS ic_digits
    FROM   contestants
    WHERE  LENGTH(REGEXP_REPLACE(ic, '[^0-9]', '', 'g')) = 12
  ),
  with_age AS (
    SELECT *,
      EXTRACT(YEAR FROM NOW())::int
        - CASE
            WHEN CAST(SUBSTRING(ic_digits,1,2) AS INT)
                 <= EXTRACT(YEAR FROM NOW())::int % 100
            THEN 2000 + CAST(SUBSTRING(ic_digits,1,2) AS INT)
            ELSE 1900 + CAST(SUBSTRING(ic_digits,1,2) AS INT)
          END AS age
    FROM ic_clean
  ),
  with_expected AS (
    SELECT *,
      CASE
        WHEN age BETWEEN 7  AND 12 THEN 'Darjah '    || (age -  6)::text
        WHEN age BETWEEN 13 AND 17 THEN 'Tingkatan ' || (age - 12)::text
        ELSE NULL
      END AS expected_grade
    FROM with_age
  )
`;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const limit  = Math.min(Number(req.nextUrl.searchParams.get("limit")  ?? 10), 100);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);

  try {
    const [rows, countResult] = await Promise.all([
      db.$queryRaw<{
        id: string; name: string; ic: string;
        classGrade: string | null; age: number; expectedGrade: string;
        contingentName: string;
      }[]>`
        ${GRADE_CTE}
        SELECT w.id, w.name, w.ic,
               w."classGrade", w.age::int,
               w.expected_grade AS "expectedGrade",
               c.name           AS "contingentName"
        FROM   with_expected w
        JOIN   contingents c ON w."contingentId" = c.id
        WHERE  w.expected_grade IS NOT NULL
          AND  (w."classGrade" IS DISTINCT FROM w.expected_grade)
        ORDER  BY w.age ASC, w.name ASC
        LIMIT  ${Prisma.raw(String(limit))}
        OFFSET ${Prisma.raw(String(offset))}
      `,
      db.$queryRaw<{ count: bigint }[]>`
        ${GRADE_CTE}
        SELECT COUNT(*)::bigint AS count
        FROM   with_expected
        WHERE  expected_grade IS NOT NULL
          AND  ("classGrade" IS DISTINCT FROM expected_grade)
      `,
    ]);

    return NextResponse.json({ data: rows, total: Number(countResult[0]?.count ?? 0) });
  } catch (err) {
    console.error("[data-watch/wrong-grade]", err);
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }
}
