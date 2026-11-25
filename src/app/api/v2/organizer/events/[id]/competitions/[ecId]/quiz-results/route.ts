import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  SYNC_LABEL, WRITE_ROLES, effectiveTemplateId, findSyncTask, loadQuizCompetition, prepareSyncTask,
  syncBlocked, syncQuizResults, templatesWithFit,
} from "@/lib/quiz-score-sync";
import { judgingLocked } from "@/lib/judgingStatus";

// Asia Spark Quizzly results → judging scores of one event-competition (src/lib/quiz-score-sync.ts).
// GET                                    — quizzes, which templates fit, the template in use, the sync task.
// POST { action: "prepare", templateId } — make the sync task use this (assigned, fitting) template.
// POST { action: "sync" }                — copy every submitted attempt into the sync task's scores.

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Params = { params: Promise<{ id: string; ecId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, ecId } = await params;
  const ctx = await loadQuizCompetition(id, ecId);
  if (!ctx) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const [fits, task] = await Promise.all([templatesWithFit(), findSyncTask(ecId)]);
  const assigned = ctx.ec.judgingTemplates.map(t => t.judgingTemplateId);
  const teamsScored = task
    ? (await db.judgingScore.groupBy({ by: ["teamId"], where: { judgingTaskId: task.id } })).length
    : 0;

  return NextResponse.json({
    competition: { code: ctx.ec.competition.code, name: ctx.ec.competition.name },
    quizzes: ctx.quizzes,
    templates: fits.map(t => ({ id: t.id, name: t.name, code: t.code, criteria: t.criterions.length, fit: t.fit, assigned: assigned.includes(t.id) })),
    assigned,
    templateId: effectiveTemplateId(ctx, fits, task?.judgingTemplateId ?? null),
    syncLabel: SYNC_LABEL,
    task: task && {
      id: task.id, templateId: task.judgingTemplateId, template: task.judgingTemplate,
      scores: task._count.scores, teamsScored, updatedAt: task.updatedAt, completedAt: task.completedAt,
    },
    configLocked: !!ctx.ec.configLockedAt,
    judgingStatus: ctx.ec.judgingStatus,
    blocked: syncBlocked(ctx)?.message ?? null,
    canManage: WRITE_ROLES.includes(session.role),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN", message: "Hanya ADMIN / SUPER_ADMIN." }, { status: 403 });
  const { id, ecId } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string; templateId?: string };
  const ctx = await loadQuizCompetition(id, ecId);
  if (!ctx) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (body.action === "prepare") {
    if (!body.templateId) return NextResponse.json({ error: "MISSING_TEMPLATE_ID" }, { status: 400 });
    if (!ctx.ec.judgingTemplates.some(t => t.judgingTemplateId === body.templateId))
      return NextResponse.json({ error: "TEMPLATE_NOT_ASSIGNED", message: "Templat belum ditetapkan pada pertandingan ini." }, { status: 400 });
    const fit = (await templatesWithFit()).find(t => t.id === body.templateId);
    if (!fit) return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    if (fit.fit) return NextResponse.json({ error: "TEMPLATE_NOT_SUITABLE", message: `Templat tidak sesuai untuk keputusan kuiz: ${fit.fit}` }, { status: 409 });
    // Moving the sync task to another template rewrites its scores — not while judging is frozen.
    if (judgingLocked(ctx.ec.judgingStatus))
      return NextResponse.json({ error: "JUDGING_LOCKED", message: "Penghakiman telah dikunci; templat sync tidak boleh ditukar." }, { status: 423 });
    const out = await prepareSyncTask(ecId, body.templateId);
    console.info(`[quizzly-sync] ${session.name || session.email} set sync template ${fit.code} on ec ${ecId} (cleared ${out.cleared})`);
    return NextResponse.json(out);
  }

  if (body.action !== "sync") return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  const blocked = syncBlocked(ctx);
  if (blocked) return NextResponse.json(blocked, { status: blocked.status });

  const [fits, existing] = await Promise.all([templatesWithFit(), findSyncTask(ecId)]);
  const templateId = effectiveTemplateId(ctx, fits, existing?.judgingTemplateId ?? null);
  if (!templateId)
    return NextResponse.json({ error: "NO_SUITABLE_TEMPLATE", message: "Tiada templat yang sesuai ditetapkan. Pilih templat atau gunakan Bantuan AI dahulu." }, { status: 409 });
  if (existing?.completedAt)
    return NextResponse.json({ error: "TASK_COMPLETED", message: `Tugas "${SYNC_LABEL}" telah diumumkan selesai; buka semula untuk menyelaraskan.` }, { status: 423 });

  const { task } = await prepareSyncTask(ecId, templateId);
  try {
    const summary = await syncQuizResults(ctx, task!.id);
    console.info(`[quizzly-sync] ${session.name || session.email} synced ec ${ecId}: +${summary.created} ~${summary.updated} =${summary.unchanged} -${summary.cleared}, ${summary.skipped} skipped`);
    return NextResponse.json(summary);
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    console.error("[quizzly-sync] results sync failed:", e);
    if (err.status === 409) return NextResponse.json({ error: "SYNC_FAILED", message: err.message }, { status: 409 });
    const message = err.name === "AbortError" ? "Asia Spark Quizzly tidak menjawab dalam masa — cuba lagi."
      : err.status === 401 || err.status === 403 ? "Kunci API Asia Spark Quizzly ditolak atau tiada skop results:read."
      : (err.message ?? "Sambungan ke Asia Spark Quizzly gagal.");
    return NextResponse.json({ error: "SYNC_FAILED", message }, { status: 502 });
  }
}
