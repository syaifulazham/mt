import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const passcode     = searchParams.get("passcode");
  const q            = searchParams.get("q")?.trim() ?? "";
  const competitionId = searchParams.get("competitionId"); // required for general endpoints

  const endpoint = await db.walkInEndpoint.findUnique({
    where: { routeSlug: slug },
    select: {
      id: true, passcode: true, active: true,
      walkInCompetitionId: true,
      event: { select: { id: true } },
    },
  });

  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.passcode || endpoint.passcode !== passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });
  if (!q || q.length < 2)
    return NextResponse.json({ data: [] });

  // Resolve which WIC to check eligibility against
  const wicId = endpoint.walkInCompetitionId ?? null;
  let wic: { id: string; competition: { targetGroups: { targetGroup: { schoolLevel: string; ppki: boolean; classGrades: string[]; minAge: number; maxAge: number } }[] } } | null = null;

  if (wicId) {
    wic = await db.eventWalkInCompetition.findUnique({
      where: { id: wicId },
      select: { id: true, competition: { select: { targetGroups: { include: { targetGroup: true } } } } },
    });
  } else if (competitionId) {
    // General endpoint: competitionId is the EventWalkInCompetition.id
    wic = await db.eventWalkInCompetition.findUnique({
      where: { id: competitionId, eventId: endpoint.event.id },
      select: { id: true, competition: { select: { targetGroups: { include: { targetGroup: true } } } } },
    });
  }

  const targetGroups = wic?.competition.targetGroups.map(ctg => ctg.targetGroup) ?? [];
  const resolvedWicId = wic?.id ?? null;

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
        select: { id: true, name: true, shortName: true },
      },
    },
  });

  const eligible = [];
  for (const p of participants) {

    if (targetGroups.length > 0) {
      const matchesGroup = targetGroups.some(tg => {
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
    }

    let alreadyRegistered = null;
    if (resolvedWicId) {
      alreadyRegistered = await db.walkInRegistration.findUnique({
        where: { walkInCompetitionId_participantId: { walkInCompetitionId: resolvedWicId, participantId: p.id } },
        select: { id: true, status: true },
      });
    }

    eligible.push({
      id: p.id, name: p.name,
      ic: p.ic ? `****${p.ic.slice(-4)}` : null,
      gender: p.gender, age: p.age, eduLevel: p.eduLevel, classGrade: p.classGrade,
      contingentId: p.contingentId,
      contingentName: p.contingent.shortName ?? p.contingent.name,
      alreadyRegistered:  !!alreadyRegistered,
      registrationStatus: alreadyRegistered?.status ?? null,
      registrationId:     alreadyRegistered?.id     ?? null,
    });
  }

  // Pending public-form submissions matching the search (for verification at the counter)
  const submissions = await db.walkInFormSubmission.findMany({
    where: {
      endpoint: { eventId: endpoint.event.id, active: true },
      status: "PENDING",
      OR: [
        { ic: { contains: q.replace(/[\s-]/g, "") } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 10,
    select: {
      id: true, ic: true, name: true, schoolName: true,
      sessionNumber: true, slotNumber: true,
      walkInCompetitionId: true,
      walkInCompetition: { select: { competition: { select: { code: true, name: true } } } },
    },
  });

  return NextResponse.json({ data: eligible, submissions });
}
