import { NextRequest, NextResponse } from "next/server";
import { roundTime, timeScore } from "@/lib/judgingTime";
import { db } from "@/lib/db";
import { activeMerges, hiddenMembers } from "@/lib/team-merge-server";
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
  // Fractions of a second are kept to the millisecond (TIME criteria with 1/100 s or ms precision).
  const time = typeof timeSeconds === "number" && Number.isFinite(timeSeconds) && timeSeconds > 0 ? roundTime(timeSeconds) : null;

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

  // A team merged into a state team is judged under the merge's lead.
  if (hiddenMembers(await activeMerges(task.eventCompetition.id)).has(teamId))
    return NextResponse.json({ error: "TEAM_MERGED", message: "Pasukan ini bertanding dalam gabungan negeri — nilai pasukan gabungan." }, { status: 409 });

  // Locked nationally (task or competition) or for the team's state: no new or changed scores.
  const team = await db.team.findUnique({
    where:  { id: teamId },
    select: { contingent: { select: { stateId: true, school: { select: { stateId: true } }, higherInstitution: { select: { stateId: true } }, country: { select: { codeIso2: true } } } } },
  });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  const locks = await taskLockMap("event", task, task.eventCompetition.id, task.eventCompetition.judgingStatus);
  const lock = teamLocked(locks, contingentStateId(team.contingent));
  if (lock.locked)
    return NextResponse.json({ error: "JUDGING_LOCKED", message: lock.message, judging: locks.national, locks }, { status: 423 });

  // TIME: the points come from the time (maxScore at 0 s down to 0 at maxTime), never from the client.
  const criterion = await db.judgingCriterion.findUnique({ where: { id: criterionId }, select: { type: true, maxScore: true, maxTime: true } });
  if (!criterion) return NextResponse.json({ error: "CRITERION_NOT_FOUND" }, { status: 404 });
  const points = criterion.type === "TIME" ? timeScore(criterion, time) : score ?? null;

  const saved = await db.judgingScore.upsert({
    where: { judgingTaskId_teamId_criterionId: { judgingTaskId: task.id, teamId, criterionId } },
    create: {
      judgingTaskId: task.id,
      teamId,
      criterionId,
      score: points,
      timeSeconds: time,
      optionIds: optionIds ?? [],
    },
    update: {
      score: points,
      timeSeconds: time,
      optionIds: optionIds ?? [],
    },
  });

  return NextResponse.json(saved);
}
