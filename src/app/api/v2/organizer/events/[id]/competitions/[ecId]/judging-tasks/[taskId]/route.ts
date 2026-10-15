import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { JUDGING_LOCKED, judgingLocked, cleanupTaskStateCompletions } from "@/lib/judgingStatus";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// While judging is announced complete or verified, tasks are frozen too:
// deleting one would delete its scores, and reopening one would let judging
// resume behind the announcement.
function findTask(taskId: string, ecId: string, eventId: string) {
  return db.judgingTask.findFirst({
    where:   { id: taskId, eventCompetitionId: ecId, eventCompetition: { eventId } },
    include: { eventCompetition: { select: { judgingStatus: true } } },
  });
}

// PATCH — update label or status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string; taskId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId, taskId } = await params;
  const task = await findTask(taskId, ecId, eventId);
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (judgingLocked(task.eventCompetition.judgingStatus)) return NextResponse.json(JUDGING_LOCKED, { status: 423 });

  const { label, status, reopenCompletion } = await req.json().catch(() => ({}));
  // Undoing a judge's "judging complete" announcement: Super Admin only.
  if (reopenCompletion && session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const updated = await db.judgingTask.update({
    where: { id: taskId },
    data: {
      ...(label  !== undefined && { label:  label?.trim() || null }),
      ...(status !== undefined && { status }),
      ...(reopenCompletion === true && { completedAt: null }),
    },
    include: { judgingTemplate: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json({ task: updated });
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string; taskId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId, taskId } = await params;
  const task = await findTask(taskId, ecId, eventId);
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (judgingLocked(task.eventCompetition.judgingStatus)) return NextResponse.json(JUDGING_LOCKED, { status: 423 });

  await db.judgingTask.delete({ where: { id: taskId } });
  await cleanupTaskStateCompletions("event", taskId);
  return NextResponse.json({ success: true });
}
