import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

// ── Malaysia state centroids (same set used by the frontend map) ──────────────
const STATE_CENTROIDS: Record<string, [number, number]> = {
  "Johor":           [1.9344,  103.3587],
  "Kedah":           [5.7964,  100.6497],
  "Kelantan":        [5.7487,  102.0000],
  "Melaka":          [2.2055,  102.2501],
  "Negeri Sembilan": [2.7258,  101.9424],
  "Pahang":          [3.8126,  103.3256],
  "Perak":           [4.5921,  101.0901],
  "Perlis":          [6.4449,  100.2048],
  "Pulau Pinang":    [5.4141,  100.3288],
  "Sabah":           [5.9788,  116.0753],
  "Sarawak":         [1.5533,  110.3592],
  "Selangor":        [3.0738,  101.5183],
  "Terengganu":      [5.3117,  103.1324],
  "Kuala Lumpur":    [3.1390,  101.6869],
  "Labuan":          [5.2831,  115.2308],
  "Putrajaya":       [2.9264,  101.6964],
};

const BORNEO_STATES = new Set(["Sabah", "Sarawak", "Labuan"]);

function getRegion(state: string): "borneo" | "peninsular" {
  return BORNEO_STATES.has(state) ? "borneo" : "peninsular";
}

// Haversine formula — returns km
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

// ── Background processor (fire-and-forget) ────────────────────────────────────

async function runDistanceProcessing(
  eventId: string,
  schools: { contingentId: string; schoolName: string; stateName: string; districtName: string }[],
  eventLat: number,
  eventLng: number,
  eventStateName: string,
) {
  const eventRegion = getRegion(eventStateName);

  for (const school of schools) {
    // Check it's still PROCESSING (not stopped/deleted by a concurrent stop request)
    const current = await db.contingentDistance.findUnique({
      where: { eventId_contingentId: { eventId, contingentId: school.contingentId } },
      select: { status: true },
    });
    if (!current || current.status !== "PROCESSING") continue;

    const centroid = STATE_CENTROIDS[school.stateName];
    if (!centroid) {
      // No centroid → mark ERROR
      await db.contingentDistance.updateMany({
        where: { eventId, contingentId: school.contingentId, status: "PROCESSING" },
        data: { status: "ERROR" },
      });
      continue;
    }

    const [schoolLat, schoolLng] = centroid;
    const airKm = Math.round(haversineKm(schoolLat, schoolLng, eventLat, eventLng));

    const schoolRegion = getRegion(school.stateName);
    const crossRegion  = schoolRegion !== eventRegion;

    // Road distance: not applicable cross-region (no road across the South China Sea)
    const roadKm  = crossRegion ? null : Math.round(airKm * 1.35);
    // Water distance: only meaningful cross-region
    const waterKm = crossRegion ? airKm : null;

    await db.contingentDistance.updateMany({
      where: { eventId, contingentId: school.contingentId, status: "PROCESSING" },
      data: { airKm, roadKm, waterKm, status: "DONE" },
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
      latitude:  true,
      longitude: true,
      state:     { select: { name: true } },
    },
  });
  if (!event)                return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (!event.latitude || !event.longitude)
    return NextResponse.json({ error: "NO_COORDINATES" }, { status: 400 });

  const eventStateName = event.state?.name ?? "Selangor"; // fallback: Peninsular

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

  // Skip contingents already DONE or currently PROCESSING
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

  // Mark all as PROCESSING immediately so the UI shows green dots
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

  // Fire-and-forget — computes Haversine distances, updates each record
  void runDistanceProcessing(eventId, toProcess, event.latitude, event.longitude, eventStateName);

  return NextResponse.json({ started: true, processing: toProcess.length, skipped });
}
