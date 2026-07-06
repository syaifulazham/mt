import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const ETHNICITY_LABEL: Record<string, string> = {
  MELAYU:                 "Melayu",
  CINA:                   "Cina",
  INDIA:                  "India",
  ORANG_ASLI_SEMENANJUNG: "Orang Asli",
  BUMIPUTRA_SABAH:        "Bumiputra Sabah",
  BUMIPUTRA_SARAWAK:      "Bumiputra Sarawak",
  LAIN_LAIN:              "Lain-lain",
};

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
    internationalContingents,
  ] = await Promise.all([
    db.participant.count(),
    db.contingent.count(),
    db.managerProfile.count({ where: { deletedAt: null } }),
    db.contingent.count({
      where: { contingentType: "SCHOOL", school: { level: "PRIMARY" } },
    }),
    db.contingent.count({
      where: { contingentType: "SCHOOL", school: { level: "SECONDARY" } },
    }),
    db.contingent.count({ where: { contingentType: "HIGHER"        } }),
    db.contingent.count({ where: { contingentType: "INDEPENDENT"   } }),
    db.contingent.count({ where: { contingentType: "INTERNATIONAL" } }),
  ]);

  // ── Participation by competition ───────────────────────────────────────────
  // A participant is eligible for a competition when their eduLevel (+ ppki flag)
  // matches at least one targetGroup.  All breakdown charts (gender, zone, state,
  // ethnicity) use the SAME eligibility logic so their totals tally with
  // totalParticipation.

  // ── School contingent locality breakdown ──────────────────────────────────
  const schoolConts = await db.contingent.findMany({
    where: { contingentType: "SCHOOL" },
    select: {
      school: {
        select: {
          zone:  { select: { name: true } },
          state: { select: { name: true } },
        },
      },
    },
  });

  const schoolZoneMap:  Record<string, number> = {};
  const schoolStateMap: Record<string, number> = {};
  for (const c of schoolConts) {
    const zoneName  = c.school?.zone?.name  ?? "Tiada Zon";
    const stateName = c.school?.state?.name ?? "Tiada Negeri";
    schoolZoneMap[zoneName]   = (schoolZoneMap[zoneName]   ?? 0) + 1;
    schoolStateMap[stateName] = (schoolStateMap[stateName] ?? 0) + 1;
  }
  const schoolByZone  = Object.entries(schoolZoneMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const schoolByState = Object.entries(schoolStateMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const [competitions, allParticipants, zoneStates] = await Promise.all([
    db.competition.findMany({
      select: {
        id: true, code: true, name: true,
        targetGroups: {
          include: { targetGroup: { select: { schoolLevel: true, ppki: true } } },
        },
      },
    }),
    db.participant.findMany({
      select: {
        id: true, eduLevel: true, ppki: true,
        gender: true, ethnicity: true,
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
    db.zoneState.findMany({ include: { zone: { select: { name: true } } } }),
  ]);

  // stateId → zone name (first zone wins if a state belongs to multiple zones)
  const stateToZone: Record<string, string> = {};
  for (const zs of zoneStates) {
    if (!stateToZone[zs.stateId]) stateToZone[zs.stateId] = zs.zone.name;
  }

  // ── Single eligibility pass — all breakdowns tally with totalParticipation ─

  const compCounts:   Record<string, { code: string; name: string; count: number }> = {};
  const genderMap:    Record<string, number> = {};
  const zoneMap:      Record<string, number> = {};
  const stateMap:     Record<string, number> = {};
  const ethnicityMap: Record<string, number> = {};

  for (const comp of competitions) {
    let compCount = 0;
    for (const p of allParticipants) {
      const eligible = comp.targetGroups.some(tg => {
        const tg_ = tg.targetGroup;
        if (tg_.schoolLevel.toUpperCase() !== p.eduLevel.toUpperCase()) return false;
        if (tg_.ppki && !p.ppki) return false;
        return true;
      });
      if (!eligible) continue;

      compCount++;

      // Gender
      const gLabel = p.gender === "MALE" ? "Male" : "Female";
      genderMap[gLabel] = (genderMap[gLabel] ?? 0) + 1;

      // Ethnicity
      const ethKey   = p.ethnicity ?? "LAIN_LAIN";
      const ethLabel = ETHNICITY_LABEL[ethKey] ?? ethKey;
      ethnicityMap[ethLabel] = (ethnicityMap[ethLabel] ?? 0) + 1;

      // Zone / State
      const c = p.contingent;
      if (c) {
        const isSchool  = c.contingentType === "SCHOOL";
        const geoState  = isSchool ? c.school?.state : c.state;
        const geoZone   = isSchool ? c.school?.zone  : c.zone;
        const stateName = geoState?.name ?? "No State";
        const zoneName  = geoZone?.name
          ?? (geoState?.id ? stateToZone[geoState.id] : undefined)
          ?? "No Zone";
        zoneMap[zoneName]   = (zoneMap[zoneName]   ?? 0) + 1;
        stateMap[stateName] = (stateMap[stateName] ?? 0) + 1;
      }
    }
    compCounts[comp.id] = { code: comp.code, name: comp.name, count: compCount };
  }

  const byCompetition = Object.values(compCounts).sort((a, b) => b.count - a.count);
  const totalParticipation = byCompetition.reduce((s, c) => s + c.count, 0);

  const byGender = Object.entries(genderMap)
    .map(([label, count]) => ({ label, count }));
  const byEthnicity = Object.entries(ethnicityMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
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
      internationalContingents,
    },
    charts: { byGender, byEthnicity, byZone, byState, byCompetition, schoolByZone, schoolByState },
  });
}
