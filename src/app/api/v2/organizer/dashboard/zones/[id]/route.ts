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

  // Resolve zone's state IDs first — contingents use stateId, not zoneId
  const [zone, zoneStateRows] = await Promise.all([
    db.zone.findUnique({
      where: { id },
      include: {
        states: {
          include: { state: { select: { id: true, name: true } } },
        },
      },
    }),
    db.zoneState.findMany({ where: { zoneId: id }, select: { stateId: true } }),
  ]);

  if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const stateIds = zoneStateRows.map((r) => r.stateId);

  const zoneOR = [
    { stateId: { in: stateIds } },
    { school: { stateId: { in: stateIds } } },
  ];

  const [participants, totalContingents, totalManagers,
    primaryContingents, secondaryContingents, higherContingents,
    independentContingents, internationalContingents] = await Promise.all([
    db.participant.findMany({
      where: { contingent: { OR: zoneOR } },
      select: {
        gender: true,
        ethnicity: true,
        contingent: {
          select: {
            contingentType: true,
            stateId: true,
            schoolId: true,
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

  // Build stateId → name map from the zone's states
  const stateIdToName: Record<string, string> = {};
  for (const zs of zone.states) {
    stateIdToName[zs.state.id] = zs.state.name;
  }

  const totalParticipation = participants.length;

  // ── Chart: byGender ─────────────────────────────────────────────────────────
  const genderMap: Record<string, number> = {};
  for (const p of participants) {
    const label = p.gender === "MALE" ? "Male" : "Female";
    genderMap[label] = (genderMap[label] ?? 0) + 1;
  }
  const byGender = Object.entries(genderMap).map(([label, count]) => ({ label, count }));

  // ── Chart: byEthnicity ───────────────────────────────────────────────────────
  const ethnicityMap: Record<string, number> = {};
  for (const p of participants) {
    const key   = p.ethnicity ?? "LAIN_LAIN";
    const label = ETHNICITY_LABEL[key] ?? key;
    ethnicityMap[label] = (ethnicityMap[label] ?? 0) + 1;
  }
  const byEthnicity = Object.entries(ethnicityMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // ── Chart: byState ───────────────────────────────────────────────────────────
  const stateMap: Record<string, number> = {};
  for (const p of participants) {
    const c = p.contingent;
    const stateId =
      c.contingentType === "SCHOOL" ? c.school?.stateId : c.stateId;
    const stateName = (stateId ? stateIdToName[stateId] : undefined) ?? "No State";
    stateMap[stateName] = (stateMap[stateName] ?? 0) + 1;
  }
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
