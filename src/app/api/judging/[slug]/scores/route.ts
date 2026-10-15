import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contingentStateId, taskLockMap, teamLocked } from "@/lib/judgingStatus";

// POST /api/judging/[slug]/scores
// Body: { passcode, teamId, criterionId, score?, timeSeconds?, optionIds? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const { passcode, teamId, criterionId, score, timeSeconds, optionIds } = body as {
    passcode: string;
    teamId: string;
    criterionId: string;
    score?: number | null;
    timeSeconds?: number | null;
    optionIds?: string[];
  };

  if (!passcode || !teamId || !criterionId)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const task = await db.judgingTask.findUnique({
    where: { routeSlug: slug },
    include: { eventCompetition: { select: { id: true, judgingStatus: true } } },
  });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (task.status === "CLOSED") return NextResponse.json({ error: "TASK_CLOSED" }, { status: 403 });
  if (task.passcode !== passcode.trim().toUpperCase())
    return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });

  // Locked nationally (task or competition) or for the team's state: no new or changed scores.
  const team = await db.team.findUnique({
    where:  { id: teamId },
    select: { contingent: { select: { stateId: true, school: { select: { stateId: true } }, higherInstitution: { select: { stateId: true } } } } },
  });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  const locks = await taskLockMap("event", task, task.eventCompetition.id, task.eventCompetition.judgingStatus);
  const lock = teamLocked(locks, contingentStateId(team.contingent));
  if (lock.locked)
    return NextResponse.json({ error: "JUDGING_LOCKED", message: lock.message, judging: locks.national, locks }, { status: 423 });

  const saved = await db.judgingScore.upsert({
    where: { judgingTaskId_teamId_criterionId: { judgingTaskId: task.id, teamId, criterionId } },
    create: {
      judgingTaskId: task.id,
      teamId,
      criterionId,
      score: score ?? null,
      timeSeconds: timeSeconds ?? null,
      optionIds: optionIds ?? [],
    },
    update: {
      score: score ?? null,
      timeSeconds: timeSeconds ?? null,
      optionIds: optionIds ?? [],
    },
  });

  return NextResponse.json(saved);
}
