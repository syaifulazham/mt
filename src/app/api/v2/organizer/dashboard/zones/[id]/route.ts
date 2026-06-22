import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const [zone, zoneStateRows] = await Promise.all([
    db.zone.findUnique({
      where: { id },
      include: {
        states: { include: { state: { select: { id: true, name: true } } } },
      },
    }),
    db.zoneState.findMany({ where: { zoneId: id }, select: { stateId: true } }),
  ]);

  if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const stateIds = zoneStateRows.map((r) => r.stateId);

  const stateIdToName: Record<string, string> = {};
  for (const zs of zone.states) stateIdToName[zs.state.id] = zs.state.name;

  const zoneOR = [
    { stateId: { in: stateIds } },
    { school: { stateId: { in: stateIds } } },
  ];

  const [competitions, participants, totalContingents, totalManagers,
    primaryContingents, secondaryContingents, higherContingents,
    independentContingents, internationalContingents] = await Promise.all([
    db.competition.findMany({
      select: {
        id: true,
        targetGroups: {
          include: { targetGroup: { select: { schoolLevel: true, ppki: true } } },
        },
      },
    }),
    db.participant.findMany({
      where: { contingent: { OR: zoneOR } },
      select: {
        eduLevel: true,
        ppki: true,
        gender: true,
        ethnicity: true,
        contingent: {
          select: {
            contingentType: true,
            stateId: true,
            school: { select: { stateId: true } },
          },
        },
      },
    }),
    db.contingent.count({ where: { OR: zoneOR } }),
    db.contingentManager.count({
      where: { status: "ACTIVE", contingent: { OR: zoneOR } },
    }),
    db.contingent.count({
      where: { OR: zoneOR, contingentType: "SCHOOL", school: { level: "PRIMARY" } },
    }),
    db.contingent.count({
      where: { OR: zoneOR, contingentType: "SCHOOL", school: { level: "SECONDARY" } },
    }),
    db.contingent.count({ where: { OR: zoneOR, contingentType: "HIGHER"        } }),
    db.contingent.count({ where: { OR: zoneOR, contingentType: "INDEPENDENT"   } }),
    db.contingent.count({ where: { OR: zoneOR, contingentType: "INTERNATIONAL" } }),
  ]);

  // Count participations (participant × eligible competition) with breakdowns
  const genderMap:    Record<string, number> = {};
  const ethnicityMap: Record<string, number> = {};
  const stateMap:     Record<string, number> = {};
  let totalParticipation = 0;

  for (const comp of competitions) {
    for (const p of participants) {
      const eligible = comp.targetGroups.some((tg) => {
        const t = tg.targetGroup;
        if (t.schoolLevel.toUpperCase() !== p.eduLevel.toUpperCase()) return false;
        if (t.ppki && !p.ppki) return false;
        return true;
      });
      if (!eligible) continue;

      totalParticipation++;

      const gLabel = p.gender === "MALE" ? "Male" : "Female";
      genderMap[gLabel] = (genderMap[gLabel] ?? 0) + 1;

      const ethKey   = p.ethnicity ?? "LAIN_LAIN";
      const ethLabel = ETHNICITY_LABEL[ethKey] ?? ethKey;
      ethnicityMap[ethLabel] = (ethnicityMap[ethLabel] ?? 0) + 1;

      const c = p.contingent;
      const stateId = c.contingentType === "SCHOOL" ? c.school?.stateId : c.stateId;
      const stateName = (stateId ? stateIdToName[stateId] : undefined) ?? "No State";
      stateMap[stateName] = (stateMap[stateName] ?? 0) + 1;
    }
  }

  const byGender = Object.entries(genderMap).map(([label, count]) => ({ label, count }));
  const byEthnicity = Object.entries(ethnicityMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const byState = Object.entries(stateMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    zone: { id: zone.id, name: zone.name },
    stats: {
      totalParticipation,
      totalContingents,
      totalManagers,
      primaryContingents,
      secondaryContingents,
      higherContingents,
      independentContingents,
      internationalContingents,
    },
    charts: { byGender, byEthnicity, byState },
  });
}
