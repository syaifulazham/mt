import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  checkTeamPeople, loadEventCompetitions, loadForeignContingent, requireInternationalAdmin,
} from "@/lib/international";

type Params = { params: Promise<{ id: string; cid: string; tid: string }> };

function ids(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
}

async function loadTeam(cid: string, tid: string) {
  const found = await loadForeignContingent(cid);
  if (found.error) return { error: found.error } as const;
  const team = await db.team.findUnique({
    where:  { id: tid },
    select: {
      id: true, contingentId: true, competitionId: true,
      teamEvents: { select: { eventId: true, selected: true } },
      _count:     { select: { judgingScores: true } },
    },
  });
  if (!team || team.contingentId !== cid)
    return { error: NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 }) } as const;
  // Same rule as the manager portal: once an organizer has selected the
  // team for an event, its line-up is frozen.
  if (team.teamEvents.some((te) => te.selected))
    return { error: NextResponse.json({ error: "TEAM_LOCKED" }, { status: 400 }) } as const;
  return { team } as const;
}

/** PATCH { name?, memberIds, trainerIds } — replace the team's name, members and trainers. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId, cid, tid } = await params;

  const found = await loadTeam(cid, tid);
  if ("error" in found) return found.error;
  const { team } = found;

  const competitions = await loadEventCompetitions(eventId);
  const competition = competitions?.get(team.competitionId);
  if (!competition) return NextResponse.json({ error: "COMPETITION_NOT_IN_EVENT" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const memberIds  = ids(body?.memberIds);
  const trainerIds = ids(body?.trainerIds);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (competition.participationType !== "INDIVIDUAL" && !name)
    return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  const problem = await checkTeamPeople({ contingentId: cid, competition, memberIds, trainerIds, eventId, exceptTeamId: tid });
  if (problem) return NextResponse.json(problem, { status: 400 });
  const enrolled = team.teamEvents.some((te) => te.eventId === eventId);
  if (enrolled && competition.participationType !== "INDIVIDUAL" && memberIds.length < competition.minTeamSize)
    return NextResponse.json({ error: "TEAM_TOO_SMALL" }, { status: 400 });

  await db.$transaction([
    ...(name ? [db.team.update({ where: { id: tid }, data: { name } })] : []),
    db.teamMember.deleteMany({ where: { teamId: tid, participantId: { notIn: memberIds } } }),
    db.teamMember.createMany({ data: memberIds.map((participantId) => ({ teamId: tid, participantId })), skipDuplicates: true }),
    db.teamTrainer.deleteMany({ where: { teamId: tid, trainerId: { notIn: trainerIds } } }),
    db.teamTrainer.createMany({ data: trainerIds.map((trainerId) => ({ teamId: tid, trainerId })), skipDuplicates: true }),
  ]);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE — remove a team that is in no other event and has no judging scores
 * (deleting would cascade into those).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId, cid, tid } = await params;

  const found = await loadTeam(cid, tid);
  if ("error" in found) return found.error;
  const { team } = found;

  if (team.teamEvents.some((te) => te.eventId !== eventId))
    return NextResponse.json({ error: "TEAM_IN_OTHER_EVENT" }, { status: 400 });
  if (team._count.judgingScores > 0)
    return NextResponse.json({ error: "TEAM_HAS_SCORES" }, { status: 400 });

  await db.team.delete({ where: { id: tid } });
  return NextResponse.json({ ok: true });
}
