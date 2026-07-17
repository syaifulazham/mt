import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * GET /api/v2/organizer/events/[id]/attendance/search?q=
 *
 * Returns contingents (with their teams) pre-registered to this event,
 * filtered by a wildcard search on contingent or team name.
 * Includes attendedAt per team for display.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // Find all teams registered to this event, joined to contingent + trainer count
  const teamEvents = await db.teamEvent.findMany({
    where: {
      eventId,
      acceptance: "ACCEPT",
      ...(q
        ? {
            OR: [
              { team: { name: { contains: q, mode: "insensitive" } } },
              { team: { contingent: { name: { contains: q, mode: "insensitive" } } } },
              { team: { contingent: { shortName: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      attendedAt: true,
      team: {
        select: {
          id: true,
          name: true,
          _count: { select: { members: true } },
          contingent: {
            select: {
              id: true,
              name: true,
              shortName: true,
              logoUrl: true,
              _count: { select: { trainers: true } },
            },
          },
        },
      },
    },
    orderBy: [{ team: { contingent: { name: "asc" } } }, { team: { name: "asc" } }],
    take: 200,
  });

  // Group by contingent
  type ContingentEntry = {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    trainers: number;
    attendedAt: string | null;
    teams: { teamEventId: string; id: string; name: string; members: number; attendedAt: string | null }[];
  };

  const map = new Map<string, ContingentEntry>();
  for (const te of teamEvents) {
    const c = te.team.contingent;
    if (!c) continue;
    if (!map.has(c.id)) {
      map.set(c.id, {
        id:         c.id,
        name:       c.name,
        shortName:  c.shortName,
        logoUrl:    c.logoUrl,
        trainers:   c._count.trainers,
        attendedAt: null,
        teams:      [],
      });
    }
    const entry = map.get(c.id)!;
    entry.teams.push({
      teamEventId: te.id,
      id:          te.team.id,
      name:        te.team.name,
      members:     te.team._count.members,
      attendedAt:  te.attendedAt?.toISOString() ?? null,
    });
    // Contingent is considered attended if ANY team is attended
    if (te.attendedAt && !entry.attendedAt) {
      entry.attendedAt = te.attendedAt.toISOString();
    }
  }

  return NextResponse.json({ contingents: [...map.values()] });
}
