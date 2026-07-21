import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Gender, EduLevel, Ethnicity } from "@prisma/client";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function sanitize(s: string): string {
  return s
    .replace(/[ --]/g, " ")
    .replace(/[''‚‛′‵]/g, "'")
    .replace(/[""„‟″‶]/g, '"')
    .replace(/[‐-―−﹘﹣－]/g, "-")
    .replace(/ | | | /g, " ")
    .replace(/﻿/g, "")
    .trim();
}

const VALID_ETHNICITIES = new Set<string>(Object.values(Ethnicity));

// POST /api/v2/organizer/contingents/[id]/participants/bulk
// Body: { csvText: string }
// Returns: { data: CleanRow[], errors: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contingent = await db.contingent.findUnique({ where: { id }, select: { id: true } });
  if (!contingent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { csvText } = await req.json();
  if (!csvText) return NextResponse.json({ error: "NO_CSV" }, { status: 400 });

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a data cleaning assistant. Parse this CSV of competition participants and return a JSON array.

Rules:
- "name": capitalize each word properly (e.g. "AZHAM BIN ALI" → "Azham Bin Ali")
- "ic": digits only, remove dashes (e.g. "990101-01-2345" → "990101012345"). If blank, use null.
- "gender": normalize to exactly "MALE" or "FEMALE". Infer from IC last digit if present (odd=MALE, even=FEMALE). Infer from name if missing.
- "age": integer or null. Derive from IC (YYMMDD) if blank.
- "eduLevel": map to exactly one of "PRIMARY", "SECONDARY", "YOUTH".
  Primary = sekolah rendah / darjah / std / primary school / age 7-12.
  Secondary = sekolah menengah / tingkatan / form / secondary school / age 13-17.
  Youth = youth / belia / open / tertiary / age 18+.
- "classGrade": string or null (e.g. "Darjah 5", "Tingkatan 3")
- "className": string or null (e.g. "Cerdas", "Amanah")
- "email": lowercase or null
- "phoneNumber": digits only, remove dashes/spaces, or null
- "ethnicity": map to exactly one of: MELAYU, CINA, INDIA, ORANG_ASLI_SEMENANJUNG, BUMIPUTRA_SABAH, BUMIPUTRA_SARAWAK, LAIN_LAIN. Use null if not provided.
  Melayu/Malay → MELAYU, Cina/Chinese → CINA, India/Indian/Tamil → INDIA,
  Orang Asli/Asli Semenanjung → ORANG_ASLI_SEMENANJUNG,
  Bumiputra Sabah/Kadazan/Dusun/Bajau/Murut → BUMIPUTRA_SABAH,
  Bumiputra Sarawak/Iban/Bidayuh/Melanau/Dayak → BUMIPUTRA_SARAWAK,
  Other/Lain-lain → LAIN_LAIN.
- "ppki": boolean. true if the column value is any non-empty string (e.g. "Y", "Yes", "1", "PPKI", "✓"), false if empty or null.

Return ONLY a JSON array — no markdown, no explanation.

CSV:
${csvText}`;

  type AiRow = {
    name: string; ic?: string; email?: string; phoneNumber?: string;
    gender: string; age?: number; eduLevel: string;
    classGrade?: string; className?: string; ethnicity?: string; ppki?: boolean;
  };
  type CleanRow = {
    name: string; ic: string | null; email: string | null; phoneNumber: string | null;
    gender: Gender; age: number | null; eduLevel: EduLevel;
    classGrade: string | null; className: string | null;
    ethnicity: Ethnicity | null; ppki: boolean;
  };

  let rows: AiRow[] = [];
  try {
    const result = await model.generateContent(prompt);
    const raw  = result.response.text().trim();
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    rows = JSON.parse(json);
  } catch (e) {
    return NextResponse.json({ error: "AI_PARSE_FAILED", detail: String(e) }, { status: 500 });
  }

  const cleaned: CleanRow[] = [];
  const errors: string[]    = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const name   = sanitize(row.name ?? "");
    if (!name) { errors.push(`Row ${rowNum}: name is required`); return; }

    const gender: Gender | undefined = row.gender === "MALE" || row.gender === "FEMALE"
      ? row.gender : undefined;
    if (!gender) { errors.push(`Row ${rowNum} (${name}): unrecognized gender "${row.gender}"`); return; }

    const eduRaw = sanitize(String(row.eduLevel ?? "")).toUpperCase();
    const eduLevel: EduLevel | undefined = (["PRIMARY", "SECONDARY", "YOUTH"].includes(eduRaw))
      ? eduRaw as EduLevel : undefined;
    if (!eduLevel) { errors.push(`Row ${rowNum} (${name}): unrecognized edu_level "${row.eduLevel}"`); return; }

    const ethRaw   = row.ethnicity ? sanitize(String(row.ethnicity)).toUpperCase() : null;
    const ethnicity: Ethnicity | null = (ethRaw && VALID_ETHNICITIES.has(ethRaw))
      ? ethRaw as Ethnicity : null;

    cleaned.push({
      name,
      ic:          row.ic          ? sanitize(row.ic)                   : null,
      email:       row.email       ? sanitize(row.email).toLowerCase()  : null,
      phoneNumber: row.phoneNumber ? sanitize(row.phoneNumber)          : null,
      gender, age: row.age ? Number(row.age) : null, eduLevel,
      classGrade:  row.classGrade  ? sanitize(row.classGrade)           : null,
      className:   row.className   ? sanitize(row.className)            : null,
      ethnicity, ppki: !!row.ppki,
    });
  });

  return NextResponse.json({ data: cleaned, errors });
}
