import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string; ecId: string }> };

// GET — how many certificates (any template, not revoked) each team of this
// competition has, for the Scoreboard's Sijil column. Certificates are matched
// by their own eventId / competitionId / teamId columns (archival snapshot).
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, ecId } = await params;
  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId: id }, select: { competitionId: true } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const rows = await db.certificate.groupBy({
    by: ["teamId"],
    where: { eventId: id, competitionId: ec.competitionId, teamId: { not: null }, status: { not: "REVOKED" }, revokedAt: null },
    _count: { _all: true },
  });
  return NextResponse.json({ teams: Object.fromEntries(rows.map(r => [r.teamId!, r._count._all])) });
}
