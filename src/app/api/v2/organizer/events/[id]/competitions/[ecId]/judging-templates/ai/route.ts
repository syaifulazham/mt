import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { competitionTitle } from "@/lib/competition-split";
import { AI_MAX_BYTES, AI_MAX_FILES, cleanDraft, draftTemplate, fileParts, saveTemplateDraft, type TemplateDraft } from "@/lib/judging-template-ai";

type Params = { params: Promise<{ id: string; ecId: string }> };

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const err = (error: string, message: string, status = 400) => NextResponse.json({ error, message }, { status });

export const maxDuration = 120;

async function guard(params: Params["params"]) {
  const session = await getOrganizerSession();
  if (!session) return { res: err("UNAUTHORIZED", "Sila log masuk.", 401) };
  if (!WRITE_ROLES.includes(session.role)) return { res: err("FORBIDDEN", "Tiada kebenaran.", 403) };
  const { id: eventId, ecId } = await params;
  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, eventId },
    select: {
      id: true, splitLabel: true, judgingMethod: true, configLockedAt: true,
      event: { select: { name: true } },
      competition: {
        select: {
          code: true, name: true, participationType: true, description: true,
          targetGroups: { select: { targetGroup: { select: { name: true } } } },
        },
      },
      judgingTemplates: { select: { judgingTemplate: { select: { name: true, code: true } } } },
    },
  });
  if (!ec) return { res: err("NOT_FOUND", "Pertandingan tidak dijumpai.", 404) };
  return { ec };
}

// POST — Pembantu AI for judging templates.
//
// multipart/form-data { prompt, files[], previous? } — Gemini drafts a
//   template from the request, the documents (PDF, images, Word, text,
//   spreadsheets) and this competition; `previous` (a draft, as JSON) refines
//   it. Returns { draft, files, skipped }. Nothing is saved.
// application/json { action: "create", draft } — save the (edited) draft as a
//   template and assign it to this competition.
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("res" in g) return g.res;
  const { ec } = g;

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await req.json().catch(() => ({})) as { action?: string; draft?: unknown };
    if (body.action !== "create") return err("INVALID", "Tindakan tidak sah.");
    if (ec.configLockedAt) return err("CONFIG_LOCKED", "Konfigurasi dikunci.", 409);
    const draft = cleanDraft(body.draft);
    if (!draft.criterions.length) return err("NO_CRITERIA", "Templat perlu sekurang-kurangnya satu kriteria.");
    const template = await db.$transaction(async tx => {
      const tpl = await saveTemplateDraft(tx, draft);
      await tx.eventCompetitionJudgingTemplate.create({ data: { eventCompetitionId: ec.id, judgingTemplateId: tpl.id } });
      return tpl;
    });
    return NextResponse.json({ template }, { status: 201 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return err("INVALID", "Data tidak sah.");
  const prompt = String(form.get("prompt") ?? "").slice(0, 8000);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > AI_MAX_FILES) return err("TOO_MANY_FILES", `Maksimum ${AI_MAX_FILES} dokumen.`);
  if (files.reduce((a, f) => a + f.size, 0) > AI_MAX_BYTES) return err("TOO_LARGE", "Jumlah saiz dokumen melebihi 15 MB.");
  if (!prompt.trim() && !files.length) return err("EMPTY", "Tulis arahan atau muat naik dokumen.");
  let previous: TemplateDraft | null = null;
  try { const p = form.get("previous"); if (typeof p === "string" && p) previous = cleanDraft(JSON.parse(p)); } catch { /* ignore */ }

  const c = ec.competition;
  const context = [
    `Event: ${ec.event.name}`,
    `Competition: ${c.code} ${competitionTitle(c.name, ec.splitLabel)} (${c.participationType === "INDIVIDUAL" ? "individual" : "team"})`,
    c.targetGroups.length ? `Target groups: ${c.targetGroups.map(t => t.targetGroup.name).join(", ")}` : "",
    c.description ? `Description: ${c.description.slice(0, 1500)}` : "",
    ec.judgingTemplates.length ? `Templates already assigned (make this one complement, not duplicate them): ${ec.judgingTemplates.map(t => `${t.judgingTemplate.name} (${t.judgingTemplate.code})`).join("; ")}` : "",
  ].filter(Boolean).join("\n");

  const { parts, names, skipped } = await fileParts(files);
  try {
    const draft = await draftTemplate({ prompt, parts, context, previous });
    return NextResponse.json({ draft, files: names, skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "AI_UNAVAILABLE") return err("AI_UNAVAILABLE", "Pembantu AI tidak dikonfigurasi (GEMINI_API_KEY).", 503);
    console.error("[judging-template-ai]", e);
    return err("AI_FAILED", "Pembantu AI tidak dapat menjana templat. Cuba ubah arahan atau dokumen.", 422);
  }
}
