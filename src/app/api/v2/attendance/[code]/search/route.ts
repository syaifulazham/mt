import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/v2/attendance/[code]/search?q=&passcode=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const { searchParams } = req.nextUrl;
  const passcode = searchParams.get("passcode") ?? "";
  const q        = searchParams.get("q")?.trim() ?? "";

  const endpoint = await db.attendanceEndpoint.findUnique({
    where: { routeCode: code },
    select: { passcode: true, active: true, eventId: true },
  });

  if (!endpoint)          return NextResponse.json({ error: "NOT_FOUND" },        { status: 404 });
  if (!endpoint.active)   return NextResponse.json({ error: "ENDPOINT_RETIRED" }, { status: 410 });
  if (passcode !== endpoint.passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  const teamEvents = await db.teamEvent.findMany({
    where: {
      eventId: endpoint.eventId,
      acceptance: "ACCEPT",
      ...(q ? {
        OR: [
          { team: { name:      { contains: q, mode: "insensitive" } } },
          { team: { contingent: { name:      { contains: q, mode: "insensitive" } } } },
          { team: { contingent: { shortName:  { contains: q, mode: "insensitive" } } } },
        ],
      } : {}),
    },
    select: {
      id: true,
      attendedAt: true,
      team: {
        select: {
          id: true, name: true,
          _count: { select: { members: true } },
          contingent: {
            select: {
              id: true, name: true, shortName: true, logoUrl: true,
              _count: { select: { trainers: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { team: { contingent: { name: "asc" } } },
      { team: { name: "asc" } },
    ],
    take: 200,
  });

  type ContingentEntry = {
    id: string; name: string; shortName: string | null; logoUrl: string | null;
    trainers: number; attendedAt: string | null;
    teams: { teamEventId: string; id: string; name: string; members: number; attendedAt: string | null }[];
  };

  const map = new Map<string, ContingentEntry>();
  for (const te of teamEvents) {
    const c = te.team.contingent;
    if (!c) continue;
    if (!map.has(c.id)) {
      map.set(c.id, {
        id: c.id, name: c.name, shortName: c.shortName, logoUrl: c.logoUrl,
        trainers: c._count.trainers, attendedAt: null, teams: [],
      });
    }
    const entry = map.get(c.id)!;
    entry.teams.push({
      teamEventId: te.id, id: te.team.id, name: te.team.name,
      members: te.team._count.members, attendedAt: te.attendedAt?.toISOString() ?? null,
    });
    if (te.attendedAt && !entry.attendedAt)
      entry.attendedAt = te.attendedAt.toISOString();
  }

  return NextResponse.json({ contingents: [...map.values()] });
}
