import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      venue:   true,
      address: true,
      city:    true,
      state:   { select: { name: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const venueDesc = [event.venue, event.city, event.state?.name].filter(Boolean).join(", ");
  if (!venueDesc) return NextResponse.json({ error: "NO_VENUE" }, { status: 400 });

  const teamEvents = await db.teamEvent.findMany({
    where: { eventId, acceptance: "ACCEPT" },
    select: {
      team: {
        select: {
          contingent: {
            select: {
              school: {
                select: {
                  name:     true,
                  state:    { select: { name: true } },
                  district: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const schoolMap = new Map<string, { schoolName: string; stateName: string; districtName: string }>();
  for (const te of teamEvents) {
    const school = te.team.contingent.school;
    if (!school) continue;
    if (!schoolMap.has(school.name)) {
      schoolMap.set(school.name, {
        schoolName:   school.name,
        stateName:    school.state?.name    ?? "",
        districtName: school.district?.name ?? "",
      });
    }
  }

  const schools = [...schoolMap.values()];
  if (schools.length === 0) return NextResponse.json({ data: [], venue: venueDesc });

  const schoolList = schools
    .map((s, i) => `${i + 1}. ${s.schoolName}, ${s.districtName}, ${s.stateName}`)
    .join("\n");

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `You are a Malaysian geography and transport expert with accurate knowledge of Malaysian road networks.

Event venue: ${venueDesc}

For each school listed below, estimate distances FROM the school TO the event venue.
Rules:
- roadKm: estimated driving distance via public roads (km). Be realistic — use known highway distances.
- airKm: straight-line/geodesic distance (km).
- waterKm: sea/boat distance (km) if relevant — e.g. schools in East Malaysia (Sabah/Sarawak) vs Peninsular venue, or schools on islands. Return null if not applicable.

Schools:
${schoolList}

Return ONLY a JSON array. No markdown fences, no explanation.
Schema: [{ "schoolName": string, "stateName": string, "districtName": string, "roadKm": number, "airKm": number, "waterKm": number | null }]`;

  try {
    const result = await model.generateContent(prompt);
    let raw = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    const start = raw.indexOf("[");
    if (start > 0) raw = raw.slice(start);
    const end = raw.lastIndexOf("]");
    if (end !== -1) raw = raw.slice(0, end + 1);

    const data = JSON.parse(raw) as { roadKm: number }[];
    const sorted = [...data].sort((a, b) => (a.roadKm ?? 0) - (b.roadKm ?? 0));
    return NextResponse.json({ data: sorted, venue: venueDesc });
  } catch (e) {
    console.error("[distance-table] Gemini failed:", e);
    return NextResponse.json({ error: "AI_FAILED", detail: String(e) }, { status: 500 });
  }
}
