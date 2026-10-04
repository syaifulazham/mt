import { db } from "@/lib/db";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";

const VISIBLE_EVENT_STATUSES = ["PUBLISHED", "ACTIVE"];

type Fc1ChallengeRef = { id: string; name: string; challenge_mode: string; status: string };

/**
 * Whether a participant may act on one challenge of one event-competition:
 * FC-1 competition, open event, challenge picked by the organizer, participant
 * in a target group. Recomputed server-side for every action rather than
 * trusted from the dashboard. Returns the facts the caller needs, or an error.
 */
export async function loadFc1ChallengeAccess(participantId: string, eventCompetitionId: string, challengeId: string) {
  const participant = await db.participant.findUnique({
    where:  { id: participantId },
    select: { id: true, name: true, contingentId: true, eduLevel: true, classGrade: true, ppki: true, age: true },
  });
  if (!participant) return { error: "NOT_FOUND", status: 404 } as const;

  const ec = await db.eventCompetition.findUnique({
    where: { id: eventCompetitionId },
    select: {
      id: true, eventId: true, competitionId: true, fc1Challenges: true,
      event: { select: { status: true } },
      competition: {
        select: {
          thirdPartyIntegration: true, participationType: true,
          targetGroups: {
            select: {
              targetGroup: {
                select: { id: true, name: true, schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true },
              },
            },
          },
        },
      },
    },
  });
  if (!ec) return { error: "NOT_FOUND", status: 404 } as const;
  if (ec.competition.thirdPartyIntegration !== "eptim-fc1") return { error: "NOT_INTEGRATED", status: 409 } as const;
  if (!VISIBLE_EVENT_STATUSES.includes(ec.event.status)) return { error: "Acara ini belum dibuka.", status: 409 } as const;

  // Only challenges the organizer picked for this event-competition are on offer.
  const challenge = ((ec.fc1Challenges as Fc1ChallengeRef[] | null) ?? []).find((c) => c.id === challengeId);
  if (!challenge) return { error: "Cabaran ini tidak ditawarkan untuk pertandingan ini.", status: 404 } as const;

  if (matchingTargetGroups(participant, ec.competition.targetGroups.map((t) => t.targetGroup)).length === 0)
    return { error: "NOT_ELIGIBLE", status: 403 } as const;

  return { participant, ec, challenge } as const;
}
