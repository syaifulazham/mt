import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Background processor (fire-and-forget) ────────────────────────────────────

async function runDistanceProcessing(
  eventId: string,
  schools: { contingentId: string; schoolName: string; stateName: string; districtName: string }[],
  venueDesc: string,
) {
  if (schools.length === 0) return;

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

    const parsed = JSON.parse(raw) as {
      schoolName: string; stateName: string; districtName: string;
      roadKm: number; airKm: number; waterKm: number | null;
    }[];

    // Build a lookup: schoolName → contingentId (use first match if duplicates)
    const lookup = new Map(schools.map((s) => [s.schoolName.toLowerCase(), s.contingentId]));

    await Promise.allSettled(
      parsed.map(async (r) => {
        const contingentId = lookup.get(r.schoolName.toLowerCase());
        if (!contingentId) return;
        await db.contingentDistance.update({
          where: { eventId_contingentId: { eventId, contingentId } },
          data: {
            roadKm:  r.roadKm  ?? null,
            airKm:   r.airKm   ?? null,
            waterKm: r.waterKm ?? null,
            status:  "DONE",
          },
        });
      }),
    );
  } catch (e) {
    console.error("[distance-table/start] Gemini processing failed:", e);
    // Mark all as ERROR so the user can retry
    await db.contingentDistance.updateMany({
      where: { eventId, contingentId: { in: schools.map((s) => s.contingentId) }, status: "PROCESSING" },
      data: { status: "ERROR" },
    });
  }
}

// ── POST /api/v2/organizer/events/[id]/attendance/distance-table/start ────────

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

  // Collect all registered contingents with schools
  const teamEvents = await db.teamEvent.findMany({
    where: { eventId, acceptance: "ACCEPT" },
    select: {
      team: {
        select: {
          contingent: {
            select: {
              id:   true,
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

  // Deduplicate by contingentId and only include school-linked contingents
  const allSchools = new Map<string, {
    contingentId: string; schoolName: string; stateName: string; districtName: string;
  }>();
  for (const te of teamEvents) {
    const c = te.team.contingent;
    if (!c.school) continue;
    if (allSchools.has(c.id)) continue;
    allSchools.set(c.id, {
      contingentId: c.id,
      schoolName:   c.school.name,
      stateName:    c.school.state?.name    ?? "",
      districtName: c.school.district?.name ?? "",
    });
  }

  // Find already-processed contingents (DONE or currently PROCESSING)
  const existingRecords = await db.contingentDistance.findMany({
    where: {
      eventId,
      contingentId: { in: [...allSchools.keys()] },
      status: { in: ["DONE", "PROCESSING"] },
    },
    select: { contingentId: true },
  });
  const skipIds = new Set(existingRecords.map((r) => r.contingentId));

  const toProcess = [...allSchools.values()].filter((s) => !skipIds.has(s.contingentId));
  const skipped   = allSchools.size - toProcess.length;

  if (toProcess.length === 0) {
    return NextResponse.json({ started: false, processing: 0, skipped });
  }

  // Mark all unprocessed as PROCESSING immediately
  await db.contingentDistance.createMany({
    data: toProcess.map((s) => ({
      eventId,
      contingentId: s.contingentId,
      schoolName:   s.schoolName,
      stateName:    s.stateName,
      districtName: s.districtName,
      status:       "PROCESSING",
    })),
    skipDuplicates: true,
  });

  // Fire-and-forget — runs in Node.js event loop after response is sent
  void runDistanceProcessing(eventId, toProcess, venueDesc);

  return NextResponse.json({ started: true, processing: toProcess.length, skipped });
}
