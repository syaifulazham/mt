import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const ONLINE_SCOPES = ["ONLINE_NATIONAL", "ONLINE_STATE", "ONLINE_ZONE", "ONLINE_OPEN"];

// POST /api/judging/[slug]  body: { passcode }
// Returns event+competition+template info and team list if passcode correct
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode } = await req.json().catch(() => ({}));
  if (!passcode) return NextResponse.json({ error: "MISSING_PASSCODE" }, { status: 400 });

  const task = await db.judgingTask.findUnique({
    where: { routeSlug: slug },
    include: {
      judgingTemplate: {
        include: {
          criterions: { include: { options: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
        },
      },
      eventCompetition: {
        include: {
          event: { select: { id: true, name: true, slug: true, scope: true } },
          competition: { select: { id: true, name: true, code: true, participationType: true } },
        },
      },
      scores: true,
    },
  });

  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (task.status === "CLOSED") return NextResponse.json({ error: "TASK_CLOSED" }, { status: 403 });
  if (task.passcode !== passcode.trim().toUpperCase()) return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });

  const { eventCompetition: ec } = task;
  const isOnline = ONLINE_SCOPES.includes(ec.event.scope);

  // Fetch teams: for online events use preregistration (team_events JOIN),
  // for physical events same query (attendance not built yet)
  const teams = await db.team.findMany({
    where: {
      competitionId: ec.competition.id,
      status: "ACTIVE",
      teamEvents: { some: { eventId: ec.event.id } },
    },
    include: {
      contingent:  { select: { name: true, contingentType: true, state: { select: { name: true } } } },
      members: {
        include: { participant: { select: { name: true, gender: true, eduLevel: true, age: true, classGrade: true, className: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    task: {
      id: task.id,
      label: task.label,
      status: task.status,
      routeSlug: task.routeSlug,
    },
    event: ec.event,
    competition: ec.competition,
    template: {
      id: task.judgingTemplate.id,
      name: task.judgingTemplate.name,
      code: task.judgingTemplate.code,
      description: task.judgingTemplate.description,
      criterions: task.judgingTemplate.criterions.map(c => ({
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
    scores: task.scores,
    isOnline,
    teams: teams.map(t => ({
      id: t.id,
      name: t.name,
      contingent: t.contingent.name,
      contingentType: t.contingent.contingentType,
      stateName: t.contingent.state?.name ?? null,
      memberCount: t.members.length,
      members: t.members.map(m => ({
        name: m.participant.name,
        gender: m.participant.gender,
        eduLevel: m.participant.eduLevel,
        age: m.participant.age,
        classGrade: m.participant.classGrade,
        className: m.participant.className,
      })),
    })),
  });
}
