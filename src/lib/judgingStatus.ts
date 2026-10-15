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

// ── Per-state judging ─────────────────────────────────────────────────────────
//
// Each state of a competition has its own lifecycle row (JudgingStateStatus);
// the competition-level fields are the national "Semua" row. A judge can also
// announce their task complete for one state (JudgingTaskStateCompletion).
// A team is locked when the national row isn't OPEN, its task is complete
// nationally, its state's row isn't OPEN, or its task is complete for its state.

/** Which judging a lifecycle operation applies to. */
export type JudgingScope = "event" | "walkin";

const MSG_STATE      = "Penghakiman bagi negeri ini telah diumumkan selesai dan dikunci.";
const MSG_TASK_STATE = "Tugas penghakiman ini telah diumumkan selesai bagi negeri ini dan dikunci.";

/** The effective state of a contingent — own state, else its school's / institution's. */
export function contingentStateId(c: {
  stateId?: string | null;
  school?: { stateId?: string | null } | null;
  higherInstitution?: { stateId?: string | null } | null;
}): string | null {
  return c.stateId ?? c.school?.stateId ?? c.higherInstitution?.stateId ?? null;
}

/** Lock of one task within one state. */
export type StateLock = {
  locked: boolean;
  /** "state" = the competition's row for the state; "task" = this judge completed the state. */
  reason: "state" | "task" | null;
  message: string | null;
  judgingStatus: string;
  taskCompletedAt: string | null;
};

/** What a judging board needs: the national lock plus every state's lock. */
export type TaskLockMap = {
  national: TaskJudgingState;
  /** Only states with a non-OPEN row or a task completion; absent = open. */
  states: Record<string, StateLock>;
};

/** Is a team of `stateId` locked on this task? */
export function teamLocked(map: TaskLockMap, stateId: string | null): { locked: boolean; message: string | null } {
  if (map.national.locked) return { locked: true, message: map.national.message };
  const st = stateId ? map.states[stateId] : undefined;
  return st?.locked ? { locked: true, message: st.message } : { locked: false, message: null };
}

/** Lock map of one task (JudgingTask / WalkInJudgingEndpoint) of competition `refId`. */
export async function taskLockMap(
  scope: JudgingScope, task: { id: string; completedAt: Date | null }, refId: string, nationalStatus: string,
): Promise<TaskLockMap> {
  const [rows, done] = await Promise.all([
    db.judgingStateStatus.findMany({ where: { scope, refId, judgingStatus: { not: "OPEN" } }, select: { stateId: true, judgingStatus: true } }),
    db.judgingTaskStateCompletion.findMany({ where: { scope, taskId: task.id }, select: { stateId: true, completedAt: true } }),
  ]);
  const states: Record<string, StateLock> = {};
  for (const r of rows)
    states[r.stateId] = { locked: true, reason: "state", message: MSG_STATE, judgingStatus: r.judgingStatus, taskCompletedAt: null };
  for (const d of done) {
    const cur = states[d.stateId];
    states[d.stateId] = cur
      ? { ...cur, taskCompletedAt: d.completedAt.toISOString() }
      : { locked: true, reason: "task", message: MSG_TASK_STATE, judgingStatus: "OPEN", taskCompletedAt: d.completedAt.toISOString() };
  }
  return { national: taskJudgingState(task, nationalStatus), states };
}

