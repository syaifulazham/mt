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
 * The same for walk-in judging, per walk-in competition: the judgeable set is
 * its CONFIRMED walk-in registrations, and per endpoint the participants with
 * at least one score. Same shape as eventJudgingProgress (teamCount = participants).
 */
export async function walkInJudgingProgress(eventId: string) {
  const wics = await db.eventWalkInCompetition.findMany({
    where:  { eventId },
    select: {
      id: true,
      judgingStatus: true, judgingCompletedAt: true, judgingCompletedBy: true,
      judgingVerifiedAt: true, judgingVerifiedBy: true,
      judgingEndpoints: { select: { id: true, status: true, completedAt: true } },
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });
  const endpointIds = wics.flatMap((w) => w.judgingEndpoints.map((e) => e.id));
  const judged = endpointIds.length === 0 ? [] : await db.$queryRaw<{ endpointId: string; n: number }[]>`
    SELECT "walkInJudgingEndpointId" AS "endpointId", COUNT(DISTINCT "walkInRegistrationId")::int AS n
    FROM walkin_judging_scores
    WHERE "walkInJudgingEndpointId" IN (${Prisma.join(endpointIds)})
    GROUP BY 1`;
  const judgedBy = new Map(judged.map((r) => [r.endpointId, r.n]));

  return wics.map((w) => ({
    id:                 w.id,
    judgingStatus:      w.judgingStatus,
    judgingCompletedAt: w.judgingCompletedAt?.toISOString() ?? null,
    judgingCompletedBy: w.judgingCompletedBy,
    judgingVerifiedAt:  w.judgingVerifiedAt?.toISOString() ?? null,
    judgingVerifiedBy:  w.judgingVerifiedBy,
    teamCount:          w._count.registrations,
    tasks: w.judgingEndpoints.map((e) => ({
      id: e.id, status: e.status,
      completedAt: e.completedAt?.toISOString() ?? null,
      judgedTeams: judgedBy.get(e.id) ?? 0,
    })),
  }));
}

// ── Lifecycle operations, shared by regular ("event") and walk-in judging ──

/** Which judging a lifecycle operation applies to. */
export type JudgingScope = "event" | "walkin";

const LIFECYCLE_SELECT = {
  judgingStatus: true, judgingCompletedAt: true, judgingCompletedBy: true,
  judgingVerifiedAt: true, judgingVerifiedBy: true,
} as const;

type LifecycleData = {
  judgingStatus: string;
  judgingCompletedAt?: Date | null; judgingCompletedBy?: string | null;
  judgingVerifiedAt?: Date | null;  judgingVerifiedBy?: string | null;
};

// The two lifecycle owners (EventCompetition / EventWalkInCompetition) and their
// tasks (JudgingTask / WalkInJudgingEndpoint) have the same columns, so each
// operation is written once against these small adapters.
const SCOPES = {
  event: {
    update:    (id: string, eventId: string, from: string[], data: LifecycleData) =>
      db.eventCompetition.updateMany({ where: { id, eventId, judgingStatus: { in: from } }, data }),
    find:      (id: string, eventId?: string) =>
      db.eventCompetition.findFirst({ where: { id, ...(eventId && { eventId }) }, select: LIFECYCLE_SELECT }),
    openTasks: (id: string) => db.judgingTask.count({ where: { eventCompetitionId: id, status: "ACTIVE", completedAt: null } }),
    reopenTasks: (id: string) => db.judgingTask.updateMany({ where: { eventCompetitionId: id }, data: { completedAt: null } }),
  },
  walkin: {
    update:    (id: string, eventId: string, from: string[], data: LifecycleData) =>
      db.eventWalkInCompetition.updateMany({ where: { id, eventId, judgingStatus: { in: from } }, data }),
    find:      (id: string, eventId?: string) =>
      db.eventWalkInCompetition.findFirst({ where: { id, ...(eventId && { eventId }) }, select: LIFECYCLE_SELECT }),
    openTasks: (id: string) => db.walkInJudgingEndpoint.count({ where: { walkInCompetitionId: id, status: "ACTIVE", completedAt: null } }),
    reopenTasks: (id: string) => db.walkInJudgingEndpoint.updateMany({ where: { walkInCompetitionId: id }, data: { completedAt: null } }),
  },
} as const;

/**
 * Organizer transitions:
 *   complete  OPEN      → COMPLETED   Super Admin, Admin   (locks judge forms)
 *   verify    COMPLETED → VERIFIED    Super Admin
 *   reopen    COMPLETED / VERIFIED → OPEN   Super Admin  (unlocks; also reopens judges' task announcements)
 * Conditional on the expected current status, so concurrent clicks can't skip
 * a step or verify a reopened judging. Returns an HTTP status + JSON body.
 */
const TRANSITIONS = {
  complete: { from: ["OPEN"],                  roles: ["SUPER_ADMIN", "ADMIN"] },
  verify:   { from: ["COMPLETED"],             roles: ["SUPER_ADMIN"] },
  reopen:   { from: ["COMPLETED", "VERIFIED"], roles: ["SUPER_ADMIN"] },
} as const;

export async function transitionJudging(
  scope: JudgingScope, eventId: string, id: string, action: string | undefined,
  actor: { role: string; name?: string | null; email?: string | null },
): Promise<{ status: number; body: unknown }> {
  if (!action || !(action in TRANSITIONS)) return { status: 400, body: { error: "INVALID_ACTION" } };
  const t = TRANSITIONS[action as keyof typeof TRANSITIONS];
  if (!(t.roles as readonly string[]).includes(actor.role)) return { status: 403, body: { error: "FORBIDDEN" } };

  const now = new Date();
  const by  = actor.name || actor.email || "Organizer";
  const data: LifecycleData =
    action === "complete" ? { judgingStatus: "COMPLETED", judgingCompletedAt: now, judgingCompletedBy: by,
                              judgingVerifiedAt: null, judgingVerifiedBy: null }
    : action === "verify" ? { judgingStatus: "VERIFIED", judgingVerifiedAt: now, judgingVerifiedBy: by }
    :                       { judgingStatus: "OPEN", judgingCompletedAt: null, judgingCompletedBy: null,
                              judgingVerifiedAt: null, judgingVerifiedBy: null };

  const s = SCOPES[scope];
  const { count } = await s.update(id, eventId, [...t.from], data);
  if (count === 0) {
    const cur = await s.find(id, eventId);
    if (!cur) return { status: 404, body: { error: "NOT_FOUND" } };
    return { status: 409, body: { error: "INVALID_STATE", message: `Status penghakiman semasa ialah ${cur.judgingStatus}. Muat semula halaman.` } };
  }
  if (action === "reopen") await s.reopenTasks(id);
  return { status: 200, body: { judging: await s.find(id) } };
}

/**
 * After a judge announces their task complete: if every ACTIVE task of the
 * competition now is, move it OPEN → COMPLETED (conditional, so it can't
 * overwrite an organizer's own announcement or a reopen in between).
 * Returns the resulting status.
 */
export async function completeIfAllTasksDone(scope: JudgingScope, id: string): Promise<string> {
  const s = SCOPES[scope];
  if (await s.openTasks(id) === 0) {
    await s.update(id, (await scopeEventId(scope, id)) ?? "", ["OPEN"], {
      judgingStatus: "COMPLETED", judgingCompletedAt: new Date(), judgingCompletedBy: "Semua hakim (automatik)",
      judgingVerifiedAt: null, judgingVerifiedBy: null,
    });
  }
  return (await s.find(id))?.judgingStatus ?? "OPEN";
}

async function scopeEventId(scope: JudgingScope, id: string) {
  const row = scope === "event"
    ? await db.eventCompetition.findUnique({ where: { id }, select: { eventId: true } })
    : await db.eventWalkInCompetition.findUnique({ where: { id }, select: { eventId: true } });
  return row?.eventId;
}
