import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isForeignCountry, requireInternationalAdmin } from "@/lib/international";

/**
 * POST { name, shortName?, countryId } — create a foreign school, stored as an
 * INTERNATIONAL contingent named after the school, with no Malaysian state.
 */
export async function POST(req: NextRequest) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const name      = typeof body?.name === "string" ? body.name.trim() : "";
  const shortName = typeof body?.shortName === "string" && body.shortName.trim() ? body.shortName.trim() : null;
  const countryId = typeof body?.countryId === "string" ? body.countryId : "";
  if (!name)      return NextResponse.json({ error: "MISSING_NAME" },    { status: 400 });
  if (!countryId) return NextResponse.json({ error: "MISSING_COUNTRY" }, { status: 400 });

  const country = await db.country.findUnique({ where: { id: countryId }, select: { codeIso2: true } });
  if (!isForeignCountry(country)) return NextResponse.json({ error: "NOT_A_FOREIGN_COUNTRY" }, { status: 400 });

  const contingent = await db.contingent.create({
    data:   { name, shortName, contingentType: "INTERNATIONAL", countryId },
    select: { id: true, name: true, shortName: true, countryId: true },
  });
  return NextResponse.json({ data: contingent }, { status: 201 });
}
