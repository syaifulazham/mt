import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const limit  = Math.min(Number(req.nextUrl.searchParams.get("limit")  ?? 10), 100);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);

  const [rows, countResult] = await Promise.all([
    db.$queryRaw<{ id: string; name: string; ic: string | null; contingentName: string }[]>`
      SELECT p.id, p.name, p.ic, c.name AS "contingentName"
      FROM participants p
      JOIN contingents c ON p."contingentId" = c.id
      WHERE p.ic IS NULL
         OR LENGTH(REGEXP_REPLACE(p.ic, '[^0-9]', '', 'g')) < 12
      ORDER BY p."createdAt" DESC
      LIMIT ${Prisma.raw(String(limit))} OFFSET ${Prisma.raw(String(offset))}
    `,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM participants
      WHERE ic IS NULL
         OR LENGTH(REGEXP_REPLACE(ic, '[^0-9]', '', 'g')) < 12
    `,
  ]);

  return NextResponse.json({ data: rows, total: Number(countResult[0]?.count ?? 0) });
}
