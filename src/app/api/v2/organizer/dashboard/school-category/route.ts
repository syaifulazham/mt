import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

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

const GRADE_ORDER = ["1","2","3","4","5","6","Tingkatan 1","Tingkatan 2","Tingkatan 3","Tingkatan 4","Tingkatan 5"];

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const category = req.nextUrl.searchParams.get("category");
  if (!category || !SCHOOL_CATEGORY_LABEL[category])
    return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });

  const contingents = await db.contingent.findMany({
    where: {
      contingentType: "SCHOOL",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      school: { category: category as any },
    },
    select: {
      id: true,
      school: {
        select: {
          name: true,
          state: { select: { name: true } },
        },
      },
      _count: { select: { teams: true, trainers: true } },
      participants: {
        select: { gender: true, classGrade: true },
      },
    },
  });

  const contingentIds = contingents.map((c) => c.id);

  // Manager counts per contingent from join table
  const managerMap: Record<string, number> = {};
  if (contingentIds.length > 0) {
    const rows = await db.$queryRaw<{ contingentId: string; cnt: number }[]>`
      SELECT cm."contingentId", COUNT(*)::int AS cnt
      FROM "contingent_managers" cm
      WHERE cm."contingentId" IN (${Prisma.join(contingentIds)})
      GROUP BY cm."contingentId"
    `;
    for (const row of rows) managerMap[row.contingentId] = row.cnt;
  }

  // Per-school list sorted by state then name
  const schools = contingents
    .map((c) => {
      const male   = c.participants.filter((p) => p.gender === "MALE").length;
      const female = c.participants.filter((p) => p.gender === "FEMALE").length;
      return {
        state:        c.school?.state?.name ?? "—",
        name:         c.school?.name ?? "—",
        participants: c.participants.length,
        male,
        female,
        teams:    c._count.teams,
        managers: managerMap[c.id] ?? 0,
        trainers: c._count.trainers,
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));

  // Aggregate stats
  const totalParticipants = schools.reduce((s, c) => s + c.participants, 0);
  const totalMale         = schools.reduce((s, c) => s + c.male, 0);
  const totalFemale       = totalParticipants - totalMale;
  const totalManagers     = Object.values(managerMap).reduce((s, n) => s + n, 0);
  const totalTrainers     = schools.reduce((s, c) => s + c.trainers, 0);
  const totalTeams        = schools.reduce((s, c) => s + c.teams, 0);

  // Grade breakdown
  const gradeMap: Record<string, number> = {};
  for (const c of contingents) {
    for (const p of c.participants) {
      const g = p.classGrade || "Tiada";
      gradeMap[g] = (gradeMap[g] ?? 0) + 1;
    }
  }
  const byGrade = Object.entries(gradeMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      const ia = GRADE_ORDER.indexOf(a.label);
      const ib = GRADE_ORDER.indexOf(b.label);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.label.localeCompare(b.label);
    });

  return NextResponse.json({
    categoryKey:   category,
    categoryLabel: SCHOOL_CATEGORY_LABEL[category] ?? category,
    stats: {
      schools:      contingents.length,
      participants: totalParticipants,
      male:         totalMale,
      female:       totalFemale,
      managers:     totalManagers,
      trainers:     totalTrainers,
      teams:        totalTeams,
    },
    byGender: [
      { label: "Lelaki",    count: totalMale   },
      { label: "Perempuan", count: totalFemale },
    ],
    byGrade,
    schools,
  });
}
