import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webcraftConfigured } from "@/lib/eptim-webcraft";
import {
  AI_WRITE_ROLES, DEFAULT_RUBRIC_CODE, aiConfigured, ensureDefaultRubric, findAiTask, loadAiCompetition,
  queueTeams, recordBlocked, recordToScorecard, resumeIfStalled, rubricFit, scoredWith, stopQueue, workerActive,
  type AiCompetition,
} from "@/lib/webcraft-ai-judging";

type Params = { params: Promise<{ id: string; ecId: string }> };

async function state(ec: AiCompetition) {
  await resumeIfStalled(ec.id);
  const [rows, task] = await Promise.all([
    db.webcraftAiJudgement.findMany({
      where: { eventCompetitionId: ec.id },
      select: {
        teamId: true, status: true, templateId: true, projectName: true, projectUrl: true,
        scores: true, total: true, maxTotal: true, comment: true, error: true, judgedAt: true,
      },
    }),
    findAiTask(ec.id),
  ]);
  const templates = ec.judgingTemplates.map(({ judgingTemplate: t }) => ({
    id: t.id, name: t.name, code: t.code,
    criteria: t.criterions.map((c) => ({ id: c.id, name: c.name, maxScore: c.maxScore })),
    fit: rubricFit(t.criterions),
  }));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    aiConfigured: aiConfigured(),
    webcraftConfigured: webcraftConfigured(),
    configLocked: !!ec.configLockedAt,
    hasDefaultRubric: ec.judgingTemplates.some((t) => t.judgingTemplate.code === DEFAULT_RUBRIC_CODE),
    recordBlocked: recordBlocked(ec),
    templates,
    rows: rows.map((r) => ({
      ...r,
      // Which assigned rubric the saved scores belong to, if any.
      scoredTemplateId: r.scores
        ? templates.find((t) => scoredWith(r.scores, new Set(t.criteria.map((c) => c.id))))?.id ?? null
        : null,
    })),
    progress: {
      queued: count("QUEUED"), running: count("RUNNING"), done: count("DONE"), error: count("ERROR"),
      active: workerActive(ec.id),
    },
    task: task ? { templateId: task.judgingTemplateId, scores: task._count.scores, updatedAt: task.updatedAt } : null,
  };
}

// GET — AI rubric choices, every team's AI result and the marking progress (polled by the page).
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: eventId, ecId } = await params;
  const ec = await loadAiCompetition(eventId, ecId);
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(await state(ec));
}

/**
 * POST { action }:
 *   rubric                               create the standard Webcraft rubric and assign it
 *   start  { templateId, mode, teamIds? } queue teams for AI marking (mode "missing" | "all")
 *   stop                                 drop teams not yet started
 *   record { templateId }                copy AI marks into the judging scorecard
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!AI_WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId } = await params;
  let ec = await loadAiCompetition(eventId, ecId);
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    action?: string; templateId?: string; mode?: string; teamIds?: string[];
  };
  const fail = (error: string, message: string, status = 409) => NextResponse.json({ error, message }, { status });
  const assigned = (id?: string) => ec!.judgingTemplates.find((t) => t.judgingTemplate.id === id)?.judgingTemplate;

  switch (body.action) {
    case "rubric": {
      if (ec.configLockedAt) return fail("CONFIG_LOCKED", "Konfigurasi penghakiman dikunci.");
      const templateId = await ensureDefaultRubric(ec.id);
      ec = (await loadAiCompetition(eventId, ecId))!;
      return NextResponse.json({ templateId, ...(await state(ec)) });
    }
    case "start": {
      if (!aiConfigured()) return fail("AI_NOT_CONFIGURED", "GEMINI_API_KEY tidak ditetapkan.", 503);
      if (!webcraftConfigured()) return fail("WEBCRAFT_NOT_CONFIGURED", "Webcraft tidak dikonfigurasi.", 503);
      const tpl = assigned(body.templateId);
      if (!tpl) return fail("TEMPLATE_NOT_ASSIGNED", "Pilih rubrik yang ditetapkan untuk pertandingan ini.", 400);
      const fit = rubricFit(tpl.criterions);
      if (fit) return fail("TEMPLATE_UNFIT", fit, 400);
      try {
        const r = await queueTeams(ec, tpl.id, body.mode === "all" ? "all" : "missing",
          Array.isArray(body.teamIds) ? body.teamIds : undefined);
        return NextResponse.json({ ...r, ...(await state(ec)) });
      } catch (e) {
        return fail("WEBCRAFT_FAILED", e instanceof Error ? e.message : "Webcraft tidak dapat dihubungi", 502);
      }
    }
    case "stop": {
      const stopped = await stopQueue(ec.id);
      return NextResponse.json({ stopped, ...(await state(ec)) });
    }
    case "record": {
      const blocked = recordBlocked(ec);
      if (blocked) return fail("RECORD_BLOCKED", blocked);
      const tpl = assigned(body.templateId);
      if (!tpl) return fail("TEMPLATE_NOT_ASSIGNED", "Pilih rubrik yang ditetapkan untuk pertandingan ini.", 400);
      const summary = await recordToScorecard(ec, tpl.id);
      return NextResponse.json({ summary, ...(await state(ec)) });
    }
    default:
      return fail("BAD_ACTION", "Tindakan tidak sah.", 400);
  }
}
