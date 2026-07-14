import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET — public: get event + competition info for a counter endpoint slug
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { routeSlug: slug },
    select: {
      id: true,
      endpointActive: true,
      maxSlots: true,
      publishToPortal: true,
      event: { select: { id: true, name: true, slug: true, scope: true, stateId: true, zoneId: true, startDate: true, endDate: true, venue: true } },
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

  if (!wic || !wic.endpointActive)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Never expose passcode in GET
  return NextResponse.json({ data: wic });
}
