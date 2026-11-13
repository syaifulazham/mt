import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { internationalClosed, isForeignCountry, requireInternationalAdmin } from "@/lib/international";
import { currentInternationalLink } from "@/lib/international-link";

/**
 * POST { name, shortName?, countryId } — create a foreign school for this event,
 * stored as an INTERNATIONAL contingent named after the school, with no
 * Malaysian state, tied to the event (internationalEventId).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId } = await params;
  const closed = await internationalClosed(eventId);
  if (closed) return closed;

  const body = await req.json().catch(() => null);
  const name      = typeof body?.name === "string" ? body.name.trim() : "";
  const shortName = typeof body?.shortName === "string" && body.shortName.trim() ? body.shortName.trim() : null;
  const countryId = typeof body?.countryId === "string" ? body.countryId : "";
  if (!name)      return NextResponse.json({ error: "MISSING_NAME" },    { status: 400 });
  if (!countryId) return NextResponse.json({ error: "MISSING_COUNTRY" }, { status: 400 });

  const country = await db.country.findUnique({ where: { id: countryId }, select: { codeIso2: true } });
  if (!isForeignCountry(country)) return NextResponse.json({ error: "NOT_A_FOREIGN_COUNTRY" }, { status: 400 });

  const contingent = await db.contingent.create({
    // The school belongs to this event: only its international page lists it.
    data:   { name, shortName, contingentType: "INTERNATIONAL", countryId, internationalEventId: eventId },
    select: { id: true, name: true, shortName: true, countryId: true },
  });
  // Created through a registration link: remembered, so an OWN-scoped link can reach it.
  const link = currentInternationalLink();
  if (link) {
    await db.internationalLink.update({ where: { id: link.linkId }, data: { contingentIds: { push: contingent.id } } });
    link.contingentIds.push(contingent.id);
  }
  return NextResponse.json({ data: contingent }, { status: 201 });
}
