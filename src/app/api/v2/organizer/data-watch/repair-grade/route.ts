import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

function computeExpectedGrade(ic: string): string | null {
  const digits = ic.replace(/\D/g, "");
  if (digits.length !== 12) return null;
  const yy = parseInt(digits.slice(0, 2), 10);
  const currentYear = new Date().getFullYear();
  const birthYear = yy <= currentYear % 100 ? 2000 + yy : 1900 + yy;
  const age = currentYear - birthYear;
  if (age >= 7  && age <= 12) return `Darjah ${age - 6}`;
  if (age >= 13 && age <= 17) return `Tingkatan ${age - 12}`;
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : undefined;

    // Selective repair: use Prisma per-record update for the given IDs
    if (ids) {
      const participants = await db.participant.findMany({
        where: { id: { in: ids } },
        select: { id: true, ic: true, classGrade: true },
      });

      let updated = 0;
      for (const p of participants) {
        if (!p.ic) continue;
        const expected = computeExpectedGrade(p.ic);
        if (expected && expected !== p.classGrade) {
          await db.participant.update({ where: { id: p.id }, data: { classGrade: expected } });
          updated++;
        }
      }
      return NextResponse.json({ updated });
    }

    // Repair all: raw SQL for efficiency
    const result = await db.$executeRaw`
      WITH ic_clean AS (
        SELECT id,
               REGEXP_REPLACE(ic, '[^0-9]', '', 'g') AS ic_digits
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
      with_expected AS (
        SELECT id,
          CASE
            WHEN age BETWEEN 7  AND 12 THEN 'Darjah '    || (age -  6)::text
            WHEN age BETWEEN 13 AND 17 THEN 'Tingkatan ' || (age - 12)::text
            ELSE NULL
          END AS expected_grade
        FROM with_age
      )
      UPDATE contestants p
      SET    "classGrade" = we.expected_grade
      FROM   with_expected we
      WHERE  p.id = we.id
        AND  we.expected_grade IS NOT NULL
        AND  (p."classGrade" IS DISTINCT FROM we.expected_grade)
    `;

    return NextResponse.json({ updated: result });
  } catch (err) {
    console.error("[data-watch/repair-grade]", err);
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }
}