// ── Lifecycle operations, shared by regular ("event") and walk-in judging ──

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
      db.eventCompetition.findFirst({ where: { id, ...(eventId && { eventId }) }, select: { ...LIFECYCLE_SELECT, eventId: true } }),
    tasks:     (id: string) => db.judgingTask.findMany({ where: { eventCompetitionId: id }, select: { id: true, status: true, completedAt: true } }),
    reopenTasks: (id: string) => db.judgingTask.updateMany({ where: { eventCompetitionId: id }, data: { completedAt: null } }),
  },
  walkin: {
    update:    (id: string, eventId: string, from: string[], data: LifecycleData) =>
      db.eventWalkInCompetition.updateMany({ where: { id, eventId, judgingStatus: { in: from } }, data }),
    find:      (id: string, eventId?: string) =>
      db.eventWalkInCompetition.findFirst({ where: { id, ...(eventId && { eventId }) }, select: { ...LIFECYCLE_SELECT, eventId: true } }),
    tasks:     (id: string) => db.walkInJudgingEndpoint.findMany({ where: { walkInCompetitionId: id }, select: { id: true, status: true, completedAt: true } }),
    reopenTasks: (id: string) => db.walkInJudgingEndpoint.updateMany({ where: { walkInCompetitionId: id }, data: { completedAt: null } }),
  },
} as const;

/** Conditional update of a state's row; a missing row counts as OPEN. Returns rows changed. */
async function updateStateRow(scope: JudgingScope, refId: string, stateId: string, from: string[], data: LifecycleData) {
  const { count } = await db.judgingStateStatus.updateMany({ where: { scope, refId, stateId, judgingStatus: { in: from } }, data });
  if (count > 0 || !from.includes("OPEN")) return count;
  const exists = await db.judgingStateStatus.findUnique({ where: { scope_refId_stateId: { scope, refId, stateId } }, select: { id: true } });
  if (exists) return 0;
  try { await db.judgingStateStatus.create({ data: { scope, refId, stateId, ...data } }); return 1; }
  catch { return 0; } // created concurrently — the caller reports the current status
}

async function stateRow(scope: JudgingScope, refId: string, stateId: string) {
  const r = await db.judgingStateStatus.findUnique({
    where: { scope_refId_stateId: { scope, refId, stateId } }, select: LIFECYCLE_SELECT,
  });
  return r ?? { judgingStatus: "OPEN", judgingCompletedAt: null, judgingCompletedBy: null, judgingVerifiedAt: null, judgingVerifiedBy: null };
}

/**
 * Organizer transitions, for the national "Semua" row (no stateId) or one state:
 *   complete  OPEN      → COMPLETED   Super Admin, Admin   (locks judge forms)
 *   verify    COMPLETED → VERIFIED    Super Admin
 *   reopen    COMPLETED / VERIFIED → OPEN   Super Admin  (unlocks; also reopens the judges'
 *             task announcements for that row — national ones, or that state's)
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
  stateId?: string | null,
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
  if (!(await s.find(id, eventId))) return { status: 404, body: { error: "NOT_FOUND" } };

  if (stateId) {
    if (!(await db.state.findUnique({ where: { id: stateId }, select: { id: true } })))
      return { status: 400, body: { error: "INVALID_STATE_ID" } };
    if (await updateStateRow(scope, id, stateId, [...t.from], data) === 0) {
      const cur = await stateRow(scope, id, stateId);
      return { status: 409, body: { error: "INVALID_STATE", message: `Status penghakiman negeri ini ialah ${cur.judgingStatus}. Muat semula halaman.` } };
    }
    if (action === "reopen") {
      const taskIds = (await s.tasks(id)).map(x => x.id);
      await db.judgingTaskStateCompletion.deleteMany({ where: { scope, stateId, taskId: { in: taskIds } } });
      await withdrawGreenLight(scope, id, stateId);
    }
    return { status: 200, body: { judging: await stateRow(scope, id, stateId), stateId } };
  }

  const { count } = await s.update(id, eventId, [...t.from], data);
  if (count === 0) {
    const cur = await s.find(id, eventId);
    return { status: 409, body: { error: "INVALID_STATE", message: `Status penghakiman semasa ialah ${cur?.judgingStatus}. Muat semula halaman.` } };
  }
  if (action === "reopen") { await s.reopenTasks(id); await withdrawGreenLight(scope, id, null); }
  const { eventId: _e, ...judging } = (await s.find(id))!;
  void _e;
  return { status: 200, body: { judging } };
}

/**
 * After a judge announces their task complete — nationally, or for `stateId`.
 * National: when every ACTIVE task is complete nationally, the competition
 * moves OPEN → COMPLETED. State: when every ACTIVE task is complete nationally
 * or for that state, the state's row moves OPEN → COMPLETED. Conditional, so
 * it never overwrites an organizer's own step or a reopen in between.
 * Returns the resulting status of that row.
 */
