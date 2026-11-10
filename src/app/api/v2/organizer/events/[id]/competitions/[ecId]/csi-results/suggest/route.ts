import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { WRITE_ROLES, loadCsiCompetition, templatesWithFit } from "@/lib/csi-score-sync";
import {
  csiDefaultDraft, csiTemplateMapping, draftCriteria, type CsiTemplateDraft,
} from "@/lib/csi-score-template";

// AI helper for the Eptim CSI judging template (Gemini, same key as the other
// organizer AI tools). Nothing is saved by "suggest" — the organizer reviews it.
// POST { action: "suggest", mode?: "auto" | "draft" }
//   → { kind: "match", templateId, reason } — the best existing template that fits, or
//   → { kind: "draft", draft, reason }       — a new template when none fits (or mode "draft").
// POST { action: "create", draft } — create the reviewed draft (not assigned; the
//   client assigns it through ../judging-templates, then prepares the sync task).

export const maxDuration = 60;
type Params = { params: Promise<{ id: string; ecId: string }> };

function cleanDraft(raw: unknown): CsiTemplateDraft | null {
  const d = raw as Partial<CsiTemplateDraft> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.criterions)) return null;
  const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    name: String(d.name ?? "").trim().slice(0, 120),
    code: String(d.code ?? "").trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9._-]/g, "").slice(0, 24),
    description: String(d.description ?? "").trim().slice(0, 500),
    criterions: d.criterions.slice(0, 20).map(c => ({
      name: String(c?.name ?? "").trim().slice(0, 200),
      type: c?.type === "TIME" ? "TIME" as const : "NUMBER" as const,
      minScore: c?.type === "TIME" ? null : num(c?.minScore),
      maxScore: c?.type === "TIME" ? null : num(c?.maxScore),
      maxTime: c?.type === "TIME" ? (num(c?.maxTime) != null ? Math.round(num(c?.maxTime)!) : null) : null,
    })).filter(c => c.name),
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, ecId } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string; mode?: string; draft?: unknown };
  const ctx = await loadCsiCompetition(id, ecId);
  if (!ctx) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (ctx.cases.length === 0) return NextResponse.json({ error: "NO_CASES", message: "Tiada kes CSI dipilih untuk pertandingan ini." }, { status: 409 });

  if (body.action === "create") {
    // Assigning it would be refused anyway — don't leave an orphan template behind.
    if (ctx.ec.configLockedAt) return NextResponse.json({ error: "CONFIG_LOCKED", message: "Konfigurasi dikunci." }, { status: 409 });
    const draft = cleanDraft(body.draft);
    if (!draft || !draft.name || !draft.code) return NextResponse.json({ error: "MISSING_FIELDS", message: "Nama dan kod templat diperlukan." }, { status: 400 });
    const m = csiTemplateMapping(draftCriteria(draft), ctx.cases);
    if (!m.ok) return NextResponse.json({ error: "TEMPLATE_NOT_SUITABLE", message: m.reason }, { status: 409 });

    // The code, or CODE-2, CODE-3… when taken.
    const taken = new Set((await db.judgingTemplate.findMany({ where: { code: { startsWith: draft.code } }, select: { code: true } })).map(t => t.code));
    let code = draft.code;
    for (let n = 2; taken.has(code); n++) code = `${draft.code}-${n}`;
    const template = await db.judgingTemplate.create({
      data: {
        name: draft.name, code, description: draft.description || null,
        criterions: { create: draft.criterions.map((c, i) => ({ ...c, order: i })) },
      },
      select: { id: true, name: true, code: true, description: true, _count: { select: { criterions: true } } },
    });
    console.info(`[eptim-csi] ${session.name || session.email} created judging template ${code} for ec ${ecId}`);
    return NextResponse.json({ template }, { status: 201 });
  }

  if (body.action !== "suggest") return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  const forceDraft = body.mode === "draft";
  const fits = await templatesWithFit(ctx.cases);
  const candidates = fits.filter(t => !t.fit);
  const fallback = csiDefaultDraft({
    competitionCode: ctx.ec.competition.code, competitionName: ctx.ec.competition.name,
    csiName: ctx.ec.eptimCsiCompetitionName, cases: ctx.cases,
  });
  const assigned = new Set(ctx.ec.judgingTemplates.map(t => t.judgingTemplateId));
  const deterministic = () => !forceDraft && candidates.length
    ? { kind: "match" as const, templateId: (candidates.find(t => assigned.has(t.id)) ?? candidates[0]).id, reason: "Templat pertama yang boleh menyimpan keputusan CSI." }
    : { kind: "draft" as const, draft: fallback, reason: "Templat lalai: satu skor bagi setiap kes dan jumlah masa." };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ...deterministic(), ai: false, note: "AI tidak dikonfigurasi (GEMINI_API_KEY); cadangan dibuat tanpa AI." });

  const csiInfo = {
    competition: { code: ctx.ec.competition.code, name: ctx.ec.competition.name },
    csiCompetition: ctx.ec.eptimCsiCompetitionName,
    timeLimitMinutes: ctx.timeLimitMinutes,
    cases: ctx.cases.map(c => ({ title: c.title, slug: c.slug, maxScore: c.maxScore, difficulty: c.difficulty, summary: c.summary?.slice(0, 400) ?? null })),
  };
  const candidateList = candidates.slice(0, 40).map(t => ({
    id: t.id, name: t.name, code: t.code, description: t.description?.slice(0, 200) ?? null, assignedToThisCompetition: assigned.has(t.id),
    criteria: [...t.criterions].sort((a, b) => a.order - b.order).map(c => ({ name: c.name, type: c.type, maxScore: c.maxScore, maxTime: c.maxTime })),
  }));

  const instruction = `You help the organiser of Malaysia Techlympics pick the judging template that will store the results of an online Eptim CSI competition (crime-scene investigation cases; each team plays each case and gets a score out of the case's max score, plus how long the run took).
The results are copied into the template automatically, so the template must have this shape:
- either one NUMBER criterion per case, whose name contains the case's exact title (e.g. "Skor: <case title>"), minScore 0 and maxScore = the case's maxScore;
- or exactly one NUMBER criterion holding the total score of every case (maxScore = sum of case maxScores);
- optionally one TIME criterion "Masa Rasmi" (total run time of every case, maxTime in seconds) — rankings break score ties on the shorter time. Runs often go past the competition's time limit, so set maxTime to at least ${4 * 3600 * ctx.cases.length};
- no other criteria (no SINGLE_OPTION / MULTIPLE_OPTION).
Teams are ranked by the sum of NUMBER criteria, so per-case criteria give the organiser a breakdown per case.

CSI competition: ${JSON.stringify(csiInfo)}

${forceDraft || candidateList.length === 0
    ? `Draft a NEW template. Write names and description in Bahasa Malaysia. Code: UPPERCASE, max 16 chars, letters/digits/hyphen, starting with "CSI-".`
    : `Existing templates that already have a valid shape: ${JSON.stringify(candidateList)}
