import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// DELETE /api/v2/organizer/events/[id]/competitions/[ecId]/judging-templates/[jtId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string; jtId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId, jtId } = await params;

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.eventCompetitionJudgingTemplate.deleteMany({
    where: { eventCompetitionId: ecId, judgingTemplateId: jtId },
  });

  return NextResponse.json({ success: true });
}
