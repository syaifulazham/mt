import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeIfAllTasksDone, taskJudgingState } from "@/lib/judgingStatus";

/**
 * POST /api/judging/[slug]/complete  body: { passcode }
 *
 * The judge announces their task complete from the judging page: the task's
 * form locks, and when it was the competition's last ACTIVE task still open,
 * the competition moves to COMPLETED (awaiting Super Admin verification).
 * Only a Super Admin can reopen. The page's typed 5-character code is a
 * client-side guard against an accidental click; the passcode authorises.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode } = await req.json().catch(() => ({})) as { passcode?: string };
  if (!passcode) return NextResponse.json({ error: "MISSING_PASSCODE" }, { status: 400 });

  const task = await db.judgingTask.findUnique({
    where:  { routeSlug: slug },
    select: { id: true, status: true, passcode: true, eventCompetitionId: true },
  });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (task.passcode !== passcode.trim().toUpperCase())
    return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });
  if (task.status === "CLOSED") return NextResponse.json({ error: "TASK_CLOSED" }, { status: 403 });

  // Idempotent: a second click (or another device) keeps the first timestamp.
  await db.judgingTask.updateMany({ where: { id: task.id, completedAt: null }, data: { completedAt: new Date() } });
  const judgingStatus = await completeIfAllTasksDone("event", task.eventCompetitionId);

  const fresh = await db.judgingTask.findUnique({ where: { id: task.id }, select: { completedAt: true } });
  return NextResponse.json({ judging: taskJudgingState({ completedAt: fresh?.completedAt ?? new Date() }, judgingStatus) });
}
