import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const { query = "Malaysia Techlympics 2026" } = await req.json().catch(() => ({}));

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Enable Google Search grounding for real-time results
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      // @ts-expect-error googleSearch tool valid but not yet typed in current SDK version
      tools: [{ googleSearch: {} }],
    });

    const prompt = `Search for recent news articles about "${query}" in Malaysia — the annual national technology competition for school students.

For each article found, extract:
- title: the article headline
- source: publication name (e.g. "The Star", "Bernama", "New Straits Times", "Utusan Malaysia")
- sourceUrl: the FULL direct URL to the specific article page (e.g. "https://www.thestar.com.my/news/nation/2026/06/08/techlympics-article-title") — NOT the homepage or domain root. If you cannot find the exact article URL, omit this article.
- publishedDate: ISO date string (YYYY-MM-DD) if known, otherwise null
- summary: 3–4 sentence summary suitable for a news website

IMPORTANT: sourceUrl must be the complete URL to the individual article, not just the publication's homepage (e.g. NOT "https://www.bernama.com" or "https://www.thestar.com.my"). Only include articles where you have the full article URL.

Return ONLY a valid JSON array (no markdown fences, no explanation):
[{"title":"...","source":"...","sourceUrl":"...","publishedDate":"...","summary":"..."}]

Return up to 6 articles. Only include articles that are genuinely about Malaysia Techlympics. If none found, return [].`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const json = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let articles: unknown[] = [];
    try {
      const parsed = JSON.parse(json);
      articles = Array.isArray(parsed) ? parsed : [];
    } catch {
      articles = [];
    }

    return NextResponse.json({ articles });
  } catch (e) {
    console.error("[ai-discover]", e);
    return NextResponse.json({ error: "AI discovery failed" }, { status: 500 });
  }
}
