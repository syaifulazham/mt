import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/walkin-judging/[slug]  body: { passcode }
// Returns endpoint + event + competition + template info and confirmed walk-in participants
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode } = await req.json().catch(() => ({}));
  if (!passcode) return NextResponse.json({ error: "MISSING_PASSCODE" }, { status: 400 });

  const endpoint = await db.walkInJudgingEndpoint.findUnique({
    where: { routeSlug: slug },
    include: {
      judgingTemplate: {
        include: {
          criterions: { include: { options: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
        },
      },
      walkInCompetition: {
        include: {
          competition: { select: { id: true, name: true, code: true, participationType: true } },
          event:       { select: { id: true, name: true, slug: true, scope: true } },
        },
      },
      scores: true,
    },
  });

  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (endpoint.status === "CLOSED") return NextResponse.json({ error: "TASK_CLOSED" }, { status: 403 });
  if (endpoint.passcode !== passcode.trim().toUpperCase()) return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });

  const { walkInCompetition: wic } = endpoint;

  // Confirmed walk-in registrations are the judgeable participants
  const registrations = await db.walkInRegistration.findMany({
    where: { walkInCompetitionId: wic.id, status: "CONFIRMED" },
    include: {
      participant: { select: { id: true, name: true, gender: true, eduLevel: true, age: true, classGrade: true, className: true } },
      contingent:  { select: { id: true, name: true, shortName: true, contingentType: true } },
    },
    orderBy: { confirmedAt: "asc" },
  });

  return NextResponse.json({
    task: {
      id: endpoint.id,
      label: endpoint.label,
      status: endpoint.status,
      routeSlug: endpoint.routeSlug,
    },
    event: wic.event,
    competition: wic.competition,
    template: {
      id: endpoint.judgingTemplate.id,
      name: endpoint.judgingTemplate.name,
      code: endpoint.judgingTemplate.code,
      description: endpoint.judgingTemplate.description,
      criterions: endpoint.judgingTemplate.criterions.map(c => ({
        id: c.id,
        name: c.name,
        order: c.order,
        type: c.type,
        maxScore: c.maxScore,
        minScore: c.minScore,
        maxTime: c.maxTime,
        options: c.options.map(o => ({ id: o.id, label: o.label, weight: o.weight, order: o.order })),
      })),
    },
    scores: endpoint.scores,
    participants: registrations.map(r => ({
      id: r.id,
      participantId: r.participant.id,
      name: r.participant.name,
      gender: r.participant.gender,
      eduLevel: r.participant.eduLevel,
      age: r.participant.age,
      classGrade: r.participant.classGrade,
      className: r.participant.className,
      contingent: r.contingent.name,
      contingentShortName: r.contingent.shortName,
      contingentType: r.contingent.contingentType,
    })),
  });
}
