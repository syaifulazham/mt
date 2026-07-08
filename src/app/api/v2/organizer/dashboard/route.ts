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

const LOCALITY_LABEL: Record<string, string> = {
  BANDAR:      "Bandar",
  SUB_BANDAR:  "Sub-Bandar",
  LUAR_BANDAR: "Luar Bandar",
  PEDALAMAN_1: "Pedalaman 1",
  PEDALAMAN_2: "Pedalaman 2",
  PEDALAMAN_3: "Pedalaman 3",
};
const LOCALITY_ORDER = Object.values(LOCALITY_LABEL);

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

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // ── All data in one parallel batch ────────────────────────────────────────

  const [
    totalParticipants,
    totalContingents,
    totalManagers,
    primaryContingents,
    secondaryContingents,
    higherContingents,
    independentContingents,
    internationalContingents,
    schoolConts,
    competitions,
    allParticipants,
    zoneStates,
  ] = await Promise.all([
    db.participant.count(),
    db.contingent.count(),
    db.managerProfile.count({ where: { deletedAt: null } }),
    db.contingent.count({ where: { contingentType: "SCHOOL", school: { level: "PRIMARY"   } } }),
    db.contingent.count({ where: { contingentType: "SCHOOL", school: { level: "SECONDARY" } } }),
    db.contingent.count({ where: { contingentType: "HIGHER"        } }),
    db.contingent.count({ where: { contingentType: "INDEPENDENT"   } }),
    db.contingent.count({ where: { contingentType: "INTERNATIONAL" } }),

    db.contingent.findMany({
      where: { contingentType: "SCHOOL" },
      select: {
        locality: true,
        school: {
          select: {
            zone:     { select: { name: true } },
            state:    { select: { id: true, name: true } },
            category: true,
          },
        },
      },
    }),

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

  // ── School contingent breakdowns ──────────────────────────────────────────
  const schoolZoneMap:     Record<string, number> = {};
  const schoolStateMap:    Record<string, number> = {};
  const schoolLocalityMap: Record<string, number> = {};
  const schoolCategoryMap: Record<string, number> = {};

  for (const c of schoolConts) {
    const stateId  = c.school?.state?.id;
    const zoneName = c.school?.zone?.name
      ?? (stateId ? stateToZone[stateId] : undefined)
      ?? "Tiada Zon";
    const stateName = c.school?.state?.name ?? "Tiada Negeri";

    schoolZoneMap[zoneName]   = (schoolZoneMap[zoneName]   ?? 0) + 1;
    schoolStateMap[stateName] = (schoolStateMap[stateName] ?? 0) + 1;

    const localityKey   = c.locality as string | null;
    const localityLabel = localityKey ? (LOCALITY_LABEL[localityKey] ?? localityKey) : "Tiada Lokaliti";
    schoolLocalityMap[localityLabel] = (schoolLocalityMap[localityLabel] ?? 0) + 1;

    const categoryKey   = c.school?.category as string | null;
    const categoryLabel = categoryKey ? (SCHOOL_CATEGORY_LABEL[categoryKey] ?? categoryKey) : "Tiada Kategori";
    schoolCategoryMap[categoryLabel] = (schoolCategoryMap[categoryLabel] ?? 0) + 1;
  }

  const schoolByZone  = Object.entries(schoolZoneMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const schoolByState = Object.entries(schoolStateMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const schoolByLocality = Object.entries(schoolLocalityMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      const ia = LOCALITY_ORDER.indexOf(a.label);
      const ib = LOCALITY_ORDER.indexOf(b.label);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return  1;
      return b.count - a.count;
    });
  const schoolByCategory = Object.entries(schoolCategoryMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  // ── Participation breakdowns (eligibility pass) ───────────────────────────

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

      const gLabel = p.gender === "MALE" ? "Male" : "Female";
      genderMap[gLabel] = (genderMap[gLabel] ?? 0) + 1;

      const ethKey   = p.ethnicity ?? "LAIN_LAIN";
      const ethLabel = ETHNICITY_LABEL[ethKey] ?? ethKey;
      ethnicityMap[ethLabel] = (ethnicityMap[ethLabel] ?? 0) + 1;

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

  const byCompetition     = Object.values(compCounts).sort((a, b) => b.count - a.count);
  const totalParticipation = byCompetition.reduce((s, c) => s + c.count, 0);

  const byGender    = Object.entries(genderMap).map(([label, count]) => ({ label, count }));
  const byEthnicity = Object.entries(ethnicityMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const byZone      = Object.entries(zoneMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const byState     = Object.entries(stateMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

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
    charts: {
      byGender, byEthnicity, byZone, byState, byCompetition,
      schoolByZone, schoolByState, schoolByLocality, schoolByCategory,
    },
  });
}
