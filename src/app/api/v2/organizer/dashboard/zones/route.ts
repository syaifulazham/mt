import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const [zones, zoneStateRows, competitions, allParticipants] = await Promise.all([
    db.zone.findMany({ orderBy: { name: "asc" } }),
    db.zoneState.findMany({ select: { zoneId: true, stateId: true } }),
    db.competition.findMany({
      select: {
        id: true,
        targetGroups: {
          include: { targetGroup: { select: { schoolLevel: true, ppki: true } } },
        },
      },
    }),
    db.participant.findMany({
      select: {
        eduLevel: true,
        ppki: true,
        contingent: {
          select: {
            contingentType: true,
            stateId: true,
            school: { select: { stateId: true } },
          },
        },
      },
    }),
  ]);

  // stateId → zoneId
  const stateToZone: Record<string, string> = {};
  for (const zs of zoneStateRows) {
    stateToZone[zs.stateId] = zs.zoneId;
  }

  // Count participations per zone (participant × eligible competition)
  const zoneCount: Record<string, number> = {};
  for (const comp of competitions) {
    for (const p of allParticipants) {
      const eligible = comp.targetGroups.some((tg) => {
        const t = tg.targetGroup;
        if (t.schoolLevel.toUpperCase() !== p.eduLevel.toUpperCase()) return false;
        if (t.ppki && !p.ppki) return false;
        return true;
      });
      if (!eligible) continue;

      const c = p.contingent;
      const stateId = c?.contingentType === "SCHOOL" ? c.school?.stateId : c?.stateId;
      const zoneId = stateId ? stateToZone[stateId] : undefined;
      if (zoneId) zoneCount[zoneId] = (zoneCount[zoneId] ?? 0) + 1;
    }
  }

  const data = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    participantCount: zoneCount[zone.id] ?? 0,
  }));

  return NextResponse.json({ data });
}
