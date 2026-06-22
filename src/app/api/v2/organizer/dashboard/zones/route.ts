import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const zones = await db.zone.findMany({ orderBy: { name: "asc" } });

  const counts = await Promise.all(
    zones.map((zone) =>
      db.participant.count({
        where: {
          contingent: {
            OR: [
              { zoneId: zone.id },
              { school: { zoneId: zone.id } },
            ],
          },
        },
      })
    )
  );

  const data = zones.map((zone, i) => ({
    id: zone.id,
    name: zone.name,
    participantCount: counts[i],
  }));

  return NextResponse.json({ data });
}
