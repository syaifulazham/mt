import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const BORNEO_STATES = new Set(["Sabah", "Sarawak", "Labuan"]);

function getRegion(state: string | null): "borneo" | "peninsular" {
  if (!state) return "peninsular";
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const { contingentId } = await req.json() as { contingentId: string };

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { latitude: true, longitude: true, state: { select: { name: true } } },
  });
  if (!event?.latitude || !event?.longitude)
    return NextResponse.json({ error: "NO_EVENT_COORDINATES" }, { status: 400 });

  const contingent = await db.contingent.findUnique({
    where: { id: contingentId },
    select: {
      school: {
        select: {
          name:      true,
          latitude:  true,
          longitude: true,
          state:    { select: { name: true } },
          district: { select: { name: true } },
        },
      },
    },
  });

  const school = contingent?.school;
  if (!school?.latitude || !school?.longitude)
    return NextResponse.json({ error: "NO_SCHOOL_COORDINATES" }, { status: 400 });

  const airKm       = Math.round(haversineKm(school.latitude, school.longitude, event.latitude, event.longitude));
  const crossRegion = getRegion(school.state?.name) !== getRegion(event.state?.name);
  const roadKm      = crossRegion ? null : Math.round(airKm * 1.35);
  const waterKm     = crossRegion ? airKm : null;

  await db.contingentDistance.upsert({
    where: { eventId_contingentId: { eventId, contingentId } },
    create: {
      eventId,
      contingentId,
      schoolName:   school.name,
      stateName:    school.state?.name    ?? "",
      districtName: school.district?.name ?? "",
      airKm, roadKm, waterKm,
      status: "DONE",
    },
    update: { airKm, roadKm, waterKm, status: "DONE" },
  });

  return NextResponse.json({ airKm, roadKm, waterKm });
}
