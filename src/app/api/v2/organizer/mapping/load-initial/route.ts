import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncFromMaster, getAllClusters, schoolLevelToKey } from "@/lib/mapping-db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const LEVEL_KEYS = ["kids", "teens", "youth", "open", "kindergarten"] as const;
const LEVEL_DESC = {
  kids:         "Primary school / Sekolah Rendah",
  teens:        "Secondary school / Sekolah Menengah",
  youth:        "Youth / Belia / young adults",
  open:         "Open / Terbuka / University / Dewasa",
  kindergarten: "Kindergarten / Tadika / Prasekolah",
};

async function aiMatchLevels(
  targetGroups: { name: string; schoolLevel: string }[]
): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return {};

  // Deduplicate
  const unique = [...new Map(targetGroups.map(tg => [`${tg.name}|${tg.schoolLevel}`, tg])).values()];

  const levelList = LEVEL_KEYS.map(k => `  "${k}": ${LEVEL_DESC[k]}`).join("\n");
  const tgList = unique.map(tg => `- "${tg.name}" (schoolLevel: "${tg.schoolLevel}")`).join("\n");

  const prompt = `You are classifying competition target groups into level keys.
Level keys and their meanings:
${levelList}

Classify each target group below. Return ONLY valid JSON object: {"name|schoolLevel": "levelKey"}.
Use the schoolLevel field as the primary signal; use the name as supporting context.
If uncertain, default to "open".

Target groups:
${tgList}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Strip markdown code fences if present
    const json = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(json) as Record<string, string>;

    // Validate — only accept known level keys
    const levelSet = new Set(LEVEL_KEYS as readonly string[]);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = levelSet.has(v) ? v : "open";
    }
    return out;
  } catch (err) {
    console.warn("[load-initial] AI level matching failed, using deterministic fallback:", err);
    return {};
  }
}

export async function POST() {
  try {
    const themes = await db.theme.findMany({
      orderBy: { name: "asc" },
      include: {
        competitions: {
          orderBy: { code: "asc" },
          include: {
            targetGroups: {
              include: { targetGroup: true },
            },
            docs: {
              orderBy: { uploadedAt: "desc" },
            },
          },
        },
      },
    });

    // Collect all target groups for AI matching
    const allTgs: { name: string; schoolLevel: string }[] = [];
    for (const theme of themes) {
      for (const comp of theme.competitions) {
        for (const tg of comp.targetGroups) {
          allTgs.push({ name: tg.targetGroup.name, schoolLevel: tg.targetGroup.schoolLevel });
        }
      }
    }

    // AI match — only call for ones that don't cleanly match deterministically
    const ambiguous = allTgs.filter(tg => {
      const key = schoolLevelToKey(tg.schoolLevel);
      return key === "open" && !tg.schoolLevel.toUpperCase().includes("OPEN") && !tg.schoolLevel.toUpperCase().includes("TERBUKA");
    });
    const levelMap = ambiguous.length > 0 ? await aiMatchLevels(ambiguous) : {};

    syncFromMaster(
      themes.map((t) => ({
        id: t.id,
        name: t.name,
        competitions: t.competitions.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          pdfDocs: (c.docs ?? []).map((d) => ({ name: d.name, url: d.url })),
          targetGroups: c.targetGroups.map((tg) => ({
            targetGroup: {
              name: tg.targetGroup.name,
              schoolLevel: tg.targetGroup.schoolLevel,
            },
          })),
        })),
      })),
      levelMap
    );

    const clusters = getAllClusters();
    return NextResponse.json({ clusters });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load initial data" }, { status: 500 });
  }
}
