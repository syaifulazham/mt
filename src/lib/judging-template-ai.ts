import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { CriterionType, type Prisma } from "@prisma/client";

// AI helper for judging templates (Penghakiman → template row → Pembantu AI):
// Gemini drafts a template from a prompt and/or uploaded documents (rules,
// rubrics, score sheets — PDF, images, Word, text, spreadsheets), with the
// competition as context. The draft is returned for the organizer to edit and
// refine; nothing is saved until they create it (saveTemplateDraft).

export type DraftOption = { label: string; weight: number };
export type DraftCriterion = {
  name: string; type: "NUMBER" | "TIME" | "SINGLE_OPTION" | "MULTIPLE_OPTION";
  maxScore: number | null; minScore: number | null; maxTime: number | null; timePrecision: 0 | 2 | 3;
  options: DraftOption[];
};
export type TemplateDraft = { name: string; code: string; description: string; criterions: DraftCriterion[]; notes: string };

export const AI_MAX_FILES = 5;
export const AI_MAX_BYTES = 15 * 1024 * 1024;

const SYSTEM = `You design judging templates (score sheets) for school STEM and innovation competitions in Malaysia.
From the organizer's request and any attached documents (competition rules, rubrics, score sheets), produce ONE judging template that judges fill in per team.

Criterion types:
- NUMBER: a score from minScore to maxScore (usually minScore 0).
- TIME: a recorded time. maxTime is in seconds (may be fractional). Give maxScore when the time earns points — the score falls linearly from maxScore at 0 s to 0 at maxTime; set maxScore null when the time only breaks ties. timePrecision: 0 = whole seconds, 2 = hundredths, 3 = milliseconds.
- SINGLE_OPTION: the judge picks exactly one option; each option has a weight (its points).
- MULTIPLE_OPTION: the judge ticks any options; their weights add up. Use negative weights for penalties / deductions (e.g. "Langgar halangan" -1).

Rules:
- When the request or the documents list the criteria, marks or penalties, use exactly those — same names, maximum marks and weights — and add no other criteria.
- Only when neither lists any, design 4–8 sensible criteria for the competition described.
- Write names in the language of the request / documents (Bahasa Melayu by default), concise (max 50 characters).
- "code": UPPERCASE, max 12 characters, letters, digits and hyphens only.
- "notes": one or two short sentences for the organizer — what you based it on, the total marks, and anything they should check. Same language as the names.

Return ONLY JSON:
{"name": string, "code": string, "description": string, "notes": string,
 "criterions": [{"name": string, "type": "NUMBER"|"TIME"|"SINGLE_OPTION"|"MULTIPLE_OPTION",
   "maxScore": number|null, "minScore": number|null, "maxTime": number|null, "timePrecision": 0|2|3,
   "options": [{"label": string, "weight": number}]}]}`;

