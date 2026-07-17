import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId } = await params;
  const { sourceEventId } = await req.json();
  if (!sourceEventId)
    return NextResponse.json({ error: "MISSING_SOURCE_EVENT" }, { status: 400 });
  if (sourceEventId === eventId)
    return NextResponse.json({ error: "SAME_EVENT" }, { status: 400 });

  const sourceEcs = await db.eventCompetition.findMany({
    where: { eventId: sourceEventId },
    select: { competitionId: true },
  });
  if (sourceEcs.length === 0)
    return NextResponse.json({ added: 0, skipped: 0 });

  const existing = await db.eventCompetition.findMany({
    where: { eventId, competitionId: { in: sourceEcs.map((e) => e.competitionId) } },
    select: { competitionId: true },
  });
  const existingIds = new Set(existing.map((e) => e.competitionId));
  const toAdd = sourceEcs.filter((e) => !existingIds.has(e.competitionId));

  if (toAdd.length > 0) {
    await db.eventCompetition.createMany({
      data: toAdd.map((e) => ({ eventId, competitionId: e.competitionId })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ added: toAdd.length, skipped: existingIds.size });
}
