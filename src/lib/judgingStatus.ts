import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Judging lifecycle of one event-competition (EventCompetition.judgingStatus):
//
//   OPEN       judges score through their judging forms
//   COMPLETED  judging announced complete — every judging form is locked
//   VERIFIED   a Super Admin has verified the results; still locked
//
// Admins and Super Admins announce completion; only a Super Admin verifies or
// reopens (back to OPEN, which unlocks the forms).
//
// A judge can also announce their own task complete from the judging page
// (JudgingTask.completedAt), which locks that task's form. When every ACTIVE
// task of the competition is complete, the competition moves to COMPLETED.

export const JUDGING_STATUSES = ["OPEN", "COMPLETED", "VERIFIED"] as const;
export type JudgingStatus = typeof JUDGING_STATUSES[number];

/** Scores can't be written, and judging tasks can't be changed, unless OPEN. */
export const judgingLocked = (status: string) => status !== "OPEN";

const MSG_COMPETITION = "Penghakiman bagi pertandingan ini telah diumumkan selesai dan dikunci.";
const MSG_TASK        = "Tugas penghakiman ini telah diumumkan selesai dan dikunci.";

/** Error body every locked write returns, so clients can show one message. */
export const JUDGING_LOCKED = { error: "JUDGING_LOCKED", message: MSG_COMPETITION } as const;

/** What a judging form needs to know about its lock. */
export type TaskJudgingState = {
  locked: boolean;
  /** "task" = this judge announced their task complete; "competition" = the whole competition. */
  reason: "task" | "competition" | null;
  message: string | null;
  judgingStatus: string;
  taskCompletedAt: string | null;
};

export function taskJudgingState(task: { completedAt: Date | null }, judgingStatus: string): TaskJudgingState {
  const competition = judgingLocked(judgingStatus);
  const reason = competition ? "competition" : task.completedAt ? "task" : null;
  return {
    locked: reason !== null,
    reason,
    message: reason === "competition" ? MSG_COMPETITION : reason === "task" ? MSG_TASK : null,
    judgingStatus,
    taskCompletedAt: task.completedAt?.toISOString() ?? null,
  };
}

/**
 * Judging progress of an event, per event-competition — what the organizer's
 * judging page shows and polls: lifecycle fields, teams entered (ACTIVE teams
 * in the event, the set the judging form lists), and per task the teams with
 * at least one score plus the judge's completion.
 */
export async function eventJudgingProgress(eventId: string) {
  const ecs = await db.eventCompetition.findMany({
    where:  { eventId },
    select: {
      id: true, competitionId: true,
      judgingStatus: true, judgingCompletedAt: true, judgingCompletedBy: true,
      judgingVerifiedAt: true, judgingVerifiedBy: true,
      judgingTasks: { select: { id: true, status: true, completedAt: true } },
    },
  });
  const taskIds = ecs.flatMap((ec) => ec.judgingTasks.map((t) => t.id));
  const [entered, judged] = await Promise.all([
    db.$queryRaw<{ competitionId: string; n: number }[]>`
      SELECT t."competitionId", COUNT(*)::int AS n
      FROM team_events te JOIN teams t ON t.id = te."teamId"
      WHERE te."eventId" = ${eventId} AND t.status = 'ACTIVE'
      GROUP BY 1`,
    taskIds.length === 0 ? Promise.resolve([] as { judgingTaskId: string; n: number }[]) : db.$queryRaw<{ judgingTaskId: string; n: number }[]>`
      SELECT "judgingTaskId", COUNT(DISTINCT "teamId")::int AS n
      FROM judging_scores
      WHERE "judgingTaskId" IN (${Prisma.join(taskIds)})
      GROUP BY 1`,
  ]);
  const enteredBy = new Map(entered.map((r) => [r.competitionId, r.n]));
  const judgedBy  = new Map(judged.map((r) => [r.judgingTaskId, r.n]));

  return ecs.map((ec) => ({
    id:                 ec.id,
    judgingStatus:      ec.judgingStatus,
    judgingCompletedAt: ec.judgingCompletedAt?.toISOString() ?? null,
    judgingCompletedBy: ec.judgingCompletedBy,
    judgingVerifiedAt:  ec.judgingVerifiedAt?.toISOString() ?? null,
    judgingVerifiedBy:  ec.judgingVerifiedBy,
    teamCount:          enteredBy.get(ec.competitionId) ?? 0,
    tasks: ec.judgingTasks.map((t) => ({
      id: t.id, status: t.status,
      completedAt: t.completedAt?.toISOString() ?? null,
      judgedTeams: judgedBy.get(t.id) ?? 0,
    })),
  }));
}
export type EventJudgingProgress = Awaited<ReturnType<typeof eventJudgingProgress>>;

/**
 * After a task is announced complete: if every ACTIVE task of the competition
 * now is, move the competition OPEN → COMPLETED (conditional, so it can't
 * overwrite an organizer's own announcement or a reopen in between).
 * Returns the competition's resulting status.
 */
export async function completeCompetitionIfAllTasksDone(eventCompetitionId: string): Promise<string> {
  const remaining = await db.judgingTask.count({
    where: { eventCompetitionId, status: "ACTIVE", completedAt: null },
  });
  if (remaining === 0) {
    await db.eventCompetition.updateMany({
      where: { id: eventCompetitionId, judgingStatus: "OPEN" },
      data: {
        judgingStatus: "COMPLETED",
        judgingCompletedAt: new Date(),
        judgingCompletedBy: "Semua hakim (automatik)",
        judgingVerifiedAt: null, judgingVerifiedBy: null,
      },
    });
  }
  const ec = await db.eventCompetition.findUnique({ where: { id: eventCompetitionId }, select: { judgingStatus: true } });
  return ec?.judgingStatus ?? "OPEN";
}
