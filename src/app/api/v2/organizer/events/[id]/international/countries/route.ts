import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findIsoCountry } from "@/lib/countries";
import { HOME_COUNTRY_ISO2, requireInternationalAdmin } from "@/lib/international";

/** POST { iso2 } — add a country (from the ISO list) to the countries table, or return the existing row. */
export async function POST(req: NextRequest) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const iso = findIsoCountry(String(body?.iso2 ?? ""));
  if (!iso) return NextResponse.json({ error: "UNKNOWN_COUNTRY" }, { status: 400 });
  if (iso.codeIso2 === HOME_COUNTRY_ISO2)
    return NextResponse.json({ error: "HOME_COUNTRY" }, { status: 400 });

  // Matched by either code, so a row someone entered by hand is reused, never duplicated.
  const existing = await db.country.findFirst({
    where:  { OR: [{ codeIso2: iso.codeIso2 }, { codeIso3: iso.codeIso3 }] },
    select: { id: true, name: true, codeIso2: true, isActive: true },
  });
  if (existing) {
    if (!existing.isActive) await db.country.update({ where: { id: existing.id }, data: { isActive: true } });
    return NextResponse.json({ data: { id: existing.id, name: existing.name, codeIso2: existing.codeIso2 } });
  }

  const created = await db.country.create({
    data:   { name: iso.name, codeIso2: iso.codeIso2, codeIso3: iso.codeIso3 },
    select: { id: true, name: true, codeIso2: true },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
