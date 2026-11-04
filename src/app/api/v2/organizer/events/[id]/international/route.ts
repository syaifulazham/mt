import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { HOME_COUNTRY_ISO2, requireInternationalAdmin } from "@/lib/international";

/**
 * GET — Foreign countries and their schools (INTERNATIONAL contingents) for the
 * international registration page, with per-school counts and how many of the
 * school's teams are entered in this event.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId } = await params;

  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const [countries, contingents] = await Promise.all([
    db.country.findMany({
      where:   { codeIso2: { not: HOME_COUNTRY_ISO2 } },
      select:  { id: true, name: true, codeIso2: true },
      orderBy: { name: "asc" },
    }),
    db.contingent.findMany({
      where: {
        contingentType: "INTERNATIONAL",
        country:        { codeIso2: { not: HOME_COUNTRY_ISO2 } },
      },
      select: {
        id: true, name: true, shortName: true, countryId: true,
        _count: { select: { participants: true, trainers: true, teams: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const enrolled = await db.teamEvent.findMany({
    where:  { eventId, team: { contingentId: { in: contingents.map((c) => c.id) } } },
    select: { team: { select: { contingentId: true } } },
  });
  const enrolledByContingent = new Map<string, number>();
  for (const { team } of enrolled)
    enrolledByContingent.set(team.contingentId, (enrolledByContingent.get(team.contingentId) ?? 0) + 1);

  return NextResponse.json({
    data: {
      countries,
      contingents: contingents.map((c) => ({
        id: c.id, name: c.name, shortName: c.shortName, countryId: c.countryId,
        participants: c._count.participants,
        trainers:     c._count.trainers,
        teams:        c._count.teams,
        enrolled:     enrolledByContingent.get(c.id) ?? 0,
      })),
    },
  });
}
