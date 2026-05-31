/**
 * Export schools from MySQL mtdb into prisma/schools-export.json.
 * Applies the full SchoolCategory enum mapping and writes categoryShort.
 * Schools with category 'AK' are skipped (unclassified).
 *
 * Run: npx tsx prisma/export-schools.ts
 *
 * Requires: npm install mysql2
 */
import mysql, { RowDataPacket } from "mysql2/promise";

type SchoolRow = RowDataPacket & {
  code: string;
  name: string;
  category: string;
  ppdCode: string | null;
  stateName: string | null;
};
import { writeFileSync } from "fs";
import { join } from "path";

const CATEGORY_MAP: Record<string, string> = {
  "SK":                          "SEKOLAH_KEBANGSAAN",
  "SMK":                         "SEKOLAH_MENENGAH_KEBANGSAAN",
  "SJKC":                        "SEKOLAH_JENIS_KEBANGSAAN_CINA",
  "SJKT":                        "SEKOLAH_JENIS_KEBANGSAAN_TAMIL",
  "SMKA":                        "SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA",
  "SM SABK":                     "SEKOLAH_MENENGAH_AGAMA_BANTUAN_KERAJAAN",
  "SR SABK":                     "SEKOLAH_RENDAH_AGAMA_BANTUAN_KERAJAAN",
  "SEK. MENENGAH AGAMA":         "SEKOLAH_MENENGAH_AGAMA",
  "SEK. RENDAH AGAMA":           "SEKOLAH_RENDAH_AGAMA",
  "SK TAHFIZ":                   "SEKOLAH_KEBANGSAAN_TAHFIZ",
  "SBP":                         "SEKOLAH_BERASRAMA_PENUH",
  "MRSM":                        "MAKTAB_RENDAH_SAINS_MARA",
  "KV":                          "KOLEJ_VOKASIONAL",
  "SMT":                         "SEKOLAH_MENENGAH_TEKNIK",
  "SK KHAS":                     "SEKOLAH_KEBANGSAAN_PENDIDIKAN_KHAS",
  "SM KHAS":                     "SEKOLAH_MENENGAH_PENDIDIKAN_KHAS",
  "SBJK":                        "SEKOLAH_BIMBINGAN_JALINAN_KASIH",
  "MODEL KHAS":                  "SEKOLAH_MODEL_KHAS",
  "SENI":                        "SEKOLAH_SENI_MALAYSIA",
  "SUKAN":                       "SEKOLAH_SUKAN_MALAYSIA",
  "KT6":                         "PUSAT_TINGKATAN_ENAM",
  "K9":                          "KOLEJ_TINGKATAN_ENAM",
  "SEK. ANTARABANGSA":           "SEKOLAH_ANTARABANGSA",
  "SEK. MEN. PERSENDIRIAN CINA": "SEKOLAH_MENENGAH_PERSENDIRIAN_CINA",
  "SEK. MENENGAH AKADEMIK":      "SEKOLAH_MENENGAH_AKADEMIK",
  "SEK. RENDAH AKADEMIK":        "SEKOLAH_RENDAH_AKADEMIK",
};

const STATE_CODE_MAP: Record<string, string> = {
  "JOHOR":                              "JHR",
  "KEDAH":                              "KDH",
  "KELANTAN":                           "KTN",
  "MELAKA":                             "MLK",
  "NEGERI SEMBILAN":                    "NSN",
  "PAHANG":                             "PHG",
  "PERAK":                              "PRK",
  "PERLIS":                             "PLS",
  "PULAU PINANG":                       "PNG",
  "SABAH":                              "SBH",
  "SARAWAK":                            "SWK",
  "SELANGOR":                           "SGR",
  "TERENGGANU":                         "TRG",
  "WILAYAH PERSEKUTUAN KUALA LUMPUR":   "WPK",
  "WILAYAH PERSEKUTUAN LABUAN":         "WPL",
  "WILAYAH PERSEKUTUAN PUTRAJAYA":      "WPP",
};

const LEVEL_MAP: Record<string, string> = {
  "SK":                          "PRIMARY",
  "SJKC":                        "PRIMARY",
  "SJKT":                        "PRIMARY",
  "SR SABK":                     "PRIMARY",
  "SEK. RENDAH AGAMA":           "PRIMARY",
  "SK KHAS":                     "PRIMARY",
  "SK TAHFIZ":                   "PRIMARY",
  "SEK. RENDAH AKADEMIK":        "PRIMARY",
  "SMK":                         "SECONDARY",
  "SMKA":                        "SECONDARY",
  "SM SABK":                     "SECONDARY",
  "SEK. MENENGAH AGAMA":         "SECONDARY",
  "SBP":                         "SECONDARY",
  "MRSM":                        "SECONDARY",
  "KV":                          "SECONDARY",
  "SMT":                         "SECONDARY",
  "SM KHAS":                     "SECONDARY",
  "SBJK":                        "SECONDARY",
  "MODEL KHAS":                  "SECONDARY",
  "SENI":                        "SECONDARY",
  "SUKAN":                       "SECONDARY",
  "KT6":                         "SECONDARY",
  "K9":                          "SECONDARY",
  "SEK. ANTARABANGSA":           "SECONDARY",
  "SEK. MEN. PERSENDIRIAN CINA": "SECONDARY",
  "SEK. MENENGAH AKADEMIK":      "SECONDARY",
};

async function main() {
  const conn = await mysql.createConnection({
    host:     "localhost",
    user:     "azham",
    password: "DBAzham231",
    database: "mtdb",
  });

  const [rows] = await conn.execute<SchoolRow[]>(`
    SELECT
      s.code,
      s.name,
      s.category,
      s.ppd      AS ppdCode,
      st.name    AS stateName
    FROM school s
    LEFT JOIN state st ON st.id = s.stateId
    WHERE s.category != 'AK'
    ORDER BY s.code
  `);

  await conn.end();

  let skipped = 0;
  const schools = [];

  for (const row of rows) {
    const category = CATEGORY_MAP[row.category];
    if (!category) {
      console.warn(`  ⚠ Unknown category '${row.category}' for ${row.code} — skipped`);
      skipped++;
      continue;
    }

    const stateCode = STATE_CODE_MAP[row.stateName?.toUpperCase()];
    if (!stateCode) {
      console.warn(`  ⚠ Unknown state '${row.stateName}' for ${row.code} — skipped`);
      skipped++;
      continue;
    }

    schools.push({
      code:          row.code,
      name:          row.name,
      category,
      categoryShort: row.category,
      level:         LEVEL_MAP[row.category] ?? "SECONDARY",
      ppdCode:       row.ppdCode ?? null,
      state:         { code: stateCode },
    });
  }

  const out = join(__dirname, "schools-export.json");
  writeFileSync(out, JSON.stringify(schools, null, 2));
  console.log(`✓ Exported ${schools.length} schools (${skipped} skipped — unmapped category)`);
  console.log(`  → ${out}`);
}

main().catch(console.error);
