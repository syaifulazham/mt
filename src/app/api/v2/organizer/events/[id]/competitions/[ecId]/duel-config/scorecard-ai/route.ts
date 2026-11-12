import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { competitionTitle } from "@/lib/competition-split";
import { parseScorecard } from "@/lib/duel-scorecard";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";
import { AI_MAX_BYTES, AI_MAX_FILES, fileParts } from "@/lib/judging-template-ai";

type Params = { params: Promise<{ id: string; ecId: string }> };
export const maxDuration = 120;

const SYSTEM = `You design the scorecard a marshal fills in for each team in one robot-combat / duel match at a Malaysian school competition.
Two groups:
- GAIN (Mata): what earns points. 
- PENALTY (Penalti): demerits; points are subtracted.
Item kinds:
- COUNT: "points" per occurrence, "max" = most times it can count (0 = no limit). E.g. "Tumbangkan lawan" 2 points, max 0.
- CHOICE: exactly one option, each with its own points — for graded judgements like aggression or control (e.g. Baik 3 / Sederhana 2 / Lemah 1). At least 2 options.
A PENALTY COUNT item may be "disqualify": true (e.g. "Hilang kelayakan", "Robot keluar gelanggang berulang kali" if the rules say it disqualifies) — the team then loses whatever its score.
Points are positive magnitudes in both groups.
When the request or the attached rules list the items, use exactly those — same names, points and limits — and add nothing else. Only when neither lists any, propose 3–6 gains and 2–5 penalties that suit the competition. Labels in the language of the request / documents (Bahasa Melayu by default), max 50 characters.
Return ONLY JSON: {"notes": string, "items": [{"group": "GAIN"|"PENALTY", "kind": "COUNT"|"CHOICE", "label": string, "points": number, "max": number, "disqualify": boolean, "options": [{"label": string, "points": number}]}]}
"notes": one or two short sentences for the organizer (what it is based on, what to check), same language as the labels.`;

// POST multipart { prompt, files[], current? } — Pembantu AI drafts the duel
// scorecard items from a request and/or rule documents (current items, as JSON,
// to revise). Returns { items, notes }; the editor saves them.
export async function POST(req: NextRequest, { params }: Params) {
  const { id, ecId } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  if (!process.env.GEMINI_API_KEY) return duelErr("AI_UNAVAILABLE", "Pembantu AI tidak dikonfigurasi (GEMINI_API_KEY).", 503);
  const form = await req.formData().catch(() => null);
  if (!form) return duelErr("INVALID", "Data tidak sah.");
  const prompt = String(form.get("prompt") ?? "").slice(0, 8000);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > AI_MAX_FILES) return duelErr("TOO_MANY_FILES", `Maksimum ${AI_MAX_FILES} dokumen.`);
  if (files.reduce((a, f) => a + f.size, 0) > AI_MAX_BYTES) return duelErr("TOO_LARGE", "Jumlah saiz dokumen melebihi 15 MB.");
  if (!prompt.trim() && !files.length) return duelErr("EMPTY", "Tulis arahan atau muat naik dokumen.");
  const current = String(form.get("current") ?? "");

  const c = g.ec.competition;
  const lead = [
    `Competition: ${c.code} ${competitionTitle(c.name, "")} — duel, ${g.cfg.format === "LEAGUE" || g.cfg.perSession === 2 ? "1 vs 1" : `${g.cfg.perSession} per session`}, ${Math.round(g.cfg.durationSec / 60 * 10) / 10} min per duel.`,
    current ? `Current scorecard (revise it as asked, keep what isn't mentioned):\n${current.slice(0, 20000)}` : "",
    `Organizer's request:\n${prompt.trim() || "(none — base it on the attached documents)"}`,
  ].filter(Boolean).join("\n\n");
  const { parts, skipped } = await fileParts(files);
  try {
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
      model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json", temperature: 0.2 }, systemInstruction: SYSTEM,
    });
    const res = await model.generateContent([{ text: lead }, ...parts]);
    const raw = JSON.parse(res.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")) as { notes?: string; items?: unknown };
    const card = parseScorecard({ enabled: true, items: raw.items });
    if (!card.items.length) throw new Error("empty");
    return NextResponse.json({ items: card.items, notes: String(raw.notes ?? "").slice(0, 600), skipped });
  } catch (e) {
    console.error("[scorecard-ai]", e);
    return duelErr("AI_FAILED", "Pembantu AI tidak dapat menjana kad skor. Cuba ubah arahan atau dokumen.", 422);
  }
}
