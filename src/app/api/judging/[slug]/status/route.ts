import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskLockMap } from "@/lib/judgingStatus";

export const dynamic = "force-dynamic";

/**
 * GET /api/judging/[slug]/status — the task's lock state, nationally
 * (`judging`) and per state (`locks.states`), polled by every open judging
 * page so an announcement (by this judge, another judge's last task completing
 * the competition or a state, or an organizer) shows up within seconds.
 * Carries no scores or team data, so it needs no passcode; the slug itself is
 * an unguessable 20-hex-character id.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const task = await db.judgingTask.findUnique({
    where:  { routeSlug: slug },
    select: { id: true, status: true, completedAt: true, eventCompetition: { select: { id: true, judgingStatus: true } } },
  });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const locks = await taskLockMap("event", task, task.eventCompetition.id, task.eventCompetition.judgingStatus);
  return NextResponse.json(
    { taskStatus: task.status, judging: locks.national, locks },
    { headers: { "Cache-Control": "no-store" } },
  );
}
