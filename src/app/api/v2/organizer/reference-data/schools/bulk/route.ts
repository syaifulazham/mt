import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SchoolLevel, SchoolCategory } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const LEVEL_MAP: Record<string, SchoolLevel> = {
  PRIMARY:   "PRIMARY",
  SECONDARY: "SECONDARY",
  SPECIAL:   "SPECIAL",
  SR:        "PRIMARY",
  SM:        "SECONDARY",
};

const CATEGORY_MAP: Record<string, SchoolCategory> = {
  // New full identifiers
  SEKOLAH_KEBANGSAAN:                    "SEKOLAH_KEBANGSAAN",
  SEKOLAH_MENENGAH_KEBANGSAAN:           "SEKOLAH_MENENGAH_KEBANGSAAN",
  SEKOLAH_JENIS_KEBANGSAAN_CINA:         "SEKOLAH_JENIS_KEBANGSAAN_CINA",
  SEKOLAH_JENIS_KEBANGSAAN_TAMIL:        "SEKOLAH_JENIS_KEBANGSAAN_TAMIL",
  SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA:     "SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA",
  SEKOLAH_MENENGAH_AGAMA_BANTUAN_KERAJAAN: "SEKOLAH_MENENGAH_AGAMA_BANTUAN_KERAJAAN",
  SEKOLAH_RENDAH_AGAMA_BANTUAN_KERAJAAN: "SEKOLAH_RENDAH_AGAMA_BANTUAN_KERAJAAN",
  SEKOLAH_MENENGAH_AGAMA:                "SEKOLAH_MENENGAH_AGAMA",
  SEKOLAH_RENDAH_AGAMA:                  "SEKOLAH_RENDAH_AGAMA",
  SEKOLAH_KEBANGSAAN_TAHFIZ:             "SEKOLAH_KEBANGSAAN_TAHFIZ",
  SEKOLAH_BERASRAMA_PENUH:               "SEKOLAH_BERASRAMA_PENUH",
  MAKTAB_RENDAH_SAINS_MARA:              "MAKTAB_RENDAH_SAINS_MARA",
  KOLEJ_VOKASIONAL:                      "KOLEJ_VOKASIONAL",
  SEKOLAH_MENENGAH_TEKNIK:               "SEKOLAH_MENENGAH_TEKNIK",
  SEKOLAH_KEBANGSAAN_PENDIDIKAN_KHAS:    "SEKOLAH_KEBANGSAAN_PENDIDIKAN_KHAS",
  SEKOLAH_MENENGAH_PENDIDIKAN_KHAS:      "SEKOLAH_MENENGAH_PENDIDIKAN_KHAS",
  SEKOLAH_BIMBINGAN_JALINAN_KASIH:       "SEKOLAH_BIMBINGAN_JALINAN_KASIH",
  SEKOLAH_MODEL_KHAS:                    "SEKOLAH_MODEL_KHAS",
  SEKOLAH_SENI_MALAYSIA:                 "SEKOLAH_SENI_MALAYSIA",
  SEKOLAH_SUKAN_MALAYSIA:                "SEKOLAH_SUKAN_MALAYSIA",
  PUSAT_TINGKATAN_ENAM:                  "PUSAT_TINGKATAN_ENAM",
  KOLEJ_TINGKATAN_ENAM:                  "KOLEJ_TINGKATAN_ENAM",
  SEKOLAH_ANTARABANGSA:                  "SEKOLAH_ANTARABANGSA",
  SEKOLAH_MENENGAH_PERSENDIRIAN_CINA:    "SEKOLAH_MENENGAH_PERSENDIRIAN_CINA",
  SEKOLAH_MENENGAH_AKADEMIK:             "SEKOLAH_MENENGAH_AKADEMIK",
  SEKOLAH_RENDAH_AKADEMIK:               "SEKOLAH_RENDAH_AKADEMIK",
  // Legacy short-code aliases (backward compat for any existing callers)
  KEBANGSAAN:       "SEKOLAH_KEBANGSAAN",
  KEBANGSAAN_CINA:  "SEKOLAH_JENIS_KEBANGSAAN_CINA",
  KEBANGSAAN_TAMIL: "SEKOLAH_JENIS_KEBANGSAAN_TAMIL",
  AGAMA:            "SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA",
  TEKNIK:           "SEKOLAH_MENENGAH_TEKNIK",
  SPORT:            "SEKOLAH_SUKAN_MALAYSIA",
  PRIVATE:          "SEKOLAH_ANTARABANGSA",
  LAIN_LAIN:        "SEKOLAH_KEBANGSAAN",
};

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { rows } = await req.json() as { rows: Record<string, string>[] };
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: "NO_ROWS" }, { status: 400 });

  // Prefetch states for name→id lookup
  const states = await db.state.findMany({ select: { id: true, name: true, code: true } });
  const stateByName = Object.fromEntries(states.map((s) => [s.name.toUpperCase(), s.id]));
  const stateByCode = Object.fromEntries(states.map((s) => [s.code.toUpperCase(), s.id]));

  const created: string[] = [];
  const skipped: { code: string; reason: string }[] = [];

  for (const row of rows) {
    const code     = row.code?.trim().toUpperCase();
    const name     = row.name?.trim();
    const levelRaw = row.level?.trim().toUpperCase();
    const catRaw   = row.category?.trim().toUpperCase().replace(/ /g, "_");
    const stateRaw = row.state?.trim().toUpperCase();

    if (!code || !name || !levelRaw || !catRaw || !stateRaw) {
      skipped.push({ code: code ?? "(empty)", reason: "MISSING_FIELDS" });
      continue;
    }

    const level    = LEVEL_MAP[levelRaw];
    const category = CATEGORY_MAP[catRaw];
    const stateId  = stateByName[stateRaw] ?? stateByCode[stateRaw];

    if (!level)    { skipped.push({ code, reason: "INVALID_LEVEL" });    continue; }
    if (!category) { skipped.push({ code, reason: "INVALID_CATEGORY" }); continue; }
    if (!stateId)  { skipped.push({ code, reason: "UNKNOWN_STATE" });    continue; }

    try {
      await db.school.upsert({
        where:  { code },
        create: { code, name, level, category, stateId, ppdCode: row.ppdCode?.trim() || undefined },
        update: { name, level, category, stateId, ppdCode: row.ppdCode?.trim() || null },
      });
      created.push(code);
    } catch {
      skipped.push({ code, reason: "DB_ERROR" });
    }
  }

  return NextResponse.json({ created: created.length, skipped });
}