export async function completeIfAllTasksDone(scope: JudgingScope, id: string, stateId?: string | null): Promise<string> {
  const s = SCOPES[scope];
  const auto = {
    judgingStatus: "COMPLETED", judgingCompletedAt: new Date(), judgingCompletedBy: "Semua hakim (automatik)",
    judgingVerifiedAt: null, judgingVerifiedBy: null,
  };
  const active = (await s.tasks(id)).filter(x => x.status === "ACTIVE");

  if (stateId) {
    const done = new Set((await db.judgingTaskStateCompletion.findMany({
      where: { scope, stateId, taskId: { in: active.map(x => x.id) } }, select: { taskId: true },
    })).map(d => d.taskId));
    if (active.length > 0 && active.every(x => x.completedAt || done.has(x.id)))
      await updateStateRow(scope, id, stateId, ["OPEN"], auto);
    return (await stateRow(scope, id, stateId)).judgingStatus;
  }

  const row = await s.find(id);
  if (row && active.every(x => x.completedAt)) await s.update(id, row.eventId, ["OPEN"], auto);
  return (await s.find(id))?.judgingStatus ?? "OPEN";
}

/**
 * A reopened result is no longer verified: withdraw its green light in the
 * announcement list, so re-verifying needs a fresh go-ahead before the MC reads it.
 */
function withdrawGreenLight(scope: JudgingScope, refId: string, stateId: string | null) {
  return db.announcementEntry.updateMany({
    where: { kind: scope, refId, stateId: stateId ?? "", greenLight: true },
    data:  { greenLight: false, greenLitAt: null, greenLitBy: null },
  });
}

/** Remove per-state judge completions of deleted tasks (polymorphic rows have no FK cascade). */
export function cleanupTaskStateCompletions(scope: JudgingScope, taskId: string) {
  return db.judgingTaskStateCompletion.deleteMany({ where: { scope, taskId } });
}

// ── Progress (organizer judging pages) ────────────────────────────────────────

/** One row of the organizer's judging table — "Semua" (stateId null) or a state. */
export type JudgingRow = {
  stateId: string | null;
  stateName: string;
  judgingStatus: string;
  judgingCompletedAt: string | null; judgingCompletedBy: string | null;
  judgingVerifiedAt: string | null;  judgingVerifiedBy: string | null;
  /** Teams / participants to judge in this row. */
  total: number;
  /** Of those, scored in every ACTIVE task. */
  judgedAll: number;
  tasks: { id: string; judged: number; completedAt: string | null }[];
};

const isoOrNull = (d: Date | null | undefined) => d?.toISOString() ?? null;

type ProgressInput = {
  id: string;
  lifecycle: { judgingStatus: string; judgingCompletedAt: Date | null; judgingCompletedBy: string | null; judgingVerifiedAt: Date | null; judgingVerifiedBy: string | null };
  tasks: { id: string; status: string; completedAt: Date | null }[];
  /** (unit id, state id) of every team / participant to judge. */
  units: { unitId: string; stateId: string | null }[];
  /** (task id, unit id) pairs with at least one score. */
  scored: { taskId: string; unitId: string }[];
};

