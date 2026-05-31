/**
 * One-time migration: MySQL mtdb.school → PostgreSQL techlympics_dev.schools
 *
 * Run: npx tsx prisma/migrate-schools.ts
 */

import { PrismaClient, SchoolLevel, SchoolCategory } from "@prisma/client";
import mysql from "mysql2/promise";

const pg = new PrismaClient();

// ── Category mapping: MySQL category string → Prisma SchoolCategory enum ────
const CATEGORY_MAP: Record<string, SchoolCategory> = {
  "SK":                          SchoolCategory.SEKOLAH_KEBANGSAAN,
  "SK KHAS":                     SchoolCategory.SEKOLAH_KEBANGSAAN_PENDIDIKAN_KHAS,
  "K9":                          SchoolCategory.KOLEJ_TINGKATAN_ENAM,
  "SJKC":                        SchoolCategory.SEKOLAH_JENIS_KEBANGSAAN_CINA,
  "SJKT":                        SchoolCategory.SEKOLAH_JENIS_KEBANGSAAN_TAMIL,
  "SEK. RENDAH AKADEMIK":        SchoolCategory.SEKOLAH_RENDAH_AKADEMIK,
  "SMK":                         SchoolCategory.SEKOLAH_MENENGAH_KEBANGSAAN,
  "KT6":                         SchoolCategory.PUSAT_TINGKATAN_ENAM,
  "SBP":                         SchoolCategory.SEKOLAH_BERASRAMA_PENUH,
  "SR SABK":                     SchoolCategory.SEKOLAH_RENDAH_AGAMA_BANTUAN_KERAJAAN,
  "SENI":                        SchoolCategory.SEKOLAH_SENI_MALAYSIA,
  "MODEL KHAS":                  SchoolCategory.SEKOLAH_MODEL_KHAS,
  "SM SABK":                     SchoolCategory.SEKOLAH_MENENGAH_AGAMA_BANTUAN_KERAJAAN,
  "SEK. MENENGAH AKADEMIK":      SchoolCategory.SEKOLAH_MENENGAH_AKADEMIK,
  "KV":                          SchoolCategory.KOLEJ_VOKASIONAL,
  "SEK. RENDAH AGAMA":           SchoolCategory.SEKOLAH_RENDAH_AGAMA,
  "SEK. MENENGAH AGAMA":         SchoolCategory.SEKOLAH_MENENGAH_AGAMA,
  "SEK. MEN. PERSENDIRIAN CINA": SchoolCategory.SEKOLAH_MENENGAH_PERSENDIRIAN_CINA,
  "SMKA":                        SchoolCategory.SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA,
  "SM KHAS":                     SchoolCategory.SEKOLAH_MENENGAH_PENDIDIKAN_KHAS,
  "SUKAN":                       SchoolCategory.SEKOLAH_SUKAN_MALAYSIA,
  "SMT":                         SchoolCategory.SEKOLAH_MENENGAH_TEKNIK,
  "AK":                          SchoolCategory.SEKOLAH_KEBANGSAAN,   // Akademik — fallback
  "SBJK":                        SchoolCategory.SEKOLAH_BIMBINGAN_JALINAN_KASIH,
  "SEK. ANTARABANGSA":           SchoolCategory.SEKOLAH_ANTARABANGSA,
  "MRSM":                        SchoolCategory.MAKTAB_RENDAH_SAINS_MARA,
  "SK TAHFIZ":                   SchoolCategory.SEKOLAH_KEBANGSAAN_TAHFIZ,
};

// ── Level mapping: MySQL level string → Prisma SchoolLevel enum ─────────────
const LEVEL_MAP: Record<string, SchoolLevel> = {
  "Rendah":   SchoolLevel.PRIMARY,
  "Menengah": SchoolLevel.SECONDARY,
};

// ── stateId (MySQL int 1–16) → state code → PostgreSQL state.id ─────────────
const STATE_CODE_MAP: Record<number, string> = {
  1:  "PLS",
  2:  "KDH",
  3:  "PNG",
  4:  "PRK",
  5:  "SGR",
  6:  "WPK",
  7:  "WPP",
  8:  "MLK",
  9:  "NSN",
  10: "JHR",
  11: "KTN",
  12: "PHG",
  13: "TRG",
  14: "SBH",
  15: "WPL",
  16: "SWK",
};

type MySQLSchool = {
  id: number;
  name: string;
  ppd: string | null;
  code: string;
  stateId: number;
  category: string;
  level: string;
};

async function main() {
  console.log("Starting school migration: MySQL → PostgreSQL\n");

  // Build stateCode → PostgreSQL state.id lookup
  const pgStates = await pg.state.findMany({ select: { id: true, code: true } });
  const pgStateMap = Object.fromEntries(pgStates.map((s) => [s.code, s.id]));

  // Connect to MySQL
  const my = await mysql.createConnection({
    host: "localhost",
    user: "azham",
    password: "DBAzham231",
    database: "mtdb",
  });

  const [rows] = await my.execute<mysql.RowDataPacket[]>(
    "SELECT id, name, ppd, code, stateId, category, level FROM school"
  );
  await my.end();

  const schools = rows as MySQLSchool[];
  console.log(`Fetched ${schools.length} schools from MySQL`);

  let inserted = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const school of schools) {
    const stateCode = STATE_CODE_MAP[school.stateId];
    const pgStateId = stateCode ? pgStateMap[stateCode] : undefined;

    if (!pgStateId) {
      warnings.push(`  ⚠ Unknown stateId ${school.stateId} for school "${school.name}" — skipped`);
      skipped++;
      continue;
    }

    const level = LEVEL_MAP[school.level];
    if (!level) {
      warnings.push(`  ⚠ Unknown level "${school.level}" for school "${school.name}" — skipped`);
      skipped++;
      continue;
    }

    const category = CATEGORY_MAP[school.category];
    if (!category) {
      warnings.push(`  ⚠ Unknown category "${school.category}" for school "${school.name}" — defaulting to LAIN_LAIN`);
    }

    await pg.school.upsert({
      where: { code: school.code },
      create: {
        name: school.name,
        code: school.code,
        ppdCode: school.ppd ?? null,
        stateId: pgStateId,
        level,
        category: category ?? SchoolCategory.SEKOLAH_KEBANGSAAN,
        isActive: true,
      },
      update: {
        name: school.name,
        ppdCode: school.ppd ?? null,
        stateId: pgStateId,
        level,
        category: category ?? SchoolCategory.SEKOLAH_KEBANGSAAN,
      },
    });

    inserted++;
    if (inserted % 500 === 0) process.stdout.write(`  ✓ ${inserted}/${schools.length}\n`);
  }

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    warnings.forEach((w) => console.log(w));
  }

  console.log(`\nDone. Inserted/updated: ${inserted}  Skipped: ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pg.$disconnect());
