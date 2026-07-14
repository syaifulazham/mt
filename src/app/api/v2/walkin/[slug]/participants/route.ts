import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { filterByLocation, resolveEffectiveStateId } from "@/lib/eventEligibility";

function verifyPasscode(wic: { passcode: string | null }, provided: string | null): boolean {
  if (!wic.passcode || !provided) return false;
  return wic.passcode === provided;
}

// GET — search eligible participants for this walk-in competition
// Requires ?passcode= and ?q= (name or IC)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const passcode = searchParams.get("passcode");
  const q        = searchParams.get("q")?.trim() ?? "";

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { routeSlug: slug },
    select: {
      id: true,
      passcode: true,
      endpointActive: true,
      competitionId: true,
      event: { select: { id: true, scope: true, stateId: true, zoneId: true } },
      competition: {
        select: {
          targetGroups: {
            include: { targetGroup: true },
          },
        },
      },
    },
  });

  if (!wic || !wic.endpointActive)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!verifyPasscode(wic, passcode))
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });
  if (!q || q.length < 2)
    return NextResponse.json({ data: [] });

  // Find participants matching the query across all contingents
  const participants = await db.participant.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { ic: { contains: q } },
      ],
    },
    take: 30,
    select: {
      id: true, name: true, ic: true, gender: true,
      age: true, eduLevel: true, classGrade: true, ppki: true,
      contingentId: true,
      contingent: {
        select: {
          id: true, name: true, shortName: true, contingentType: true,
          stateId: true,
          school: { select: { stateId: true } },
        },
      },
    },
  });

  // Check location eligibility per participant's contingent
  const targetGroups = wic.competition.targetGroups.map(ctg => ctg.targetGroup);
  const eventInfo = wic.event;

  const eligible = [];
  for (const p of participants) {
    // Location check
    const effectiveStateId = resolveEffectiveStateId(p.contingent);
    const [passes] = await filterByLocation([eventInfo], effectiveStateId);
    if (!passes) continue;

    // Target group check
    const matchesGroup = targetGroups.length === 0 || targetGroups.some(tg => {
      if (tg.schoolLevel.toUpperCase() !== p.eduLevel) return false;
      if (tg.ppki && !p.ppki) return false;
      if (tg.classGrades.length > 0) return p.classGrade ? tg.classGrades.includes(p.classGrade) : false;
      if (tg.minAge > 0 || tg.maxAge > 0) {
        if (p.age == null) return false;
        if (tg.minAge > 0 && p.age < tg.minAge) return false;
        if (tg.maxAge > 0 && p.age > tg.maxAge) return false;
      }
      return true;
    });
    if (!matchesGroup) continue;

    // Check if already registered
    const alreadyRegistered = await db.walkInRegistration.findUnique({
      where: { walkInCompetitionId_participantId: { walkInCompetitionId: wic.id, participantId: p.id } },
    });

    eligible.push({
      id: p.id, name: p.name,
      ic: p.ic ? `****${p.ic.slice(-4)}` : null,
      gender: p.gender, age: p.age, eduLevel: p.eduLevel, classGrade: p.classGrade,
      contingentId: p.contingentId,
      contingentName: p.contingent.shortName ?? p.contingent.name,
      alreadyRegistered: !!alreadyRegistered,
      registrationStatus: alreadyRegistered?.status ?? null,
    });
  }

  return NextResponse.json({ data: eligible });
}