async function buildProgress(scope: JudgingScope, inputs: ProgressInput[]) {
  const refIds  = inputs.map(i => i.id);
  const taskIds = inputs.flatMap(i => i.tasks.map(t => t.id));
  const [stateRows, taskDone] = await Promise.all([
    refIds.length ? db.judgingStateStatus.findMany({ where: { scope, refId: { in: refIds } } }) : Promise.resolve([]),
    taskIds.length ? db.judgingTaskStateCompletion.findMany({ where: { scope, taskId: { in: taskIds } } }) : Promise.resolve([]),
  ]);
  const stateIds = [...new Set(inputs.flatMap(i => i.units.map(u => u.stateId).filter((x): x is string => !!x)))];
  const names = new Map((stateIds.length ? await db.state.findMany({ where: { id: { in: stateIds } }, select: { id: true, name: true } }) : [])
    .map(s => [s.id, s.name]));
  const rowBy  = new Map(stateRows.map(r => [`${r.refId}:${r.stateId}`, r]));
  const doneBy = new Map(taskDone.map(d => [`${d.taskId}:${d.stateId}`, d.completedAt]));

  return inputs.map((inp) => {
    const active = inp.tasks.filter(t => t.status === "ACTIVE");
    const scoredSet = new Set(inp.scored.map(x => `${x.taskId}:${x.unitId}`));
    const rowFor = (stateId: string | null): JudgingRow => {
      const units = stateId === null ? inp.units : inp.units.filter(u => u.stateId === stateId);
      const unitIds = new Set(units.map(u => u.unitId));
      const lc = stateId === null ? inp.lifecycle : rowBy.get(`${inp.id}:${stateId}`);
      return {
        stateId,
        stateName: stateId === null ? "Semua" : (names.get(stateId) ?? "—"),
        judgingStatus:      lc?.judgingStatus ?? "OPEN",
        judgingCompletedAt: isoOrNull(lc?.judgingCompletedAt), judgingCompletedBy: lc?.judgingCompletedBy ?? null,
        judgingVerifiedAt:  isoOrNull(lc?.judgingVerifiedAt),  judgingVerifiedBy:  lc?.judgingVerifiedBy ?? null,
        total: units.length,
        judgedAll: active.length === 0 ? 0 : units.filter(u => active.every(t => scoredSet.has(`${t.id}:${u.unitId}`))).length,
        tasks: inp.tasks.map(t => ({
          id: t.id,
          judged: inp.scored.filter(x => x.taskId === t.id && unitIds.has(x.unitId)).length,
          completedAt: stateId === null ? isoOrNull(t.completedAt) : isoOrNull(doneBy.get(`${t.id}:${stateId}`)),
        })),
      };
    };
    const states = [...new Set(inp.units.map(u => u.stateId).filter((x): x is string => !!x))]
      .sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? ""));
    const national = rowFor(null);
    return {
      id: inp.id,
      // national fields kept flat for existing callers
      judgingStatus: national.judgingStatus,
      judgingCompletedAt: national.judgingCompletedAt, judgingCompletedBy: national.judgingCompletedBy,
      judgingVerifiedAt: national.judgingVerifiedAt,   judgingVerifiedBy: national.judgingVerifiedBy,
      teamCount: national.total,
      tasks: inp.tasks.map(t => ({
        id: t.id, status: t.status, completedAt: isoOrNull(t.completedAt),
        judgedTeams: national.tasks.find(x => x.id === t.id)?.judged ?? 0,
      })),
      rows: [national, ...states.map(rowFor)],
    };
  });
}

/**
 * Judging progress of an event, per event-competition, with a "Semua" row and
 * one row per state that has teams. Teams = ACTIVE teams entered in the event
 * (the set the judging form lists); judged = teams with a score in the task.
 */
