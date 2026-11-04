import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  computeCompetitionResults, internationalRankings, internationalReleased, releasedRankings,
} from "@/lib/resultsRankings";
import { INTERNATIONAL_SCOPE_ID } from "@/lib/countries";

// POST /api/results/[slug]
//
// Public results board. A competition's rankings are released once a Super
// Admin VERIFIED its judging — nationally (`verified`, all rankings), or per
// state (`verifiedStateIds`, only those states' teams, ranked within their
// state). Nothing unreleased leaves the server, so an open or unverified
// result can't be read off the network.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: { passcode?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  // 1. Find the endpoint
  const endpoint = await db.resultsEndpoint.findUnique({
    where: { routeSlug: slug },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          scope: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  if (!endpoint) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // 2. Check status
  if (endpoint.status === "CLOSED") {
    return NextResponse.json({ error: "ENDPOINT_CLOSED" }, { status: 403 });
  }

  // 3. Check passcode
  if (endpoint.passcode) {
    if (!body.passcode) {
      return NextResponse.json({ error: "PASSCODE_REQUIRED" }, { status: 401 });
    }
    if (endpoint.passcode !== body.passcode) {
      return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 401 });
    }
  }

  // 4. Competitions of this endpoint (all of the event's when none are picked)
  const results = await computeCompetitionResults(
    endpoint.eventId,
    endpoint.isWalkIn,
    endpoint.competitionIds.length > 0 ? endpoint.competitionIds : null,
  );
  const competitions = results.map((r) => {
    const { judgingStatus, judgingVerifiedAt, rankings: _all, foreignRankings: _foreign, ...c } = r;
    void _all; void _foreign;
    const verified = judgingStatus === "VERIFIED";
    return {
      ...c,
      verified,
      verifiedAt: verified ? judgingVerifiedAt : null,
      // States only: the Antarabangsa scope is reported on its own below.
      verifiedStateIds: r.verifiedStateIds.filter(id => id !== INTERNATIONAL_SCOPE_ID),
      rankings: releasedRankings(r),
      // Antara Bangsa: top 2 of each country (Malaysia included) ranked together.
      // Malaysia's teams join with Kebangsaan's verify; the foreign teams with
      // the Antarabangsa scope's verify.
      hasInternational: r.foreignRankings.length > 0,
      internationalReleased: internationalReleased(r),
      internationalRankings: internationalRankings(r),
    };
  });

  return NextResponse.json({
    endpoint: {
      id: endpoint.id,
      label: endpoint.label,
      status: endpoint.status,
      isWalkIn: endpoint.isWalkIn,
    },
    event: {
      id: endpoint.event.id,
      name: endpoint.event.name,
      scope: endpoint.event.scope,
      startDate: endpoint.event.startDate,
      endDate: endpoint.event.endDate,
    },
    competitions,
  });
}
