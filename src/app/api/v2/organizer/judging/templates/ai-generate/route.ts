import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CriterionType } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are an expert judging criteria designer for academic and STEM competitions.
Given a competition description, generate a professional judging template with appropriate criteria.

Rules:
- criterion type must be one of: NUMBER, TIME, SINGLE_OPTION, MULTIPLE_OPTION
  • NUMBER  → numeric score (use maxScore/minScore, e.g. 0–100)
  • TIME    → time-based scoring (use maxTime in seconds, set maxScore/minScore to null)
  • SINGLE_OPTION  → judge picks exactly one option from a list (set maxScore/minScore to null, include "options" array)
  • MULTIPLE_OPTION → judge picks one or more options (same as above)
- For SINGLE_OPTION and MULTIPLE_OPTION, include an "options" array: [{ "label": "...", "weight": number }]
- Aim for 4–8 criteria that reflect real judging dimensions
- Code must be UPPERCASE, max 12 chars, no spaces (use hyphen)
- Keep criterion names concise (max 40 chars)
- description fields are optional but helpful

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "name": "string",
  "code": "string",
  "description": "string",
  "criterions": [
    {
      "name": "string",
      "type": "NUMBER|TIME|SINGLE_OPTION|MULTIPLE_OPTION",
      "maxScore": number | null,
      "minScore": number | null,
      "maxTime":  number | null,
      "description": "string | null",
      "options": [{ "label": "string", "weight": number }] | null
    }
  ]
}`;

// POST /api/v2/organizer/judging/templates/ai-generate
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt?.trim())
    return NextResponse.json({ error: "MISSING_PROMPT" }, { status: 400 });

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
    systemInstruction: SYSTEM_PROMPT,
  });

  let generated: {
    name: string; code: string; description: string;
    criterions: {
      name: string; type: string;
      maxScore: number | null; minScore: number | null; maxTime: number | null;
      description: string | null;
      options: { label: string; weight: number }[] | null;
    }[];
  };

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    generated = JSON.parse(raw);
  } catch (e) {
    console.error("[ai-generate] Gemini failed:", e);
    return NextResponse.json({ error: "AI_FAILED", detail: String(e) }, { status: 422 });
  }

  // Validate and create in a transaction
  try {
    const template = await db.$transaction(async (tx) => {
      // Ensure code is unique — append suffix if taken
      let code = (generated.code ?? "AI-TPL").toUpperCase().replace(/\s+/g, "-").slice(0, 12);
      const existing = await tx.judgingTemplate.findUnique({ where: { code } });
      if (existing) code = `${code.slice(0, 9)}-${Math.floor(Math.random() * 900 + 100)}`;

      const tpl = await tx.judgingTemplate.create({
        data: {
          name:        generated.name?.trim() || "AI Template",
          code,
          description: generated.description?.trim() || null,
        },
      });

      const validTypes = Object.values(CriterionType) as string[];
      const criterions = (generated.criterions ?? []).filter(c => validTypes.includes(c.type));

      for (let i = 0; i < criterions.length; i++) {
        const c = criterions[i];
        const criterion = await tx.judgingCriterion.create({
          data: {
            templateId:  tpl.id,
            name:        c.name?.trim() || `Criterion ${i + 1}`,
            type:        c.type as CriterionType,
            order:       i,
            maxScore:    c.maxScore != null ? Number(c.maxScore) : null,
            minScore:    c.minScore != null ? Number(c.minScore) : null,
            maxTime:     c.maxTime  != null ? Number(c.maxTime)  : null,
          },
        });

        if ((c.type === "SINGLE_OPTION" || c.type === "MULTIPLE_OPTION") && Array.isArray(c.options)) {
          for (let j = 0; j < c.options.length; j++) {
            const opt = c.options[j];
            await tx.judgingOption.create({
              data: {
                criterionId: criterion.id,
                label:       opt.label?.trim() || `Option ${j + 1}`,
                weight:      opt.weight != null ? Number(opt.weight) : 0,
                order:       j,
              },
            });
          }
        }
      }

      return tx.judgingTemplate.findUnique({
        where: { id: tpl.id },
        include: { _count: { select: { criterions: true } } },
      });
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (e) {
    console.error("[ai-generate] DB error:", e);
    return NextResponse.json({ error: "CREATE_FAILED", detail: String(e) }, { status: 500 });
  }
}