export async function eventJudgingProgress(eventId: string) {
  const ecs = await db.eventCompetition.findMany({
    where:  { eventId },
    select: {
      id: true, competitionId: true, ...LIFECYCLE_SELECT,
      judgingTasks: { select: { id: true, status: true, completedAt: true } },
    },
  });
  const taskIds = ecs.flatMap((ec) => ec.judgingTasks.map((t) => t.id));
  const [teams, scored] = await Promise.all([
    db.$queryRaw<{ competitionId: string; teamId: string; stateId: string | null }[]>`
      SELECT t."competitionId", t.id AS "teamId", COALESCE(c."stateId", s."stateId", h."stateId") AS "stateId"
      FROM team_events te
      JOIN teams t ON t.id = te."teamId"
      JOIN contingents c ON c.id = t."contingentId"
      LEFT JOIN schools s ON s.id = c."schoolId"
      LEFT JOIN higher_institutions h ON h.id = c."higherInstitutionId"
      WHERE te."eventId" = ${eventId} AND t.status = 'ACTIVE'`,
    taskIds.length === 0 ? Promise.resolve([] as { taskId: string; unitId: string }[]) : db.$queryRaw<{ taskId: string; unitId: string }[]>`
      SELECT DISTINCT "judgingTaskId" AS "taskId", "teamId" AS "unitId"
      FROM judging_scores WHERE "judgingTaskId" IN (${Prisma.join(taskIds)})`,
  ]);
  return buildProgress("event", ecs.map((ec) => {
    const ids = new Set(ec.judgingTasks.map(t => t.id));
    return {
      id: ec.id,
      lifecycle: ec,
      tasks: ec.judgingTasks,
      units: teams.filter(t => t.competitionId === ec.competitionId).map(t => ({ unitId: t.teamId, stateId: t.stateId })),
      scored: scored.filter(x => ids.has(x.taskId)),
    };
  }));
}
export type EventJudgingProgress = Awaited<ReturnType<typeof eventJudgingProgress>>;

/** The same for walk-in judging: units are CONFIRMED walk-in registrations. */
export async function walkInJudgingProgress(eventId: string) {
  const wics = await db.eventWalkInCompetition.findMany({
    where:  { eventId },
    select: {
      id: true, ...LIFECYCLE_SELECT,
      judgingEndpoints: { select: { id: true, status: true, completedAt: true } },
    },
  });
  const endpointIds = wics.flatMap((w) => w.judgingEndpoints.map((e) => e.id));
  const [regs, scored] = await Promise.all([
    wics.length === 0 ? Promise.resolve([] as { wicId: string; regId: string; stateId: string | null }[]) : db.$queryRaw<{ wicId: string; regId: string; stateId: string | null }[]>`
      SELECT r."walkInCompetitionId" AS "wicId", r.id AS "regId", COALESCE(c."stateId", s."stateId", h."stateId") AS "stateId"
      FROM walkin_registrations r
      JOIN contingents c ON c.id = r."contingentId"
      LEFT JOIN schools s ON s.id = c."schoolId"
      LEFT JOIN higher_institutions h ON h.id = c."higherInstitutionId"
      WHERE r."walkInCompetitionId" IN (${Prisma.join(wics.map(w => w.id))}) AND r.status = 'CONFIRMED'`,
    endpointIds.length === 0 ? Promise.resolve([] as { taskId: string; unitId: string }[]) : db.$queryRaw<{ taskId: string; unitId: string }[]>`
      SELECT DISTINCT "walkInJudgingEndpointId" AS "taskId", "walkInRegistrationId" AS "unitId"
      FROM walkin_judging_scores WHERE "walkInJudgingEndpointId" IN (${Prisma.join(endpointIds)})`,
  ]);
  return buildProgress("walkin", wics.map((w) => {
    const ids = new Set(w.judgingEndpoints.map(e => e.id));
    return {
      id: w.id,
      lifecycle: w,
      tasks: w.judgingEndpoints,
      units: regs.filter(r => r.wicId === w.id).map(r => ({ unitId: r.regId, stateId: r.stateId })),
      scored: scored.filter(x => ids.has(x.taskId)),
    };
  }));
}

/** Verified state ids per competition (for releasing per-state results). */
export async function verifiedStatesBy(scope: JudgingScope, refIds: string[]): Promise<Map<string, string[]>> {
  if (refIds.length === 0) return new Map();
  const rows = await db.judgingStateStatus.findMany({
    where: { scope, refId: { in: refIds }, judgingStatus: "VERIFIED" }, select: { refId: true, stateId: true },
  });
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.refId, [...(by.get(r.refId) ?? []), r.stateId]);
  return by;
}
