import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createWalkInSubmission } from "@/lib/walkin-submission";

// POST /api/v2/borang/[slug]/submit — public walk-in form submission (no auth).
// TEAM competitions take { teamName, members: [{ ic, name }] }; INDIVIDUAL take
// { ic, name }. See src/lib/walkin-submission.ts.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  if (!body.competitionId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });

  const endpoint = await db.walkInFormEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { id: true, active: true, eventId: true, event: { select: { walkInUniqueParticipation: true } } },
  });
  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const r = await createWalkInSubmission({
    endpointId: endpoint.id,
    eventId: endpoint.eventId,
    uniqueParticipation: endpoint.event.walkInUniqueParticipation,
    walkInCompetitionId: String(body.competitionId),
    body,
  });
  return NextResponse.json(r.json, { status: r.status });
}
