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

  const stateOR = [
    { stateId: id },
    { school: { stateId: id } },
  ];

  const [state, competitions, participants, totalContingents, totalManagers,
    primaryContingents, secondaryContingents, higherContingents,
    independentContingents, internationalContingents] = await Promise.all([
    db.state.findUnique({ where: { id } }),
    db.competition.findMany({
      select: {
        id: true,
        targetGroups: {
          include: { targetGroup: { select: { schoolLevel: true, ppki: true } } },
        },
      },
    }),
    db.participant.findMany({
      where: { contingent: { OR: stateOR } },
      select: {
        eduLevel: true,
        ppki: true,
        gender: true,
        ethnicity: true,
        contingent: {
          select: {
            contingentType: true,
            school: {
              select: {
                ppdCode: true,
                districtId: true,
                district: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    db.contingent.count({ where: { OR: stateOR } }),
    db.contingentManager.count({
      where: { status: "ACTIVE", contingent: { OR: stateOR } },
    }),
    db.contingent.count({
      where: { OR: stateOR, contingentType: "SCHOOL", school: { level: "PRIMARY" } },
    }),
    db.contingent.count({
      where: { OR: stateOR, contingentType: "SCHOOL", school: { level: "SECONDARY" } },
    }),
    db.contingent.count({ where: { OR: stateOR, contingentType: "HIGHER"        } }),
    db.contingent.count({ where: { OR: stateOR, contingentType: "INDEPENDENT"   } }),
    db.contingent.count({ where: { OR: stateOR, contingentType: "INTERNATIONAL" } }),
  ]);

  if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Count participations (participant × eligible competition) with breakdowns
  const genderMap:    Record<string, number> = {};
  const ethnicityMap: Record<string, number> = {};
  const ppdMap:       Record<string, number> = {};
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

      if (p.contingent.contingentType === "SCHOOL") {
        const ppdLabel =
          p.contingent.school?.district?.name ??
          p.contingent.school?.ppdCode ??
          "Tiada PPD";
        ppdMap[ppdLabel] = (ppdMap[ppdLabel] ?? 0) + 1;
      }
    }
  }

  const byGender = Object.entries(genderMap).map(([label, count]) => ({ label, count }));
  const byEthnicity = Object.entries(ethnicityMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const byPpd = Object.entries(ppdMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    state: { id: state.id, name: state.name, code: state.code },
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
    charts: { byGender, byEthnicity, byPpd },
  });
}
