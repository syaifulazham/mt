import { randomBytes, randomInt } from "crypto";
import { db } from "@/lib/db";
import { quizzlyConfigured, type QuizzlyQuizAssignment } from "@/lib/asiaspark-quizzly";
import { quizzlyMonitorQuiz } from "@/lib/quizzlyMonitor";
import { contingentStateId, judgingLocked, taskLockMap, teamLocked } from "@/lib/judgingStatus";
import { quizCriterionValue, quizTemplateMapping, type QuizTemplateCriterion } from "@/lib/quiz-score-template";

/**
 * "Sync ke penghakiman MT" on Asia Spark Quizzes: copies an event-competition's
 * Asia Spark Quizzly results into judging scores, so they appear in
 * Penghakiman, the Scoreboard, results, certificates and the Medal Tally like
 * a judge's.
 *
 * Modelled on the Eptim CSI sync (src/lib/csi-score-sync.ts): scores are
 * written through the competition's own judging task labelled SYNC_LABEL, on
 * the template the organizer chose. Each run rewrites that task's scores from
 * Quizzly — diffed on (task, team, criterion), so re-running updates and never
 * duplicates — and clears a team's score once Quizzly no longer has a
 * submitted attempt for it (e.g. a voided attempt).
 *
 * Quizzly integrations read only the registration anchor (parentId null), as
 * AGENTS.md requires; competitions are individual, so a team is normally one
 * participant. A team with several members takes their average.
 */

export const SYNC_LABEL = "Selaraskan Asia Spark Quizzes";
export const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const CRITERIA_SELECT = {
  id: true, name: true, type: true, order: true, minScore: true, maxScore: true, maxTime: true, timePrecision: true,
} as const;

