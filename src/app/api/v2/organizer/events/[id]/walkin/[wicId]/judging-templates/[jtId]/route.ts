import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// DELETE /api/v2/organizer/events/[id]/walkin/[wicId]/judging-templates/[jtId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string; jtId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, wicId, jtId } = await params;

  const wic = await db.eventWalkInCompetition.findFirst({ where: { id: wicId, eventId } });
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.eventWalkInCompetitionJudgingTemplate.deleteMany({
    where: { walkInCompetitionId: wicId, judgingTemplateId: jtId },
  });

  return NextResponse.json({ success: true });
}