const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** A draft cleaned to what the template editor accepts. */
export function cleanDraft(raw: unknown): TemplateDraft {
  const o = (raw ?? {}) as Record<string, unknown>;
  const types = Object.values(CriterionType) as string[];
  const criterions = (Array.isArray(o.criterions) ? o.criterions : []).flatMap((c): DraftCriterion[] => {
    const r = (c ?? {}) as Record<string, unknown>;
    const type = String(r.type ?? "").toUpperCase();
    if (!types.includes(type)) return [];
    const options = type.endsWith("_OPTION")
      ? (Array.isArray(r.options) ? r.options : []).map(x => {
          const p = (x ?? {}) as Record<string, unknown>;
          return { label: String(p.label ?? "").trim().slice(0, 120), weight: num(p.weight) ?? 0 };
        }).filter(p => p.label)
      : [];
    const tp = Number(r.timePrecision);
    return [{
      name: String(r.name ?? "").trim().slice(0, 80) || "Kriteria",
      type: type as DraftCriterion["type"],
      maxScore: type === "NUMBER" || type === "TIME" ? num(r.maxScore) : null,
      minScore: type === "NUMBER" ? num(r.minScore) ?? 0 : null,
      maxTime: type === "TIME" ? num(r.maxTime) : null,
      timePrecision: type === "TIME" && (tp === 2 || tp === 3) ? tp : 0,
      options,
    }];
  });
  return {
    name: String(o.name ?? "").trim().slice(0, 120) || "Templat AI",
    code: String(o.code ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "AI-TPL",
    description: String(o.description ?? "").trim().slice(0, 500),
    notes: String(o.notes ?? "").trim().slice(0, 600),
    criterions,
  };
}

/** Upload → Gemini parts: PDF and images inline; Word / text / spreadsheets as extracted text. */
export async function fileParts(files: File[]): Promise<{ parts: Part[]; names: string[]; skipped: string[] }> {
  const parts: Part[] = [], names: string[] = [], skipped: string[] = [];
  for (const f of files.slice(0, AI_MAX_FILES)) {
    const buf = Buffer.from(await f.arrayBuffer());
    const name = f.name || "dokumen";
    const lower = name.toLowerCase();
    try {
      if (f.type === "application/pdf" || lower.endsWith(".pdf")) {
        parts.push({ inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } });
      } else if (f.type.startsWith("image/")) {
        parts.push({ inlineData: { mimeType: f.type, data: buf.toString("base64") } });
      } else if (lower.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ buffer: buf });
        parts.push({ text: `--- ${name} ---\n${value.slice(0, 80_000)}` });
      } else if (/\.(xlsx|xls|csv)$/.test(lower)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "buffer" });
        const text = wb.SheetNames.map(s => `# ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join("\n\n");
        parts.push({ text: `--- ${name} ---\n${text.slice(0, 80_000)}` });
      } else if (f.type.startsWith("text/") || /\.(txt|md|json)$/.test(lower)) {
        parts.push({ text: `--- ${name} ---\n${buf.toString("utf8").slice(0, 80_000)}` });
      } else { skipped.push(name); continue; }
      names.push(name);
    } catch { skipped.push(name); }
  }
  return { parts, names, skipped };
}

/** Gemini's draft for the request, documents and competition context (and, to refine, the previous draft). */
export async function draftTemplate(input: {
  prompt: string; parts: Part[]; context: string; previous?: TemplateDraft | null;
}): Promise<TemplateDraft> {
  if (!process.env.GEMINI_API_KEY) throw new Error("AI_UNAVAILABLE");
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    systemInstruction: SYSTEM,
  });
  const lead = [
    `Competition context:\n${input.context}`,
    input.previous ? `Current draft (revise it as asked, keep what isn't mentioned):\n${JSON.stringify(input.previous)}` : "",
    `Organizer's request:\n${input.prompt.trim() || "(none — base the template on the attached documents)"}`,
  ].filter(Boolean).join("\n\n");
  const res = await model.generateContent([{ text: lead }, ...input.parts]);
  const raw = res.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const draft = cleanDraft(JSON.parse(raw));
  if (!draft.criterions.length) throw new Error("AI_EMPTY");
  return draft;
}

/** Creates the template (code made unique) with its criteria and options; returns its id and final code. */
export async function saveTemplateDraft(tx: Prisma.TransactionClient, draft: TemplateDraft) {
  let code = draft.code;
  while (await tx.judgingTemplate.findUnique({ where: { code }, select: { id: true } }))
    code = `${draft.code.slice(0, 8)}-${Math.floor(Math.random() * 900 + 100)}`.slice(0, 12);
  const tpl = await tx.judgingTemplate.create({
    data: {
      name: draft.name, code, description: draft.description || null,
      criterions: {
        create: draft.criterions.map((c, order) => ({
          name: c.name, type: c.type, order,
          maxScore: c.maxScore, minScore: c.minScore, maxTime: c.maxTime, timePrecision: c.timePrecision,
          options: { create: c.options.map((o, j) => ({ label: o.label, weight: o.weight, order: j })) },
        })),
      },
    },
    select: { id: true, name: true, code: true, description: true, _count: { select: { criterions: true } } },
  });
  return tpl;
}