export async function loadQuizCompetition(eventId: string, ecId: string) {
  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, eventId, parentId: null, quizzlySessionId: { not: null } },
    select: {
      id: true, eventId: true, competitionId: true, judgingStatus: true, judgingMethod: true, configLockedAt: true,
      quizzlySessionId: true, quizzlySessionTitle: true, quizzlyQuizMap: true,
      competition: { select: { code: true, name: true } },
      judgingTemplates: { select: { judgingTemplateId: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ec) return null;
  const quizzes = new Map<string, { id: string; title: string; label: string }>();
  for (const m of (ec.quizzlyQuizMap as QuizzlyQuizAssignment[] | null) ?? []) {
    const q = quizzes.get(m.quizId) ?? { id: m.quizId, title: m.quizTitle, label: "" };
    const tag = m.grade ?? m.targetGroupName;
    q.label = q.label ? `${q.label}, ${tag}` : tag;
    quizzes.set(m.quizId, q);
  }
  return { ec, quizzes: [...quizzes.values()] };
}

export type QuizCompetitionCtx = NonNullable<Awaited<ReturnType<typeof loadQuizCompetition>>>;

/** Every template with why it can't hold quiz results (null = it can). */
export async function templatesWithFit() {
  const templates = await db.judgingTemplate.findMany({
    select: { id: true, name: true, code: true, criterions: { select: CRITERIA_SELECT } },
    orderBy: { name: "asc" },
  });
  return templates.map(t => {
    const m = quizTemplateMapping(t.criterions);
    return { ...t, fit: m.ok ? null : m.reason };
  });
}

export function findSyncTask(ecId: string) {
  return db.judgingTask.findFirst({
    where: { eventCompetitionId: ecId, label: SYNC_LABEL },
    select: {
      id: true, status: true, completedAt: true, updatedAt: true, judgingTemplateId: true,
      judgingTemplate: { select: { id: true, name: true, code: true } },
      _count: { select: { scores: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** The sync task's template while it is still assigned and fits; else the first assigned that fits. */
export function effectiveTemplateId(
  ctx: QuizCompetitionCtx, fits: { id: string; fit: string | null }[], syncTemplateId: string | null,
): string | null {
  const assigned = ctx.ec.judgingTemplates.map(t => t.judgingTemplateId);
  const ok = new Set(fits.filter(t => !t.fit).map(t => t.id));
  if (syncTemplateId && assigned.includes(syncTemplateId) && ok.has(syncTemplateId)) return syncTemplateId;
  return assigned.find(id => ok.has(id)) ?? null;
}

const PASSCODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Make the sync task use `templateId`: created on first use; switching
 * template drops the old template's synced scores, which the next sync writes
 * again on the new one.
 */
export async function prepareSyncTask(ecId: string, templateId: string) {
  const existing = await findSyncTask(ecId);
  if (existing?.judgingTemplateId === templateId) return { task: existing, created: false, cleared: 0 };
  if (existing) {
    const [del] = await db.$transaction([
      db.judgingScore.deleteMany({ where: { judgingTaskId: existing.id } }),
      db.judgingTask.update({ where: { id: existing.id }, data: { judgingTemplateId: templateId } }),
    ]);
    return { task: await findSyncTask(ecId), created: false, cleared: del.count };
  }
  let routeSlug = randomBytes(10).toString("hex");
  while (await db.judgingTask.findUnique({ where: { routeSlug } })) routeSlug = randomBytes(10).toString("hex");
  await db.judgingTask.create({
    data: {
      eventCompetitionId: ecId, judgingTemplateId: templateId, routeSlug, label: SYNC_LABEL,
      passcode: Array.from({ length: 6 }, () => PASSCODE_CHARS[randomInt(PASSCODE_CHARS.length)]).join(""),
    },
  });
  return { task: await findSyncTask(ecId), created: true, cleared: 0 };
}

type TeamLite = { teamId: string; teamName: string; contingentName: string };

export type QuizSyncSummary = {
  template: { id: string; name: string; code: string };
  taskId: string;
  quizzes: { id: string; title: string; registered: number; submitted: number }[];
  teamsInCompetition: number;
  teamsScored: number;
  /** Score rows written. */
  created: number; updated: number; unchanged: number; cleared: number;
  /** Teams left without a score: no submitted attempt yet, or locked. */
  skipped: number;
  noResult: TeamLite[];
  locked: (TeamLite & { message: string | null })[];
  /** Teams with several members, scored on their average. */
  averaged: number;
  syncedAt: string;
};

type Result = { percentage: number; correct: number; questions: number; seconds: number | null };

/** Sync every submitted attempt of the competition's quizzes into the sync task. */
export async function syncQuizResults(ctx: QuizCompetitionCtx, taskId: string): Promise<QuizSyncSummary> {
  const { ec, quizzes } = ctx;
  const task = await db.judgingTask.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, completedAt: true, judgingTemplate: { select: { id: true, name: true, code: true, criterions: { select: CRITERIA_SELECT } } } },
  });
  const mapping = quizTemplateMapping(task.judgingTemplate.criterions as QuizTemplateCriterion[]);
  if (!mapping.ok) throw Object.assign(new Error(`Templat tidak sesuai: ${mapping.reason}`), { status: 409 });

  // Fail the whole sync on any Quizzly error, so a missing page never clears scores.
  const rowsByQuiz = await Promise.all(quizzes.map(q => quizzlyMonitorQuiz(ec.eventId, ec.id, q.id)));
  const results = new Map<string, Result>(); // participantId → result
  rowsByQuiz.forEach(rows => {
    for (const r of rows ?? []) {
      if (r.status !== "submitted" || !r.score) continue;
      results.set(r.participantId, {
        percentage: r.score.percentage, correct: r.score.correct, questions: r.score.questions,
        seconds: r.durationMs != null ? r.durationMs / 1000 : null,
      });
    }
  });

  const teams = await db.team.findMany({
    where: { competitionId: ec.competitionId, teamEvents: { some: { eventId: ec.eventId } } },
    select: {
      id: true, name: true, members: { select: { participantId: true } },
      contingent: {
        select: {
          name: true, stateId: true,
          school: { select: { stateId: true } }, higherInstitution: { select: { stateId: true } },
          country: { select: { codeIso2: true } },
        },
      },
    },
  });

  type Val = { score: number | null; timeSeconds: number | null };
  const desired = new Map<string, Map<string, Val>>(); // teamId → criterionId → value
  let averaged = 0;
  for (const t of teams) {
    const rs = t.members.map(m => results.get(m.participantId)).filter((r): r is Result => !!r);
    if (!rs.length) continue;
    if (rs.length > 1) averaged++;
    const avg = (f: (r: Result) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    const r: Result = {
      percentage: avg(x => x.percentage), correct: avg(x => x.correct), questions: avg(x => x.questions),
      seconds: rs.every(x => x.seconds != null) ? avg(x => x.seconds!) : null,
    };
    const vals = new Map<string, Val>();
    for (const c of mapping.criteria) {
      const v = quizCriterionValue(c.source, r, c.timePrecision ?? 0);
      if (c.id && v) vals.set(c.id, v);
    }
    desired.set(t.id, vals);
  }

  const locks = await taskLockMap("event", task, ec.id, ec.judgingStatus);
  const lockedTeams = new Map<string, string | null>();
  for (const t of teams) {
    const l = teamLocked(locks, contingentStateId(t.contingent));
    if (l.locked) lockedTeams.set(t.id, l.message);
  }

  const existing = await db.judgingScore.findMany({
    where: { judgingTaskId: task.id },
    select: { id: true, teamId: true, criterionId: true, score: true, timeSeconds: true },
  });
  const creates: { judgingTaskId: string; teamId: string; criterionId: string; score: number | null; timeSeconds: number | null }[] = [];
  const updates: { id: string; v: Val }[] = [];
  const deletes: string[] = [];
  let unchanged = 0;
  const seen = new Set<string>();
  for (const s of existing) {
    if (lockedTeams.has(s.teamId)) continue;
    seen.add(`${s.teamId}|${s.criterionId}`);
    const want = desired.get(s.teamId)?.get(s.criterionId);
    if (!want) deletes.push(s.id);
    else if (want.score === s.score && want.timeSeconds === s.timeSeconds) unchanged++;
    else updates.push({ id: s.id, v: want });
  }
  for (const [teamId, vals] of desired) {
    if (lockedTeams.has(teamId)) continue;
    for (const [criterionId, v] of vals)
      if (!seen.has(`${teamId}|${criterionId}`)) creates.push({ judgingTaskId: task.id, teamId, criterionId, ...v });
  }

  const ops = [
    ...(deletes.length ? [db.judgingScore.deleteMany({ where: { id: { in: deletes } } })] : []),
    ...(creates.length ? [db.judgingScore.createMany({ data: creates, skipDuplicates: true })] : []),
    ...updates.map(u => db.judgingScore.update({ where: { id: u.id }, data: u.v })),
  ];
  for (let i = 0; i < ops.length; i += 500) await db.$transaction(ops.slice(i, i + 500));
  // Mark the task touched, so "last synced" shows even when nothing changed.
  await db.judgingTask.update({ where: { id: task.id }, data: { updatedAt: new Date() } });

  const lite = (t: (typeof teams)[number]): TeamLite => ({ teamId: t.id, teamName: t.name, contingentName: t.contingent.name });
  const noResult = teams.filter(t => !desired.has(t.id) && !lockedTeams.has(t.id)).map(lite)
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
  const locked = teams.filter(t => lockedTeams.has(t.id)).map(t => ({ ...lite(t), message: lockedTeams.get(t.id) ?? null }));
  return {
    template: { id: task.judgingTemplate.id, name: task.judgingTemplate.name, code: task.judgingTemplate.code },
    taskId: task.id,
    quizzes: quizzes.map((q, i) => ({
      id: q.id, title: q.title,
      registered: rowsByQuiz[i]?.length ?? 0,
      submitted: (rowsByQuiz[i] ?? []).filter(r => r.status === "submitted" && r.score).length,
    })),
    teamsInCompetition: teams.length,
    teamsScored: [...desired.keys()].filter(id => !lockedTeams.has(id)).length,
    created: creates.length, updated: updates.length, unchanged, cleared: deletes.length,
    skipped: noResult.length + locked.length,
    noResult, locked, averaged,
    syncedAt: new Date().toISOString(),
  };
}

/** Why the competition can't sync now, or null. */
export function syncBlocked(ctx: QuizCompetitionCtx): { error: string; message: string; status: number } | null {
  if (!quizzlyConfigured()) return { error: "NOT_CONFIGURED", message: "Asia Spark Quizzly belum dikonfigurasi.", status: 503 };
  if (ctx.quizzes.length === 0) return { error: "NO_QUIZZES", message: "Tiada kuiz dikonfigurasi untuk pertandingan ini.", status: 409 };
  if (ctx.ec.judgingMethod !== "SCORE") return { error: "NOT_SCORE_METHOD", message: "Kaedah penghakiman pertandingan ini bukan Skor (templat).", status: 409 };
  if (judgingLocked(ctx.ec.judgingStatus)) return { error: "JUDGING_LOCKED", message: "Penghakiman telah diumumkan selesai dan dikunci; buka semula untuk menyelaraskan.", status: 423 };
  return null;
}
