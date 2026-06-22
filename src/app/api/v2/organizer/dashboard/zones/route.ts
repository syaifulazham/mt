import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const zones = await db.zone.findMany({ orderBy: { name: "asc" } });

  // Zones don't have zoneId on contingents; resolve via state membership
  const zoneStates = await db.zoneState.findMany({
    where: { zoneId: { in: zones.map((z) => z.id) } },
    select: { zoneId: true, stateId: true },
  });

  const zoneToStateIds: Record<string, string[]> = {};
  for (const zs of zoneStates) {
    (zoneToStateIds[zs.zoneId] ??= []).push(zs.stateId);
  }

  const counts = await Promise.all(
    zones.map((zone) => {
      const stateIds = zoneToStateIds[zone.id] ?? [];
      return db.participant.count({
        where: {
          contingent: {
            OR: [
              { stateId: { in: stateIds } },
              { school: { stateId: { in: stateIds } } },
            ],
          },
        },
      });
    })
  );

  const data = zones.map((zone, i) => ({
    id: zone.id,
    name: zone.name,
    participantCount: counts[i],
  }));

  return NextResponse.json({ data });
}
