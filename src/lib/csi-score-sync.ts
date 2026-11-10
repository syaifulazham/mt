import { randomBytes, randomInt } from "crypto";
import { db } from "@/lib/db";
import {
  csiListCaseResults, csiListCompetitionCases, csiListCompetitionRegistrations, toCsiUserId, type CsiResult,
} from "@/lib/eptim-csi";
import { contingentStateId, judgingLocked, taskLockMap, teamLocked } from "@/lib/judgingStatus";
import { csiTemplateMapping, type CsiCaseInfo, type CsiTemplateCriterion } from "@/lib/csi-score-template";

/**
 * Copying an event-competition's Eptim CSI results into judging scores, so they
 * appear in Penghakiman, the Scoreboard and the public results board like a
 * judge's.
 *
 * Scores are written through the competition's own judging task labelled
 * SYNC_LABEL, on the template the organizer chose (created on first use). Each
 * run rewrites that task's scores from CSI — upserted on (task, team,
 * criterion), so re-running never duplicates — and clears a team's score once
 * CSI no longer has a finished run for it (e.g. after "Set semula").
 *
 * A team's score on a case is its official (ranked) run when that run is
 * completed, else its latest completed run; only cases the team registered on
 * through the CSI competition count.
 */

export const SYNC_LABEL = "Selaraskan Eptim CSI";
export const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const CRITERIA_SELECT = {
  id: true, name: true, type: true, order: true, minScore: true, maxScore: true, maxTime: true,
} as const;

