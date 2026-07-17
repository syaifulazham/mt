import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { stopRequested } from "../processing-state";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const BORNEO_STATES = new Set(["Sabah", "Sarawak", "Labuan"]);

function getRegion(state: string): "borneo" | "peninsular" {
  return BORNEO_STATES.has(state) ? "borneo" : "peninsular";
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Batch-geocode schools with missing coordinates using Gemini.
// Saves results directly to the schools table and returns them keyed by schoolId.
async function geocodeMissingSchools(
  schools: { schoolId: string; schoolName: string; districtName: string; stateName: string }[],
): Promise<Map<string, { lat: number; lng: number }>> {
  const result = new Map<string, { lat: number; lng: number }>();
  if (schools.length === 0) return result;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const list = schools
    .map((s, i) => `${i + 1}. ${s.schoolName}, ${s.districtName}, ${s.stateName}, Malaysia`)
    .join("\n");

  const prompt = `You are a Malaysian geography expert. For each school below, return its GPS coordinates.
Be as precise as possible — use known school locations, not district/state centres.

Schools:
${list}

Return ONLY a JSON array. No markdown fences, no explanation.
Schema: [{ "name": string, "latitude": number, "longitude": number }]`;

  try {
    const res = await model.generateContent(prompt);
    let raw = res.response.text().trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = raw.indexOf("["); if (start > 0) raw = raw.slice(start);
    const end = raw.lastIndexOf("]"); if (end !== -1) raw = raw.slice(0, end + 1);

    const parsed = JSON.parse(raw) as { name: string; latitude: number; longitude: number }[];

    // Match by index (Gemini returns them in the same order)
    await Promise.allSettled(
      parsed.map(async (item, i) => {
        const school = schools[i];
        if (!school || typeof item.latitude !== "number" || typeof item.longitude !== "number") return;
        result.set(school.schoolId, { lat: item.latitude, lng: item.longitude });
        await db.school.update({
          where: { id: school.schoolId },
          data: { latitude: item.latitude, longitude: item.longitude },
        });
      }),
    );
  } catch (e) {
    console.error("[distance-table/start] Gemini geocoding failed:", e);
  }

  return result;
}

// ── Background processor — one school at a time ───────────────────────────────

type School = {
  contingentId: string;
  schoolId: string;
  schoolName: string;
  stateName: string;
  districtName: string;
  schoolLat: number | null;
  schoolLng: number | null;
};

async function runDistanceProcessing(
  eventId: string,
  schools: School[],
  eventLat: number,
  eventLng: number,
  eventStateName: string,
) {
  const eventRegion = getRegion(eventStateName);

  // Phase 1: batch-geocode all schools that still have no coordinates
  const missing = schools.filter((s) => s.schoolLat == null || s.schoolLng == null);
  if (missing.length > 0) {
    const geocoded = await geocodeMissingSchools(missing);
    for (const school of missing) {
      const coords = geocoded.get(school.schoolId);
      if (coords) {
        school.schoolLat = coords.lat;
        school.schoolLng = coords.lng;
      }
    }
  }

  // Phase 2: process one school at a time
  for (const school of schools) {
    if (stopRequested.has(eventId)) {
      stopRequested.delete(eventId);
      break;
    }

    const existing = await db.contingentDistance.findUnique({
      where: { eventId_contingentId: { eventId, contingentId: school.contingentId } },
      select: { status: true },
    });
    if (existing?.status === "DONE") continue;

    // Mark PROCESSING so the UI shows a green dot for this school
    await db.contingentDistance.upsert({
      where: { eventId_contingentId: { eventId, contingentId: school.contingentId } },
      create: {
        eventId,
        contingentId: school.contingentId,
        schoolName:   school.schoolName,
        stateName:    school.stateName,
        districtName: school.districtName,
        status:       "PROCESSING",
      },
      update: { status: "PROCESSING" },
    });

    const { schoolLat, schoolLng } = school;

    if (schoolLat == null || schoolLng == null) {
      // No coordinates even after geocoding — mark ERROR
      await db.contingentDistance.updateMany({
        where: { eventId, contingentId: school.contingentId, status: "PROCESSING" },
        data: { status: "ERROR" },
      });
      continue;
    }

    const airKm       = Math.round(haversineKm(schoolLat, schoolLng, eventLat, eventLng));
    const crossRegion = getRegion(school.stateName) !== eventRegion;
    const roadKm      = crossRegion ? null : Math.round(airKm * 1.35);
    const waterKm     = crossRegion ? airKm : null;

    await db.contingentDistance.updateMany({
      where: { eventId, contingentId: school.contingentId, status: "PROCESSING" },
      data: { airKm, roadKm, waterKm, status: "DONE" },
    });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { latitude: true, longitude: true, state: { select: { name: true } } },
  });
  if (!event)                              return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (!event.latitude || !event.longitude) return NextResponse.json({ error: "NO_COORDINATES" }, { status: 400 });

  const eventStateName = event.state?.name ?? "Selangor";

  const teamEvents = await db.teamEvent.findMany({
    where: { eventId, acceptance: "ACCEPT" },
    select: {
      team: {
        select: {
          contingent: {
            select: {
              id: true,
              school: {
                select: {
                  id:        true,
                  name:      true,
                  latitude:  true,
                  longitude: true,
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

  const allSchools = new Map<string, School>();
  for (const te of teamEvents) {
    const c = te.team.contingent;
    if (!c.school || allSchools.has(c.id)) continue;
    allSchools.set(c.id, {
      contingentId: c.id,
      schoolId:     c.school.id,
      schoolName:   c.school.name,
      stateName:    c.school.state?.name    ?? "",
      districtName: c.school.district?.name ?? "",
      schoolLat:    c.school.latitude       ?? null,
      schoolLng:    c.school.longitude      ?? null,
    });
  }

  const existing = await db.contingentDistance.findMany({
    where: {
      eventId,
      contingentId: { in: [...allSchools.keys()] },
      status: { in: ["DONE", "PROCESSING"] },
    },
    select: { contingentId: true },
  });
  const skipIds   = new Set(existing.map((r) => r.contingentId));
  const toProcess = [...allSchools.values()].filter((s) => !skipIds.has(s.contingentId));

  if (toProcess.length === 0) {
    return NextResponse.json({ started: false, processing: 0, skipped: allSchools.size });
  }

  stopRequested.delete(eventId);

  void runDistanceProcessing(eventId, toProcess, event.latitude, event.longitude, eventStateName);

  return NextResponse.json({ started: true, processing: toProcess.length, skipped: allSchools.size - toProcess.length });
}
