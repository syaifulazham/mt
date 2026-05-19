import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // ── Core counts ────────────────────────────────────────────────────────────

  const [
    totalParticipants,
    totalContingents,
    totalManagers,
    primaryContingents,
    secondaryContingents,
    higherContingents,
    independentContingents,
  ] = await Promise.all([
    db.participant.count(),
    db.contingent.count(),
    db.managerProfile.count({ where: { deletedAt: null } }),
    // Primary school contingents: SCHOOL type linked to a PRIMARY school
    db.contingent.count({
      where: { contingentType: "SCHOOL", school: { level: "PRIMARY" } },
    }),
    // Secondary school contingents: SCHOOL type linked to a SECONDARY school
    db.contingent.count({
      where: { contingentType: "SCHOOL", school: { level: "SECONDARY" } },
    }),
    db.contingent.count({ where: { contingentType: "HIGHER"      } }),
    db.contingent.count({ where: { contingentType: "INDEPENDENT" } }),
  ]);

  // ── Participation by competition ───────────────────────────────────────────
  // For each competition fetch its target group school levels,
  // then count eligible participants (eduLevel matches schoolLevel).

  const competitions = await db.competition.findMany({
    select: {
      id: true, code: true, name: true,
      targetGroups: { include: { targetGroup: { select: { schoolLevel: true } } } },
    },
  });

  // All participants with their eduLevel for fast in-memory counting
  const allParticipants = await db.participant.findMany({
    select: { id: true, eduLevel: true },
  });

  const byCompetition = competitions.map(comp => {
    const levels = new Set(
      comp.targetGroups.map(tg => tg.targetGroup.schoolLevel.toUpperCase())
    );
    const count = allParticipants.filter(p => levels.has(p.eduLevel.toUpperCase())).length;
    return { code: comp.code, name: comp.name, count };
  }).sort((a, b) => b.count - a.count);

  const totalParticipation = byCompetition.reduce((s, c) => s + c.count, 0);

  // ── Participation by gender ────────────────────────────────────────────────

  const genderGroups = await db.participant.groupBy({
    by: ["gender"],
    _count: { _all: true },
  });
  const byGender = genderGroups.map(g => ({
    label: g.gender === "MALE" ? "Male" : "Female",
    count: g._count._all,
  }));

  // ── Participation by zone & state ─────────────────────────────────────────
  // For SCHOOL contingents the geographic data lives on the school.
  // Zones are many-to-many with states via ZoneState; build a stateId→zoneName
  // lookup so we can resolve the correct zone from the school's stateId.

  const [zoneStates, participantsByGeo] = await Promise.all([
    db.zoneState.findMany({ include: { zone: { select: { name: true } } } }),
    db.participant.findMany({
      select: {
        contingent: {
          select: {
            contingentType: true,
            zone:  { select: { name: true } },
            state: { select: { id: true, name: true } },
            school: {
              select: {
                zone:  { select: { name: true } },
                state: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  // stateId → zone name (first zone wins if a state belongs to multiple zones)
  const stateToZone: Record<string, string> = {};
  for (const zs of zoneStates) {
    if (!stateToZone[zs.stateId]) stateToZone[zs.stateId] = zs.zone.name;
  }

  const zoneMap:  Record<string, number> = {};
  const stateMap: Record<string, number> = {};

  for (const p of participantsByGeo) {
    const c = p.contingent;
    const isSchool = c.contingentType === "SCHOOL";

    const geoState = isSchool ? c.school?.state : c.state;
    const geoZone  = isSchool ? c.school?.zone  : c.zone;

    const stateName = geoState?.name ?? "No State";

    // Prefer the directly linked zone name; fall back to zone lookup via stateId
    const zoneName = geoZone?.name
      ?? (geoState?.id ? stateToZone[geoState.id] : undefined)
      ?? "No Zone";

    zoneMap[zoneName]   = (zoneMap[zoneName]   ?? 0) + 1;
    stateMap[stateName] = (stateMap[stateName] ?? 0) + 1;
  }

  const byZone = Object.entries(zoneMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const byState = Object.entries(stateMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    stats: {
      totalParticipation,
      totalParticipants,
      totalContingents,
      totalManagers,
      primaryContingents,
      secondaryContingents,
      higherContingents,
      independentContingents,
    },
    charts: { byGender, byZone, byState, byCompetition },
  });
}
