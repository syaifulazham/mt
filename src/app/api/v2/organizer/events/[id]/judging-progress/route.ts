import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eventJudgingProgress } from "@/lib/judgingStatus";

export const dynamic = "force-dynamic";

/**
 * GET — judging status and progress of every competition of the event, polled
 * by the organizer's judging page (every 3 s) so judges' "Penghakiman Selesai"
 * announcements, the automatic competition completion and new scores show up
 * without a reload.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(
    { competitions: await eventJudgingProgress(eventId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
