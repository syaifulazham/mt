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
  "SK":                       SchoolCategory.KEBANGSAAN,
  "SK KHAS":                  SchoolCategory.LAIN_LAIN,
  "K9":                       SchoolCategory.KEBANGSAAN,       // Kluster/K9
  "SJKC":                     SchoolCategory.KEBANGSAAN_CINA,
  "SJKT":                     SchoolCategory.KEBANGSAAN_TAMIL,
  "SEK. RENDAH AKADEMIK":     SchoolCategory.KEBANGSAAN,
  "SMK":                      SchoolCategory.KEBANGSAAN,
  "KT6":                      SchoolCategory.LAIN_LAIN,        // Kolej Tingkatan 6
  "SBP":                      SchoolCategory.LAIN_LAIN,        // Sekolah Berasrama Penuh
  "SR SABK":                  SchoolCategory.AGAMA,
  "SENI":                     SchoolCategory.LAIN_LAIN,
  "MODEL KHAS":               SchoolCategory.LAIN_LAIN,
  "SM SABK":                  SchoolCategory.AGAMA,
  "SEK. MENENGAH AKADEMIK":   SchoolCategory.KEBANGSAAN,
  "KV":                       SchoolCategory.TEKNIK,           // Kolej Vokasional
  "SEK. RENDAH AGAMA":        SchoolCategory.AGAMA,
  "SEK. MENENGAH AGAMA":      SchoolCategory.AGAMA,
  "SEK. MEN. PERSENDIRIAN CINA": SchoolCategory.KEBANGSAAN_CINA,
  "SMKA":                     SchoolCategory.AGAMA,
  "SM KHAS":                  SchoolCategory.LAIN_LAIN,
  "SUKAN":                    SchoolCategory.SPORT,
  "SMT":                      SchoolCategory.TEKNIK,
  "AK":                       SchoolCategory.LAIN_LAIN,        // Akademik (misc)
  "SBJK":                     SchoolCategory.LAIN_LAIN,
  "SEK. ANTARABANGSA":        SchoolCategory.PRIVATE,
  "MRSM":                     SchoolCategory.LAIN_LAIN,        // Maktab Rendah Sains MARA
  "SK TAHFIZ":                SchoolCategory.AGAMA,
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
        category: category ?? SchoolCategory.LAIN_LAIN,
        isActive: true,
      },
      update: {
        name: school.name,
        ppdCode: school.ppd ?? null,
        stateId: pgStateId,
        level,
        category: category ?? SchoolCategory.LAIN_LAIN,
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
