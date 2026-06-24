import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// Common short-form aliases that Gemini returns vs. full names stored in the DB
const STATE_ALIASES: Record<string, string> = {
  "KUALA LUMPUR":            "WILAYAH PERSEKUTUAN KUALA LUMPUR",
  "WP KUALA LUMPUR":         "WILAYAH PERSEKUTUAN KUALA LUMPUR",
  "WPKL":                    "WILAYAH PERSEKUTUAN KUALA LUMPUR",
  "FEDERAL TERRITORY OF KUALA LUMPUR": "WILAYAH PERSEKUTUAN KUALA LUMPUR",
  "LABUAN":                  "WILAYAH PERSEKUTUAN LABUAN",
  "WP LABUAN":               "WILAYAH PERSEKUTUAN LABUAN",
  "PUTRAJAYA":               "WILAYAH PERSEKUTUAN PUTRAJAYA",
  "WP PUTRAJAYA":            "WILAYAH PERSEKUTUAN PUTRAJAYA",
  "PENANG":                  "PULAU PINANG",
  "GEORGE TOWN":             "PULAU PINANG",
};

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { rows } = await req.json() as { rows: Record<string, string>[] };
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: "NO_ROWS" }, { status: 400 });

  const states = await db.state.findMany({ select: { id: true, name: true, code: true } });
  const stateByName = Object.fromEntries(states.map((s) => [s.name.toUpperCase(), s.id]));
  const stateByCode = Object.fromEntries(states.map((s) => [s.code.toUpperCase(), s.id]));

  const created: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const row of rows) {
    const name       = row.name?.trim();
    const code       = row.code?.trim().toUpperCase() || undefined;
    const stateRaw   = row.state?.trim().toUpperCase();
    const stateResolved = stateRaw ? (STATE_ALIASES[stateRaw] ?? stateRaw) : undefined;
    const stateId    = stateResolved ? (stateByName[stateResolved] ?? stateByCode[stateResolved]) : undefined;
    const heiType    = row.type === "BRANCH" ? "BRANCH" : "HQ";
    const parentCode = row.parentCode?.trim().toUpperCase() || undefined;
    const sector     = row.sector ?? undefined;

    if (!name) { skipped.push({ name: "(empty)", reason: "MISSING_NAME" }); continue; }
    if (stateRaw && !stateId) { skipped.push({ name, reason: "UNKNOWN_STATE" }); continue; }

    try {
      if (code) {
        await db.higherInstitution.upsert({
          where:  { code },
          create: { name, code, stateId, heiType, parentCode, sector },
          update: { name, stateId, heiType, parentCode, sector },
        });
      } else {
        await db.higherInstitution.create({ data: { name, stateId, heiType, sector } });
      }
      created.push(name);
    } catch {
      skipped.push({ name, reason: "DB_ERROR" });
    }
  }

  return NextResponse.json({ created: created.length, skipped });
}
