import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logError } from "@/lib/appLogger";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface AiHEI {
  name: string;
  code: string;
  type: "HQ" | "BRANCH";
  parentCode: string | null;
  state: string | null;
  sector: "PUBLIC" | "PRIVATE" | "FOREIGN_BRANCH";
}

// ── POST /api/v2/organizer/reference-data/higher-institutions/ai-fetch ────────
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const extraPrompt: string = body?.extraPrompt ?? "";

  // Fetch existing HEI codes and names for filtering + client-side duplicate marking
  const existingHEIs = await db.higherInstitution.findMany({ select: { code: true, name: true } });
  const existingCodes = new Set(existingHEIs.map((h) => (h.code ?? "").toUpperCase()).filter(Boolean));
  const existingNames = existingHEIs.map((h) => h.name);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `You are a Malaysian higher education database researcher with access to current internet data.

List ALL accredited higher education institutions registered in Malaysia as of 2024–2025.

For each institution return a JSON object with:
- "name": Full official English name
- "code": Standard short code/abbreviation used in Malaysia.
  Rules:
  • HQ institutions: use the established abbreviation (e.g. "UTM", "UM", "UKM", "UiTM", "USM", "UPM", "MMU")
  • Branch campuses: use parent code + dash + location abbreviation
    e.g. UTM Kuala Lumpur → "UTM-KL", UiTM Pulau Pinang → "UiTM-PP", UiTM Kedah → "UiTM-KDH"
- "type": "HQ" for main/headquarters campus, "BRANCH" for branch/satellite campuses
- "parentCode": for BRANCH entries, the code of the parent HQ (e.g. "UiTM"); null for HQ entries
- "state": Malaysian state where main campus is located — use exact Malaysian state names:
  Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang,
  Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, Putrajaya
  Use null for online-only or unspecified.
- "sector": one of "PUBLIC" (government-funded), "PRIVATE" (private local), "FOREIGN_BRANCH" (foreign university branch)

MUST include:
1. All 20 Malaysian public universities (UM, UKM, UPM, UTM, USM, UiTM, UIAM, UUM, UNIMAS, UMS, UPSI, UTHM, UMP, UTeM, UniMAP, UMT, UMK, USIM, UPNM, UniKL) — HQ entries
2. UiTM branches in every state: Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Terengganu (plus Puncak Alam as HQ)
3. UTM branch in Kuala Lumpur
4. USM Engineering Campus (Pulau Pinang)
5. UPM Bintulu Campus (Sarawak)
6. Major private universities: MMU, UTAR, Taylor's University, Sunway University, HELP University, UCSI University, SEGi University, APU (Asia Pacific University), IMU, Heriot-Watt University Malaysia, Monash University Malaysia, University of Nottingham Malaysia, Curtin University Malaysia, Newcastle University Medicine Malaysia, Perdana University, Lincoln University College, Management and Science University (MSU), Binary University, INTI International University, Nilai University, KDU University College, MAHSA University, MUST (Malaysian University of Science and Technology)
7. UiTM Cawangan branches for each state
8. Polytechnics (Politeknik): at least the main ones per state with code prefix "POLY-"
9. Community Colleges (Kolej Komuniti): code prefix "KK-" for at least 2-3 per state
${extraPrompt ? `\nAdditional instructions from user:\n${extraPrompt}` : ""}
Return ONLY a valid JSON array. No markdown fences, no explanation.`;

  try {
    const result = await model.generateContent(prompt);
    let raw = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    // Ensure it starts with [
    const start = raw.indexOf("[");
    if (start > 0) raw = raw.slice(start);
    const end = raw.lastIndexOf("]");
    if (end !== -1) raw = raw.slice(0, end + 1);

    const institutions: AiHEI[] = JSON.parse(raw);

    // Deduplicate by code (keep first occurrence) and exclude already-imported HEIs
    const seen = new Set<string>();
    const deduped = institutions.filter((inst) => {
      const key = inst.code?.toUpperCase() ?? inst.name.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      // Skip if already in the database
      if (existingCodes.has(key)) return false;
      return true;
    });

    // Sort: HQ first, then BRANCH grouped under parent
    deduped.sort((a, b) => {
      if (a.type !== b.type) return a.type === "HQ" ? -1 : 1;
      const aKey = a.parentCode ?? a.code ?? "";
      const bKey = b.parentCode ?? b.code ?? "";
      return aKey.localeCompare(bKey) || a.code.localeCompare(b.code);
    });

    return NextResponse.json({ data: deduped, count: deduped.length, skipped: existingCodes.size, existingNames });
  } catch (e) {
    logError("ai-fetch/higher-institutions", e);
    return NextResponse.json({ error: "AI_FAILED", detail: String(e) }, { status: 422 });
  }
}
