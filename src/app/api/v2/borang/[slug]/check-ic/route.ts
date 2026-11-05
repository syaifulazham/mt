import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registrationHasIc, submissionHasIc } from "@/lib/walkin-team";

// GET /api/v2/borang/[slug]/check-ic?ic=... — check which competitions an IC has already submitted for
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ic = req.nextUrl.searchParams.get("ic")?.replace(/[\s-]/g, "") ?? "";
  if (!ic || !/^\d{6,12}$/.test(ic))
    return NextResponse.json({ error: "INVALID_IC" }, { status: 400 });

  const endpoint = await db.walkInFormEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { active: true, eventId: true },
  });
  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Find all active submissions for this IC in this event
  const subs = await db.walkInFormSubmission.findMany({
    where: {
      ...submissionHasIc(ic),
      status: { in: ["PENDING", "PROCESSED"] },
      walkInCompetition: { eventId: endpoint.eventId },
    },
    select: { walkInCompetitionId: true },
  });

  // Also find registrations held by this IC (directly or through a registered team)
  const regs = await db.walkInRegistration.findMany({
    where: {
      ...registrationHasIc(ic),
      status: { in: ["PENDING", "CONFIRMED"] },
      walkInCompetition: { eventId: endpoint.eventId },
    },
    select: { walkInCompetitionId: true },
  });

  const usedCompetitionIds = [...new Set([
    ...subs.map(s => s.walkInCompetitionId),
    ...regs.map(r => r.walkInCompetitionId),
  ])];

  return NextResponse.json({ usedCompetitionIds });
}
