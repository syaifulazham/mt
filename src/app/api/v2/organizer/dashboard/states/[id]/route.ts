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

  const [state, participants, totalContingents, totalManagers,
    primaryContingents, secondaryContingents, higherContingents,
    independentContingents, internationalContingents] = await Promise.all([
    db.state.findUnique({ where: { id } }),
    db.participant.findMany({
      where: { contingent: { OR: stateOR } },
      select: {
        gender: true,
        ethnicity: true,
        contingent: {
          select: {
            contingentType: true,
            stateId: true,
            schoolId: true,
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

  // ── Chart: byPpd ─────────────────────────────────────────────────────────────
  // Only school-linked participants contribute to PPD breakdown
  const ppdMap: Record<string, number> = {};
  for (const p of participants) {
    const c = p.contingent;
    if (c.contingentType !== "SCHOOL") continue;
    const ppdLabel =
      c.school?.district?.name ??
      c.school?.ppdCode ??
      "Tiada PPD";
    ppdMap[ppdLabel] = (ppdMap[ppdLabel] ?? 0) + 1;
  }
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
