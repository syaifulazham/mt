import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are a competition data parser. Extract competition records from free text or JSON input.

For each record extract:
- recordNo: integer (use 1-based index if not present)
- theme: theme/category name as written in the input
- code: competition code (preserve as-is, e.g. "1.1K", "ROBO-PRI")
- competition: competition name/title
- targetGroup: target audience name as written (e.g. "Kanak-Kanak", "Remaja", "Youth")

Return ONLY a valid JSON array, no markdown, no explanation.
Example: [{"recordNo":1,"theme":"THEME NAME","code":"1.1K","competition":"Competition Title","targetGroup":"Kanak-Kanak"}]`;

type RawRow = {
  recordNo: number;
  theme: string;
  code: string;
  competition: string;
  targetGroup: string;
};

export type ParsedRow = RawRow & {
  resolvedThemeId: string | null;
  resolvedThemeName: string | null;
  resolvedTargetGroupId: string | null;
  resolvedTargetGroupName: string | null;
  duplicate: boolean;
};

function extractJsonArray(text: string): string {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const s = cleaned.indexOf("[");
  const e = cleaned.lastIndexOf("]");
  return s !== -1 && e !== -1 ? cleaned.slice(s, e + 1) : cleaned;
}

function fuzzyMatch<T extends { name: string }>(list: T[], query: string): T | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // exact first
  const exact = list.find(t => t.name.toLowerCase() === q);
  if (exact) return exact;
  // substring both ways
  return list.find(t => t.name.toLowerCase().includes(q) || q.includes(t.name.toLowerCase())) ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { input } = await req.json() as { input?: string };
  if (!input?.trim()) return NextResponse.json({ error: "MISSING_INPUT" }, { status: 400 });

  const [themes, targetGroups, existingCompetitions] = await Promise.all([
    db.theme.findMany({ select: { id: true, name: true } }),
    db.targetGroup.findMany({ select: { id: true, name: true } }),
    db.competition.findMany({ select: { code: true } }),
  ]);

  const existingCodes = new Set(existingCompetitions.map(c => c.code.toUpperCase()));

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await model.generateContent(input);
  const rawText = result.response.text();

  let rawRows: RawRow[];
  try {
    rawRows = JSON.parse(extractJsonArray(rawText));
    if (!Array.isArray(rawRows)) throw new Error("not array");
  } catch {
    return NextResponse.json({ error: "PARSE_FAILED", raw: rawText }, { status: 422 });
  }

  const rows: ParsedRow[] = rawRows.map(r => {
    const code = String(r.code ?? "").toUpperCase();
    const tm = fuzzyMatch(themes, r.theme ?? "");
    const tg = fuzzyMatch(targetGroups, r.targetGroup ?? "");
    return {
      recordNo:                r.recordNo,
      theme:                   r.theme ?? "",
      code,
      competition:             r.competition ?? "",
      targetGroup:             r.targetGroup ?? "",
      resolvedThemeId:         tm?.id   ?? null,
      resolvedThemeName:       tm?.name ?? null,
      resolvedTargetGroupId:   tg?.id   ?? null,
      resolvedTargetGroupName: tg?.name ?? null,
      duplicate:               existingCodes.has(code),
    };
  });

  return NextResponse.json({ rows });
}
