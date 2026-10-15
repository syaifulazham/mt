import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { walkInJudgingProgress } from "@/lib/judgingStatus";

export const dynamic = "force-dynamic";

/**
 * GET — judging status and progress of every walk-in competition of the event,
 * polled every 3 s by the walk-in judging page.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(
    { competitions: await walkInJudgingProgress(eventId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
