import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const endpoint = await db.walkInEndpoint.findUnique({
    where: { routeSlug: slug },
    select: {
      id: true,
      active: true,
      label: true,
      walkInCompetitionId: true,
      event: {
        select: {
          id: true, name: true, slug: true, scope: true, stateId: true, zoneId: true,
          startDate: true, endDate: true, venue: true,
          walkInCompetitions: {
            select: {
              id: true, maxSlots: true,
              competition: {
                select: {
                  id: true, code: true, name: true,
                  participationType: true, minTeamSize: true, maxTeamSize: true,
                  targetGroups: {
                    include: { targetGroup: { select: { id: true, name: true, schoolLevel: true, minAge: true, maxAge: true, classGrades: true, ppki: true } } },
                  },
                },
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

  const isGeneral = endpoint.walkInCompetitionId === null;

  if (isGeneral) {
    // General endpoint — expose all walk-in competitions for the event
    return NextResponse.json({
      data: {
        isGeneral: true,
        endpointId: endpoint.id,
        label: endpoint.label,
        event: { ...endpoint.event, walkInCompetitions: undefined },
        walkInCompetitions: endpoint.event.walkInCompetitions,
      },
    });
  }

  // Competition-specific endpoint
  const specificWic = await db.eventWalkInCompetition.findUnique({
    where: { id: endpoint.walkInCompetitionId! },
    select: {
      id: true, maxSlots: true, publishToPortal: true,
      competition: {
        select: {
          id: true, code: true, name: true,
          participationType: true, minTeamSize: true, maxTeamSize: true,
          targetGroups: {
            include: { targetGroup: { select: { id: true, name: true, schoolLevel: true, minAge: true, maxAge: true, classGrades: true, ppki: true } } },
          },
        },
      },
      _count: { select: { registrations: true } },
    },
  });

  if (!specificWic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    data: {
      isGeneral: false,
      endpointId: endpoint.id,
      label: endpoint.label,
      id: specificWic.id,
      maxSlots: specificWic.maxSlots,
      publishToPortal: specificWic.publishToPortal,
      event: { ...endpoint.event, walkInCompetitions: undefined },
      competition: specificWic.competition,
      _count: specificWic._count,
    },
  });
}
