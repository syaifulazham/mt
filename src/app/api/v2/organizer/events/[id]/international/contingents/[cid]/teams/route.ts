import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureIndividualEntry } from "@/lib/individualEntry";
import {
  checkTeamPeople, loadEventCompetitions, loadForeignContingent, requireInternationalAdmin,
} from "@/lib/international";

function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * POST { competitionId, name?, memberIds, trainerIds?, enroll? } — register a
 * team of a foreign school for one of this event's competitions.
 *
 * TEAM competitions take a name and up to maxTeamSize members. INDIVIDUAL
 * competitions take one member and, like everywhere else, become a team of one
 * named after the participant (src/lib/individualEntry.ts). `enroll: true` also
 * enters it into this event (TeamEvent, acceptance PENDING), so it shows up in
 * Pra-Pendaftaran.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId, cid } = await params;

  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const body = await req.json().catch(() => null);
  const competitions = await loadEventCompetitions(eventId);
  if (!competitions) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  const competition = competitions.get(String(body?.competitionId ?? ""));
  if (!competition) return NextResponse.json({ error: "COMPETITION_NOT_IN_EVENT" }, { status: 400 });

  const memberIds  = [...new Set(ids(body?.memberIds))];
  const trainerIds = [...new Set(ids(body?.trainerIds))];
  const enroll     = body?.enroll === true;
  const individual = competition.participationType === "INDIVIDUAL";
  const name       = typeof body?.name === "string" ? body.name.trim() : "";
  if (!individual && !name) return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  const problem = await checkTeamPeople({ contingentId: cid, competition, memberIds, trainerIds, eventId });
  if (problem) return NextResponse.json(problem, { status: 400 });
  if (enroll && !individual && memberIds.length < competition.minTeamSize)
    return NextResponse.json({ error: "TEAM_TOO_SMALL" }, { status: 400 });

  const teamId = await db.$transaction(async (tx) => {
    let id: string;
    if (individual) {
      const participant = await tx.participant.findUniqueOrThrow({
        where: { id: memberIds[0] }, select: { id: true, name: true, contingentId: true },
      });
      if (enroll) {
        id = (await ensureIndividualEntry(tx, { participant, competitionId: competition.id, eventId })).teamId;
      } else {
        const existing = await tx.team.findFirst({
          where:  { competitionId: competition.id, members: { some: { participantId: participant.id } } },
          select: { id: true },
        });
        id = existing?.id ?? (await tx.team.create({
          data:   {
            name: participant.name, competitionId: competition.id, contingentId: cid,
            members: { create: { participantId: participant.id } },
          },
          select: { id: true },
        })).id;
      }
    } else {
      id = (await tx.team.create({
        data:   {
          name, competitionId: competition.id, contingentId: cid,
          members: { create: memberIds.map((participantId) => ({ participantId })) },
        },
        select: { id: true },
      })).id;
      if (enroll) await tx.teamEvent.create({ data: { teamId: id, eventId } });
    }
    if (trainerIds.length > 0)
      await tx.teamTrainer.createMany({
        data: trainerIds.map((trainerId) => ({ teamId: id, trainerId })),
        skipDuplicates: true,
      });
    return id;
  });

  return NextResponse.json({ data: { id: teamId } }, { status: 201 });
}
