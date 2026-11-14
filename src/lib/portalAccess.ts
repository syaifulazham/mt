import { db } from "@/lib/db";

// EventCompetition.portalAccess — how a competition appears on the participant portal:
//   PUBLIC     — every eligible participant sees it and may register themselves
//                (requesting a quiz code / registering a challenge enters them).
//   RESTRICTED — only participants already registered in it (by the organizer,
//                manager or international page) see it; no self-registration.
export const PORTAL_ACCESS = ["PUBLIC", "RESTRICTED"] as const;
export type PortalAccess = (typeof PORTAL_ACCESS)[number];

/**
 * Whether Restricted applies: only individual competitions have self-registration,
 * so a team competition is always Public whatever is stored.
 */
export const isRestricted = (portalAccess: string, participationType: string) =>
  portalAccess === "RESTRICTED" && participationType === "INDIVIDUAL";

export const RESTRICTED_MESSAGE =
  "Pertandingan ini terhad kepada peserta yang telah didaftarkan. Hubungi pengurus kontinjen atau penganjur.";

/** `${eventId}:${competitionId}` of every event competition the participant is entered in. */
export async function participantEntryKeys(participantId: string): Promise<Set<string>> {
  const rows = await db.teamMember.findMany({
    where:  { participantId },
    select: { team: { select: { competitionId: true, teamEvents: { select: { eventId: true } } } } },
  });
  return new Set(rows.flatMap((r) => r.team.teamEvents.map((te) => `${te.eventId}:${r.team.competitionId}`)));
}

/** Whether the participant is already entered in this competition of this event. */
export async function isEnteredInEventCompetition(participantId: string, eventId: string, competitionId: string) {
  const hit = await db.teamEvent.findFirst({
    where:  { eventId, team: { competitionId, members: { some: { participantId } } } },
    select: { id: true },
  });
  return !!hit;
}
