import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

type Params = { params: Promise<{ schoolId: string }> };

// PATCH — save coordinates manually: { latitude, longitude }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { schoolId } = await params;
  const body = await req.json() as { latitude: number; longitude: number };

  if (typeof body.latitude !== "number" || typeof body.longitude !== "number")
    return NextResponse.json({ error: "INVALID_COORDINATES" }, { status: 400 });

  const school = await db.school.update({
    where: { id: schoolId },
    data: { latitude: body.latitude, longitude: body.longitude },
    select: { latitude: true, longitude: true },
  });

  return NextResponse.json(school);
}

// POST — geocode using Gemini: { name, district, state }
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { schoolId } = await params;
  const { name, district, state } = await req.json() as { name: string; district: string; state: string };

  if (!name) return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `Find the exact GPS coordinates of this school in Malaysia.
School: ${name}
District: ${district}
State: ${state}

Return ONLY a JSON object. No markdown.
Schema: { "latitude": number, "longitude": number }
Be precise — use the actual school location, not the district or state centre.`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const coords = JSON.parse(raw) as { latitude: number; longitude: number };

    if (typeof coords.latitude !== "number" || typeof coords.longitude !== "number")
      return NextResponse.json({ error: "GEOCODE_FAILED" }, { status: 422 });

    // Save to school record
    await db.school.update({
      where: { id: schoolId },
      data: { latitude: coords.latitude, longitude: coords.longitude },
    });

    return NextResponse.json({ latitude: coords.latitude, longitude: coords.longitude });
  } catch (e) {
    console.error("[school/location] Gemini geocoding failed:", e);
    return NextResponse.json({ error: "GEOCODE_FAILED" }, { status: 422 });
  }
}
