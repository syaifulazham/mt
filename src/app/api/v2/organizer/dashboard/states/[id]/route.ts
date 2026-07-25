import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const SCHOOL_CATEGORY_LABEL: Record<string, string> = {
  SEKOLAH_KEBANGSAAN:                       "Sekolah Kebangsaan",
  SEKOLAH_MENENGAH_KEBANGSAAN:              "SMK",
  SEKOLAH_JENIS_KEBANGSAAN_CINA:            "SJK (Cina)",
  SEKOLAH_JENIS_KEBANGSAAN_TAMIL:           "SJK (Tamil)",
  SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA:        "SMKA",
  SEKOLAH_MENENGAH_AGAMA_BANTUAN_KERAJAAN:  "SABK",
  SEKOLAH_RENDAH_AGAMA_BANTUAN_KERAJAAN:    "SR Agama BK",
  SEKOLAH_MENENGAH_AGAMA:                   "SM Agama",
  SEKOLAH_RENDAH_AGAMA:                     "SR Agama",
  SEKOLAH_KEBANGSAAN_TAHFIZ:                "SK Tahfiz",
  SEKOLAH_BERASRAMA_PENUH:                  "SBP",
  MAKTAB_RENDAH_SAINS_MARA:                 "MRSM",
  KOLEJ_VOKASIONAL:                         "Kolej Vokasional",
  SEKOLAH_MENENGAH_TEKNIK:                  "SM Teknik",
  SEKOLAH_KEBANGSAAN_PENDIDIKAN_KHAS:       "SK Pendidikan Khas",
  SEKOLAH_MENENGAH_PENDIDIKAN_KHAS:         "SM Pendidikan Khas",
  SEKOLAH_BIMBINGAN_JALINAN_KASIH:          "Bimbingan Jalinan Kasih",
  SEKOLAH_MODEL_KHAS:                       "Model Khas",
  SEKOLAH_SENI_MALAYSIA:                    "Seni Malaysia",
  SEKOLAH_SUKAN_MALAYSIA:                   "Sukan Malaysia",
  PUSAT_TINGKATAN_ENAM:                     "Pusat Tingkatan 6",
  KOLEJ_TINGKATAN_ENAM:                     "Kolej Tingkatan 6",
  SEKOLAH_ANTARABANGSA:                     "Antarabangsa",
  SEKOLAH_MENENGAH_PERSENDIRIAN_CINA:       "Men. Persendirian Cina",
  SEKOLAH_MENENGAH_AKADEMIK:                "Men. Akademik",
  SEKOLAH_RENDAH_AKADEMIK:                  "Rendah Akademik",
};

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
                id: true,
                ppdCode: true,
                districtId: true,
                category: true,
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
    // Count distinct higher institutions in this state that have at least one contingent.
    // State is resolved via higherInstitution.stateId (HIGHER contingents don't carry
    // their own stateId — the institution record is the state anchor).
    db.higherInstitution.count({
      where: { stateId: id, contingents: { some: { contingentType: "HIGHER" } } },
    }),
    db.contingent.count({ where: { OR: stateOR, contingentType: "INDEPENDENT"   } }),
    db.contingent.count({ where: { OR: stateOR, contingentType: "INTERNATIONAL" } }),
  ]);

  if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Count distinct schools per PPD and per category (independent of competition eligibility)
  const ppdSchoolIds: Record<string, Set<string>> = {};
  const catSchoolIds: Record<string, Set<string>> = {};

  for (const p of participants) {
    if (p.contingent.contingentType !== "SCHOOL" || !p.contingent.school) continue;
    const schoolId = p.contingent.school.id;
    const ppdLabel =
      p.contingent.school.district?.name ??
      p.contingent.school.ppdCode ??
      "Tiada PPD";
    (ppdSchoolIds[ppdLabel] ??= new Set<string>()).add(schoolId);

    const catKey   = p.contingent.school.category as string | null;
    const catLabel = catKey ? (SCHOOL_CATEGORY_LABEL[catKey] ?? catKey) : "Tiada Kategori";
    (catSchoolIds[catLabel] ??= new Set<string>()).add(schoolId);
  }

  // Count participations (participant × eligible competition) with breakdowns
  const genderMap:    Record<string, number> = {};
  const ethnicityMap: Record<string, number> = {};
  const ppdMap:       Record<string, number> = {};
  const categoryMap:  Record<string, number> = {};
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

        const catKey   = p.contingent.school?.category as string | null;
        const catLabel = catKey ? (SCHOOL_CATEGORY_LABEL[catKey] ?? catKey) : "Tiada Kategori";
        categoryMap[catLabel] = (categoryMap[catLabel] ?? 0) + 1;
      }
    }
  }

  const byGender = Object.entries(genderMap).map(([label, count]) => ({ label, count }));
  const byEthnicity = Object.entries(ethnicityMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const byPpd = Object.entries(ppdMap)
    .map(([label, count]) => ({
      label,
      count,
      schools: ppdSchoolIds[label]?.size ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const bySchoolCategory = Object.entries(categoryMap)
    .map(([label, count]) => ({
      label,
      count,
      schools: catSchoolIds[label]?.size ?? 0,
    }))
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
    charts: { byGender, byEthnicity, byPpd, bySchoolCategory },
  });
}
