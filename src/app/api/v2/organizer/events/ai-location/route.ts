import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface AiLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string | null;
  state: string | null;
}

// ── POST /api/v2/organizer/events/ai-location ─────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { venue, address } = await req.json().catch(() => ({}));
  if (!venue && !address)
    return NextResponse.json({ error: "MISSING_HINT" }, { status: 400 });

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const hint = [venue, address].filter(Boolean).join(", ");

  const prompt = `You are a geocoding assistant specialised in Malaysian locations.

Given this location hint: "${hint}"

Return a single JSON object with these exact keys:
- "latitude": number (WGS84 decimal degrees, e.g. 3.1390)
- "longitude": number (WGS84 decimal degrees, e.g. 101.6869)
- "formattedAddress": string — full formatted address in Malaysia
- "city": string or null — city/town name
- "state": string or null — Malaysian state name (use exact names: Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, Putrajaya)

If the location cannot be found or is ambiguous, return null for latitude and longitude and best-guess the rest.
Return ONLY the JSON object. No markdown, no explanation.`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    const location: AiLocation = JSON.parse(raw);
    return NextResponse.json({ data: location });
  } catch (e) {
    console.error("AI location failed:", e);
    return NextResponse.json({ error: "AI_FAILED", detail: String(e) }, { status: 500 });
  }
}
