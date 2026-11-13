import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findIsoCountry } from "@/lib/countries";
import { HOME_COUNTRY_ISO2, internationalClosed, requireInternationalAdmin } from "@/lib/international";

/**
 * POST { iso2 } — add a country (from the ISO list) to this event's list: the
 * countries row is reused (matched by either code) or created, then recorded
 * on the event so other events' lists stay separate.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId } = await params;
  const closed = await internationalClosed(eventId);
  if (closed) return closed;
  const addToEvent = async (countryId: string) => {
    const ev = await db.event.findUnique({ where: { id: eventId }, select: { internationalCountryIds: true } });
    if (ev && !ev.internationalCountryIds.includes(countryId))
      await db.event.update({ where: { id: eventId }, data: { internationalCountryIds: { push: countryId } } });
  };

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
    await addToEvent(existing.id);
    return NextResponse.json({ data: { id: existing.id, name: existing.name, codeIso2: existing.codeIso2 } });
  }

  const created = await db.country.create({
    data:   { name: iso.name, codeIso2: iso.codeIso2, codeIso3: iso.codeIso3 },
    select: { id: true, name: true, codeIso2: true },
  });
  await addToEvent(created.id);
  return NextResponse.json({ data: created }, { status: 201 });
}