/** The event-competition and its configured cases, with max scores from CSI where it answers. */
export async function loadCsiCompetition(eventId: string, ecId: string) {
  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, eventId },
    select: {
      id: true, eventId: true, competitionId: true, judgingStatus: true, judgingMethod: true, configLockedAt: true,
      eptimCsiCompetitionId: true, eptimCsiCompetitionName: true, eptimCsiCases: true,
      competition: { select: { code: true, name: true } },
      judgingTemplates: { select: { judgingTemplateId: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ec) return null;
  const picked = (ec.eptimCsiCases as { id: string; slug: string; title: string }[] | null) ?? [];
  let timeLimitMinutes: number | null = null;
  const details = new Map<string, { maxScore: number | null; summary: string | null; difficulty: number | null }>();
  if (ec.eptimCsiCompetitionId && picked.length) {
    try {
      const r = await csiListCompetitionCases(ec.eptimCsiCompetitionId);
      timeLimitMinutes = r.competition.time_limit_minutes;
      for (const c of r.cases) details.set(c.id, { maxScore: c.max_score, summary: c.summary, difficulty: c.difficulty });
    } catch (e) {
      console.error("[eptim-csi] competition cases lookup failed:", e);
    }
  }
  const cases = picked.map(c => ({
    id: c.id, slug: c.slug, title: c.title,
    maxScore: details.get(c.id)?.maxScore ?? null,
    summary: details.get(c.id)?.summary ?? null,
    difficulty: details.get(c.id)?.difficulty ?? null,
    inCompetition: details.size === 0 || details.has(c.id),
  }));
  return { ec, cases, timeLimitMinutes };
}

export type CsiCompetitionCtx = NonNullable<Awaited<ReturnType<typeof loadCsiCompetition>>>;

/** Every template with why it can't hold the CSI results (null = it can). */
export async function templatesWithFit(cases: CsiCaseInfo[]) {
  const templates = await db.judgingTemplate.findMany({
    select: { id: true, name: true, code: true, description: true, criterions: { select: CRITERIA_SELECT } },
    orderBy: { name: "asc" },
  });
  return templates.map(t => {
    const m = csiTemplateMapping(t.criterions, cases);
    return { ...t, fit: m.ok ? null : m.reason, mapping: m };
  });
}

/** The competition's sync task, if any. */
export function findSyncTask(ecId: string) {
  return db.judgingTask.findFirst({
    where: { eventCompetitionId: ecId, label: SYNC_LABEL },
    select: {
      id: true, label: true, status: true, completedAt: true, updatedAt: true, judgingTemplateId: true,
      judgingTemplate: { select: { id: true, name: true, code: true } },
      _count: { select: { scores: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The template the sync writes with: the sync task's, while it is still
 * assigned and fits; else the first assigned template that fits.
 */
export function effectiveTemplateId(
  ctx: CsiCompetitionCtx, fits: { id: string; fit: string | null }[], syncTemplateId: string | null,
): string | null {
  const assigned = ctx.ec.judgingTemplates.map(t => t.judgingTemplateId);
  const ok = new Set(fits.filter(t => !t.fit).map(t => t.id));
  if (syncTemplateId && assigned.includes(syncTemplateId) && ok.has(syncTemplateId)) return syncTemplateId;
  return assigned.find(id => ok.has(id)) ?? null;
}

const PASSCODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Make the sync task use `templateId` (assigned to the competition and fitting):
 * created on first use; switching template drops the old template's synced
 * scores, which the next sync writes again on the new one.
 */
export async function prepareSyncTask(ctx: CsiCompetitionCtx, templateId: string) {
  const existing = await findSyncTask(ctx.ec.id);
  if (existing?.judgingTemplateId === templateId) return { task: existing, created: false, cleared: 0 };
  if (existing) {
    const [del] = await db.$transaction([
      db.judgingScore.deleteMany({ where: { judgingTaskId: existing.id } }),
      db.judgingTask.update({ where: { id: existing.id }, data: { judgingTemplateId: templateId } }),
    ]);
    return { task: await findSyncTask(ctx.ec.id), created: false, cleared: del.count };
  }
  let routeSlug = randomBytes(10).toString("hex");
  while (await db.judgingTask.findUnique({ where: { routeSlug } })) routeSlug = randomBytes(10).toString("hex");
  await db.judgingTask.create({
    data: {
      eventCompetitionId: ctx.ec.id, judgingTemplateId: templateId, routeSlug, label: SYNC_LABEL,
      passcode: Array.from({ length: 6 }, () => PASSCODE_CHARS[randomInt(PASSCODE_CHARS.length)]).join(""),
    },
  });
  return { task: await findSyncTask(ctx.ec.id), created: true, cleared: 0 };
}

type Pick_ = { score: number; seconds: number | null };

/** The run whose score counts: the ranked run when completed, else the latest completed. */
function countedRun(runs: CsiResult[]): Pick_ | null {
  const done = runs.filter(r => r.status === "completed" && r.score != null);
  const run = done.find(r => r.ranked) ?? done[0]; // runs come newest first
  if (!run) return null;
  const seconds = run.duration_seconds
    ?? (run.completed_at ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000) : null);
  return { score: run.score!, seconds };
}

export type CsiSyncSummary = {
  template: { id: string; name: string; code: string };
  taskId: string;
  cases: { id: string; title: string; registered: number; scored: number }[];
  teamsInCompetition: number;
  teamsRegistered: number;
  teamsScored: number;
  created: number; updated: number; unchanged: number; cleared: number;
  /** Registered teams with no completed run yet. */
  noResult: { teamId: string; teamName: string; contingentName: string }[];
  /** Teams whose state (or the task, for their state) is locked — left as they were. */
  locked: { teamId: string; teamName: string; contingentName: string; message: string | null }[];
  /** CSI players on this competition's cases that are not a team of this event-competition. */
  unmatched: { userId: string; alias: string | null; cases: string[]; reason: "other" | "unknown" }[];
  syncedAt: string;
};

/** Sync every result of the competition's configured cases into the sync task. */
export async function syncCsiResults(ctx: CsiCompetitionCtx, taskId: string): Promise<CsiSyncSummary> {
  const { ec, cases } = ctx;
  const task = await db.judgingTask.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, completedAt: true, judgingTemplate: { select: { id: true, name: true, code: true, criterions: { select: CRITERIA_SELECT } } } },
  });
  const mapping = csiTemplateMapping(task.judgingTemplate.criterions as CsiTemplateCriterion[], cases);
  if (!mapping.ok) throw Object.assign(new Error(`Templat tidak sesuai: ${mapping.reason}`), { status: 409 });

  const teams = await db.team.findMany({
    where: { competitionId: ec.competitionId, teamEvents: { some: { eventId: ec.eventId } } },
    select: {
      id: true, name: true, csiAccess: { select: { csiUserId: true } },
      contingent: {
        select: {
          name: true, stateId: true,
          school: { select: { stateId: true } }, higherInstitution: { select: { stateId: true } },
          country: { select: { codeIso2: true } },
        },
      },
    },
  });
  // A team's CSI player is its stored account, else the id registration derives.
  const byUser = new Map(teams.map(t => [t.csiAccess?.csiUserId ?? toCsiUserId(t.id), t]));

  // Fail the whole sync on any CSI error, so a missing page never clears scores.
  const [regs, ...resultsByCase] = await Promise.all([
    csiListCompetitionRegistrations(ec.eptimCsiCompetitionId!),
    ...cases.map(c => csiListCaseResults(c.slug)),
  ]);
  const caseIds = new Set(cases.map(c => c.id));
  const registered = new Map<string, Set<string>>(); // userId → caseIds
  const strangers = new Map<string, { alias: string | null; cases: Set<string> }>();
  for (const r of regs) {
    if (!caseIds.has(r.case.id)) continue;
    if (byUser.has(r.user_id)) {
      registered.set(r.user_id, (registered.get(r.user_id) ?? new Set()).add(r.case.id));
    } else {
      const s = strangers.get(r.user_id) ?? { alias: r.alias, cases: new Set<string>() };
      s.cases.add(r.case.title);
      strangers.set(r.user_id, s);
    }
  }

  // userId → caseId → counted run
  const counted = new Map<string, Map<string, Pick_>>();
  cases.forEach((c, i) => {
    const runsBy = new Map<string, CsiResult[]>();
    for (const run of resultsByCase[i]) runsBy.set(run.user_id, [...(runsBy.get(run.user_id) ?? []), run]);
    for (const [userId, runs] of runsBy) {
      if (!registered.get(userId)?.has(c.id)) continue;
      const p = countedRun(runs);
      if (p) counted.set(userId, (counted.get(userId) ?? new Map()).set(c.id, p));
    }
  });

  // Desired score per (team, criterion); null = clear.
  type Val = { score: number | null; timeSeconds: number | null };
  const desired = new Map<string, Map<string, Val>>(); // teamId → criterionId → value
  for (const [userId, perCase] of counted) {
    const team = byUser.get(userId)!;
    const vals = new Map<string, Val>();
    const runs = [...perCase.values()];
    for (const c of mapping.criteria) {
      if (!c.id) continue;
      if (c.source.kind === "case") {
        const p = perCase.get(c.source.caseId);
        if (p) vals.set(c.id, { score: p.score, timeSeconds: null });
      } else if (c.source.kind === "total") {
        vals.set(c.id, { score: runs.reduce((s, p) => s + p.score, 0), timeSeconds: null });
      } else if (runs.every(p => p.seconds != null)) {
        vals.set(c.id, { score: null, timeSeconds: runs.reduce((s, p) => s + p.seconds!, 0) });
      }
    }
    desired.set(team.id, vals);
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
  const criterionIds = new Set(mapping.criteria.map(c => c.id));
  const creates: { judgingTaskId: string; teamId: string; criterionId: string; score: number | null; timeSeconds: number | null }[] = [];
  const updates: { id: string; v: Val }[] = [];
  const deletes: string[] = [];
  let unchanged = 0;
  const seen = new Set<string>();
  for (const s of existing) {
    if (lockedTeams.has(s.teamId)) continue;
    seen.add(`${s.teamId}|${s.criterionId}`);
    const want = criterionIds.has(s.criterionId) ? desired.get(s.teamId)?.get(s.criterionId) : undefined;
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

  // Players that are another event/competition's team vs unknown to MT.
  const strangerIds = [...strangers.keys()];
  const known = new Set<string>();
  if (strangerIds.length) {
    const [byAccess, byId] = await Promise.all([
      db.teamCsiAccess.findMany({ where: { csiUserId: { in: strangerIds } }, select: { csiUserId: true } }),
      db.team.findMany({ where: { id: { in: strangerIds } }, select: { id: true } }),
    ]);
    byAccess.forEach(a => known.add(a.csiUserId));
    byId.forEach(t => known.add(toCsiUserId(t.id)));
  }

  const regTeams = [...registered.keys()].map(u => byUser.get(u)!);
  const lite = (t: (typeof teams)[number]) => ({ teamId: t.id, teamName: t.name, contingentName: t.contingent.name });
  return {
    template: { id: task.judgingTemplate.id, name: task.judgingTemplate.name, code: task.judgingTemplate.code },
    taskId: task.id,
    cases: cases.map(c => ({
      id: c.id, title: c.title,
      registered: [...registered.values()].filter(s => s.has(c.id)).length,
      scored: [...counted.values()].filter(m => m.has(c.id)).length,
    })),
    teamsInCompetition: teams.length,
    teamsRegistered: regTeams.length,
    teamsScored: [...desired.keys()].filter(id => !lockedTeams.has(id)).length,
    created: creates.length, updated: updates.length, unchanged, cleared: deletes.length,
    noResult: regTeams.filter(t => !desired.has(t.id)).map(lite).sort((a, b) => a.teamName.localeCompare(b.teamName)),
    locked: teams.filter(t => lockedTeams.has(t.id) && (desired.has(t.id) || existing.some(s => s.teamId === t.id)))
      .map(t => ({ ...lite(t), message: lockedTeams.get(t.id) ?? null })),
    unmatched: strangerIds
      .map(u => ({ userId: u, alias: strangers.get(u)!.alias, cases: [...strangers.get(u)!.cases], reason: known.has(u) ? "other" as const : "unknown" as const }))
      .sort((a, b) => a.reason.localeCompare(b.reason) || (a.alias ?? a.userId).localeCompare(b.alias ?? b.userId)),
    syncedAt: new Date().toISOString(),
  };
}

/** Why the competition can't sync now, or null. */
export function syncBlocked(ctx: CsiCompetitionCtx): { error: string; message: string; status: number } | null {
  if (!ctx.ec.eptimCsiCompetitionId) return { error: "NOT_CSI", message: "Pertandingan ini tidak dipautkan ke Eptim CSI.", status: 400 };
  if (ctx.cases.length === 0) return { error: "NO_CASES", message: "Tiada kes CSI dipilih untuk pertandingan ini.", status: 409 };
  if (ctx.ec.judgingMethod !== "SCORE") return { error: "NOT_SCORE_METHOD", message: "Kaedah penghakiman pertandingan ini bukan Skor (templat).", status: 409 };
  if (judgingLocked(ctx.ec.judgingStatus)) return { error: "JUDGING_LOCKED", message: "Penghakiman telah diumumkan selesai dan dikunci; buka semula untuk menyelaraskan.", status: 423 };
  return null;
}
