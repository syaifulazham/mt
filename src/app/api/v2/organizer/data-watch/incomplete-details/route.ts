import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logError } from "@/lib/appLogger";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// Incomplete details = no name OR no IC (empty strings count as missing)
const INCOMPLETE_SQL = Prisma.sql`
  (p.name IS NULL OR btrim(p.name) = '' OR p.ic IS NULL OR btrim(p.ic) = '')
`;

// GET /api/v2/organizer/data-watch/incomplete-details
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const limit  = Math.min(Number(req.nextUrl.searchParams.get("limit")  ?? 10), 100);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);

  try {
    const [rows, countResult, noNameResult] = await Promise.all([
      db.$queryRaw<{
        id: string; name: string | null; ic: string | null; contingentName: string;
      }[]>`
        SELECT p.id, p.name, p.ic, c.name AS "contingentName"
        FROM   contestants p
        JOIN   contingents c ON p."contingentId" = c.id
        WHERE  ${INCOMPLETE_SQL}
        ORDER  BY p."createdAt" DESC
        LIMIT  ${Prisma.raw(String(limit))} OFFSET ${Prisma.raw(String(offset))}
      `,
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM contestants p WHERE ${INCOMPLETE_SQL}
      `,
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM contestants p WHERE p.name IS NULL OR btrim(p.name) = ''
      `,
    ]);

    return NextResponse.json({
      data: rows,
      total: Number(countResult[0]?.count ?? 0),
      noNameCount: Number(noNameResult[0]?.count ?? 0),
    });
  } catch (err) {
    logError("data-watch/incomplete-details", err);
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }
}

// DELETE /api/v2/organizer/data-watch/incomplete-details
// body: { mode: "all" | "noName" | "selected", ids?: string[] }
export async function DELETE(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({})) as { mode?: string; ids?: string[] };
    const mode = body.mode;

    // Resolve target participant ids with raw SQL so whitespace-only names/ICs
    // are caught exactly like the GET listing (btrim).
    let targets: { id: string }[];
    if (mode === "all") {
      targets = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM contestants
        WHERE name IS NULL OR btrim(name) = '' OR ic IS NULL OR btrim(ic) = ''
      `;
    } else if (mode === "noName") {
      targets = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM contestants
        WHERE name IS NULL OR btrim(name) = ''
      `;
    } else if (mode === "selected") {
      const selIds = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === "string") : [];
      if (selIds.length === 0) return NextResponse.json({ error: "NO_IDS" }, { status: 400 });
      // Constrain to incomplete rows only (safety)
      targets = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM contestants
        WHERE id IN (${Prisma.join(selIds)})
          AND (name IS NULL OR btrim(name) = '' OR ic IS NULL OR btrim(ic) = '')
      `;
    } else {
      return NextResponse.json({ error: "INVALID_MODE" }, { status: 400 });
    }

    const ids = targets.map(t => t.id);
    if (ids.length === 0) return NextResponse.json({ deleted: 0 });

    // walkInRegistrations / walkInFormSubmissions have no cascade — remove first.
    // team_members, sessions, drone_accesses, judging scores cascade automatically.
    const [, , result] = await db.$transaction([
      db.walkInFormSubmission.deleteMany({ where: { participantId: { in: ids } } }),
      db.walkInRegistration.deleteMany({ where: { participantId: { in: ids } } }),
      db.participant.deleteMany({ where: { id: { in: ids } } }),
    ]);

    return NextResponse.json({ deleted: result.count });
  } catch (err) {
    logError("data-watch/incomplete-details DELETE", err);
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }
}
