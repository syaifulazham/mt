import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  checkTeamPeople, loadEventCompetitions, loadForeignContingent, requireInternationalAdmin,
} from "@/lib/international";

type Params = { params: Promise<{ id: string; cid: string; tid: string }> };

async function loadTeam(cid: string, tid: string) {
  const found = await loadForeignContingent(cid);
  if (found.error) return { error: found.error } as const;
  const team = await db.team.findUnique({
    where:  { id: tid },
    select: {
      id: true, contingentId: true, competitionId: true,
      members:  { select: { participantId: true } },
      trainers: { select: { trainerId: true } },
    },
  });
  if (!team || team.contingentId !== cid)
    return { error: NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 }) } as const;
  return { team } as const;
}

/**
 * POST — enter the team into this event (TeamEvent, acceptance PENDING). It
 * then appears in Pra-Pendaftaran, where it is accepted like any other team.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId, cid, tid } = await params;

  const found = await loadTeam(cid, tid);
  if ("error" in found) return found.error;
  const { team } = found;

  const competitions = await loadEventCompetitions(eventId);
  const competition = competitions?.get(team.competitionId);
  if (!competition) return NextResponse.json({ error: "COMPETITION_NOT_IN_EVENT" }, { status: 400 });

  const problem = await checkTeamPeople({
    contingentId: cid, competition, eventId, exceptTeamId: tid,
    memberIds:  team.members.map((m) => m.participantId),
    trainerIds: team.trainers.map((t) => t.trainerId),
  });
  if (problem) return NextResponse.json(problem, { status: 400 });
  if (competition.participationType !== "INDIVIDUAL" && team.members.length < competition.minTeamSize)
    return NextResponse.json({ error: "TEAM_TOO_SMALL" }, { status: 400 });

  await db.teamEvent.createMany({ data: [{ teamId: tid, eventId }], skipDuplicates: true });
  return NextResponse.json({ ok: true });
}

/** DELETE — withdraw the team from this event, unless it has already been selected. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId, cid, tid } = await params;

  const found = await loadTeam(cid, tid);
  if ("error" in found) return found.error;

  const entry = await db.teamEvent.findUnique({
    where:  { teamId_eventId: { teamId: tid, eventId } },
    select: { selected: true },
  });
  if (!entry) return NextResponse.json({ ok: true });
  if (entry.selected) return NextResponse.json({ error: "TEAM_LOCKED" }, { status: 400 });

  await db.teamEvent.delete({ where: { teamId_eventId: { teamId: tid, eventId } } });
  return NextResponse.json({ ok: true });
}
