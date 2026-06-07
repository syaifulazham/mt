import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const { name, clusterNameBm, entries } = await req.json();

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const LEVEL_LABELS: Record<string, string> = {
    kids: "Sekolah Rendah",
    teens: "Sekolah Menengah",
    youth: "Belia",
    open: "Terbuka",
    kindergarten: "Tadika",
  };

  const levelList = Array.isArray(entries)
    ? entries.map((e: { level: string }) => LEVEL_LABELS[e.level] ?? e.level).join(", ")
    : "";

  const prompt = `You are a bilingual (Bahasa Malaysia / English) copywriter for Malaysia Techlympics 2026, a national STEM competition.

Write a short, engaging competition description in BOTH languages for the following competition:

Competition Name: ${name}
Programme Cluster: ${clusterNameBm ?? ""}
Target Groups: ${levelList || "General"}

Rules:
- BM description: 1–2 sentences, enthusiastic, motivating, in formal Bahasa Malaysia. Max 180 chars.
- EN description: 1–2 sentences, same content. Max 180 chars.
- Do NOT mention "Techlympics" in the descriptions.
- Return ONLY a JSON object, no markdown, no extra text:
{"desc_bm": "...", "desc_en": "..."}`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const parsed = JSON.parse(raw);
    return NextResponse.json({ desc_bm: parsed.desc_bm ?? "", desc_en: parsed.desc_en ?? "" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
}
