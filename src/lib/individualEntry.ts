import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * The event's "Penyertaan" rule. When the event is "Penyertaan Tunggal Sahaja"
 * (allowMultipleParticipation = false), returns the name of the competition the
 * participant already holds in this event through some other team — which blocks
 * the new entry. Returns null when the entry is allowed.
 *
 * `exceptTeamId` excludes the team being joined/extended; `exceptCompetitionId`
 * lets re-entering the same competition pass (a repeated token request is not a
 * second participation).
 */
export async function singleParticipationConflict(
  tx: Tx,
  input: { participantId: string; eventId: string; exceptTeamId?: string; exceptCompetitionId?: string },
): Promise<string | null> {
  const event = await tx.event.findUnique({
    where:  { id: input.eventId },
    select: { allowMultipleParticipation: true },
  });
  if (!event || event.allowMultipleParticipation) return null;

  // Competitions marked soloExempt sit outside the rule both ways: entering one
  // is never blocked, and an entry in one never blocks anything else.
  const exempt = await soloExemptCompetitionIds(tx, input.eventId);
  if (input.exceptCompetitionId && exempt.has(input.exceptCompetitionId)) return null;
  const skip = [...exempt, ...(input.exceptCompetitionId ? [input.exceptCompetitionId] : [])];

  const other = await tx.teamMember.findFirst({
    where: {
      participantId: input.participantId,
      team: {
        ...(input.exceptTeamId && { id: { not: input.exceptTeamId } }),
        ...(skip.length > 0    && { competitionId: { notIn: skip } }),
        teamEvents: { some: { eventId: input.eventId } },
      },
    },
    select: { team: { select: { competition: { select: { code: true, name: true } } } } },
  });
  return other ? `${other.team.competition.code} ${other.team.competition.name}` : null;
}

/**
 * Competitions of an event exempt from "Penyertaan Tunggal Sahaja"
 * (EventCompetition.soloExempt, read on the registration anchor row).
 * Callers pass `exceptCompetitionId` = the competition being entered, so that
 * competition being exempt lets the entry through.
 */
export async function soloExemptCompetitionIds(tx: Tx, eventId: string): Promise<Set<string>> {
  const rows = await tx.eventCompetition.findMany({
    where:  { eventId, parentId: null, soloExempt: true },
    select: { competitionId: true },
  });
  return new Set(rows.map((r) => r.competitionId));
}

/**
 * Enter one participant into an INDIVIDUAL competition for one event.
 *
 * The data model only knows teams, so an individual entry is a team of one:
 * named after the participant, owned by their contingent, with a TeamEvent row
 * joining it to the event. That TeamEvent is what makes the participant appear
 * on the organizer's preregistration page, attendance and reports.
 *
 * Idempotent: an existing single-person team for this competition is reused and
 * the TeamEvent is upserted, so calling it on every token request — or again from
 * a backfill — never duplicates anything.
 *
 * Does not check the event's "Penyertaan" rule itself — callers run
 * `singleParticipationConflict` first, before anything irreversible (such as
 * minting a Quizzly token) happens.
 */
export async function ensureIndividualEntry(
  tx: Tx,
  input: {
    participant: { id: string; name: string; contingentId: string };
    competitionId: string;
    eventId: string;
  },
): Promise<{ teamId: string; teamEventId: string; createdTeam: boolean; createdTeamEvent: boolean }> {
  const { participant, competitionId, eventId } = input;

  let team = await tx.team.findFirst({
    where:  { competitionId, members: { some: { participantId: participant.id } } },
    select: { id: true },
  });
  const createdTeam = !team;
  if (!team) {
    team = await tx.team.create({
      data: {
        name:          participant.name,
        competitionId,
        contingentId:  participant.contingentId,
        members:       { create: { participantId: participant.id } },
      },
      select: { id: true },
    });
  }

  const existing = await tx.teamEvent.findUnique({
    where:  { teamId_eventId: { teamId: team.id, eventId } },
    select: { id: true },
  });
  // acceptance stays at its PENDING default, exactly as the manager join-event
  // route leaves it — accepting is the organizer's / manager's call, not the
  // participant's.
  const teamEvent = existing ?? await tx.teamEvent.create({
    data:   { teamId: team.id, eventId },
    select: { id: true },
  });

  return { teamId: team.id, teamEventId: teamEvent.id, createdTeam, createdTeamEvent: !existing };
}