Choose the one that best suits this competition (prefer one whose names refer to these cases or to this competition, one already assigned, and per-case breakdowns). If none of them really suits it (e.g. they are named for another competition's cases), draft a NEW template instead (Bahasa Malaysia; code UPPERCASE, max 16 chars, starting with "CSI-").`}

Return ONLY JSON, one of:
{"choice":"existing","templateId":"<id from the list>","reason":"<one or two sentences in Bahasa Malaysia>"}
{"choice":"new","reason":"<one or two sentences in Bahasa Malaysia>","template":{"name":"...","code":"...","description":"...","criterions":[{"name":"...","type":"NUMBER"|"TIME","minScore":number|null,"maxScore":number|null,"maxTime":number|null}]}}`;

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    });
    const result = await model.generateContent(instruction);
    const raw = JSON.parse(result.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")) as {
      choice?: string; templateId?: string; reason?: string; template?: unknown;
    };
    const reason = typeof raw.reason === "string" ? raw.reason.slice(0, 600) : "";

    if (raw.choice === "existing" && !forceDraft) {
      const pick = candidates.find(t => t.id === raw.templateId);
      if (pick) return NextResponse.json({ kind: "match", templateId: pick.id, reason, ai: true });
    }
    if (raw.choice === "new" || forceDraft || candidates.length === 0) {
      const draft = cleanDraft(raw.template);
      if (draft && draft.name && draft.code && csiTemplateMapping(draftCriteria(draft), ctx.cases).ok)
        return NextResponse.json({ kind: "draft", draft, reason, ai: true });
      return NextResponse.json({
        kind: "draft", draft: fallback, ai: true,
        reason: "Draf AI tidak mengikut bentuk yang diperlukan; templat lalai dicadangkan.",
      });
    }
    return NextResponse.json({ ...deterministic(), ai: true, note: "Jawapan AI tidak sah; cadangan dibuat tanpa AI." });
  } catch (e) {
    console.error("[eptim-csi] AI template suggestion failed:", e);
    return NextResponse.json({ ...deterministic(), ai: false, note: "AI gagal dihubungi; cadangan dibuat tanpa AI." });
  }
}
