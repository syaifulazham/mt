import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Gender, EduLevel } from "@prisma/client";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const EDU_MAP: Record<string, EduLevel> = {
  "sekolah rendah": "PRIMARY",
  "primary":        "PRIMARY",
  "rendah":         "PRIMARY",
  "sekolah menengah": "SECONDARY",
  "secondary":      "SECONDARY",
  "menengah":       "SECONDARY",
  "youth":          "YOUTH",
  "belia":          "YOUTH",
};

// ── POST /api/v2/manager/participants/bulk ───────────────────────────────────
// Body: { csvText: string, contingentId: string }
// Returns: { data: ParsedRow[], errors: string[] }
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: { select: { contingentId: true } },
    },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((c) => c.contingentId);

  const { csvText, contingentId } = await req.json();
  if (!csvText) return NextResponse.json({ error: "NO_CSV" }, { status: 400 });
  if (!contingentIds.includes(contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // ── Ask Gemini to parse & clean the CSV ──────────────────────────────────
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a data cleaning assistant. Parse this CSV of competition participants and return a JSON array.

Rules:
- "name": capitalize each word properly (e.g. "AZHAM BIN ALI" → "Azham Bin Ali")
- "ic": digits only, remove dashes (e.g. "990101-01-2345" → "990101012345"). If blank, use null.
- "gender": normalize to exactly "MALE" or "FEMALE". Infer from name if missing.
- "age": integer or null
- "eduLevel": map to exactly one of "PRIMARY", "SECONDARY", "YOUTH".
  Primary = sekolah rendah / darjah / std / primary school.
  Secondary = sekolah menengah / tingkatan / form / secondary school.
  Youth = youth / belia / open / tertiary.
- "classGrade": string or null (e.g. "5", "Form 3", "Darjah 4")
- "className": string or null (e.g. "Cerdas", "Amanah")
- "email": lowercase or null
- "phoneNumber": digits only, remove dashes/spaces, or null

Return ONLY a JSON array — no markdown, no explanation.

CSV:
${csvText}`;

  let rows: any[] = [];
  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    // strip markdown code fences if Gemini wraps the JSON
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    rows = JSON.parse(json);
  } catch (e) {
    return NextResponse.json({ error: "AI_PARSE_FAILED", detail: String(e) }, { status: 500 });
  }

  // ── Validate each row ─────────────────────────────────────────────────────
  const cleaned: any[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // 1-indexed, +1 for header
    if (!row.name) { errors.push(`Row ${rowNum}: name is required`); return; }

    const gender: Gender | undefined = row.gender === "MALE" || row.gender === "FEMALE"
      ? row.gender : undefined;
    if (!gender) { errors.push(`Row ${rowNum} (${row.name}): unrecognized gender "${row.gender}"`); return; }

    const eduRaw = String(row.eduLevel ?? "").toUpperCase();
    const eduLevel: EduLevel | undefined = (["PRIMARY","SECONDARY","YOUTH"].includes(eduRaw))
      ? eduRaw as EduLevel : undefined;
    if (!eduLevel) { errors.push(`Row ${rowNum} (${row.name}): unrecognized edu_level "${row.eduLevel}"`); return; }

    cleaned.push({
      name:        row.name,
      ic:          row.ic          ?? null,
      email:       row.email       ?? null,
      phoneNumber: row.phoneNumber ?? null,
      gender,
      age:         row.age ? Number(row.age) : null,
      eduLevel,
      classGrade:  row.classGrade  ?? null,
      className:   row.className   ?? null,
      contingentId,
    });
  });

  return NextResponse.json({ data: cleaned, errors });
}
