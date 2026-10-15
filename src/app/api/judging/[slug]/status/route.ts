import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskJudgingState } from "@/lib/judgingStatus";

export const dynamic = "force-dynamic";

/**
 * GET /api/judging/[slug]/status — the task's lock state, polled by every open
 * judging page so an announcement (by this judge, another judge's last task
 * completing the competition, or an organizer) shows up within seconds.
 * Carries no scores or team data, so it needs no passcode; the slug itself is
 * an unguessable 20-hex-character id.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const task = await db.judgingTask.findUnique({
    where:  { routeSlug: slug },
    select: { status: true, completedAt: true, eventCompetition: { select: { judgingStatus: true } } },
  });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(
    { taskStatus: task.status, judging: taskJudgingState(task, task.eventCompetition.judgingStatus) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
