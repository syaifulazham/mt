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
  KEBANGSAAN:       "KEBANGSAAN",
  KEBANGSAAN_CINA:  "KEBANGSAAN_CINA",
  KEBANGSAAN_TAMIL: "KEBANGSAAN_TAMIL",
  AGAMA:            "AGAMA",
  TEKNIK:           "TEKNIK",
  SPORT:            "SPORT",
  PRIVATE:          "PRIVATE",
  LAIN_LAIN:        "LAIN_LAIN",
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
