import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/v2/borang/[slug] — public form endpoint info (no auth)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const endpoint = await db.walkInFormEndpoint.findUnique({
    where: { routeSlug: slug },
    select: {
      id: true, label: true, active: true,
      event: {
        select: {
          id: true, name: true, slug: true, venue: true,
          startDate: true, endDate: true,
          walkInUniqueParticipation: true,
          walkInCompetitions: {
            select: {
              id: true, maxSlots: true, walkInSlotSchedule: true,
              competition: {
                select: { id: true, code: true, name: true, participationType: true },
              },
              _count: { select: { registrations: true } },
            },
          },
        },
      },
    },
  });

  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    data: {
      endpointId: endpoint.id,
      label: endpoint.label,
      uniqueParticipation: endpoint.event.walkInUniqueParticipation,
      event: { ...endpoint.event, walkInCompetitions: undefined, walkInUniqueParticipation: undefined },
      competitions: endpoint.event.walkInCompetitions,
    },
  });
}
