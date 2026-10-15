import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeIfAllTasksDone, taskLockMap } from "@/lib/judgingStatus";

/**
 * POST /api/judging/[slug]/complete  body: { passcode, stateId? }
 *
 * The judge announces their task complete from the judging page — for the
 * whole task (no stateId, "Kebangsaan") or for one state. That locks the
 * task's form for all teams, or only for that state's teams. When it was the
 * last ACTIVE task still open (nationally, or for that state), the
 * competition's national row / that state's row moves to COMPLETED, awaiting
 * Super Admin verification. The page's typed 5-character code is a client-side
 * guard against an accidental click; the passcode authorises.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode, stateId } = await req.json().catch(() => ({})) as { passcode?: string; stateId?: string | null };
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
  if (stateId) {
    if (!(await db.state.findUnique({ where: { id: stateId }, select: { id: true } })))
      return NextResponse.json({ error: "INVALID_STATE_ID" }, { status: 400 });
    await db.judgingTaskStateCompletion.upsert({
      where:  { scope_taskId_stateId: { scope: "event", taskId: task.id, stateId } },
      create: { scope: "event", taskId: task.id, stateId },
      update: {},
    });
  } else {
    await db.judgingTask.updateMany({ where: { id: task.id, completedAt: null }, data: { completedAt: new Date() } });
  }
  await completeIfAllTasksDone("event", task.eventCompetitionId, stateId);

  const fresh = await db.judgingTask.findUnique({
    where: { id: task.id }, select: { id: true, completedAt: true, eventCompetition: { select: { judgingStatus: true } } },
  });
  const locks = await taskLockMap("event", fresh!, task.eventCompetitionId, fresh!.eventCompetition.judgingStatus);
  return NextResponse.json({ judging: locks.national, locks });
}
