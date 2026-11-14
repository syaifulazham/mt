import { db } from "@/lib/db";
import { matchesTargetGroup } from "@/lib/targetGroupMatch";

// Pra-Pendaftaran → Tambah Pasukan / Wildcard, individual competitions: a
// participant is entered in one of the event's individual competitions as a
// team of one (ensureIndividualEntry). Same rules as adding a team — the
// competition is offered by the event, and (unless a wildcard) the
// participant's contingent is inside the event's state / zone — plus the
// competition's target groups and the event's single-participation rule.

const STATE_SCOPES = ["STATE", "ONLINE_STATE"];
const ZONE_SCOPES  = ["ZONE", "ONLINE_ZONE"];

export async function loadPreregEvent(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, scope: true, stateId: true, zoneId: true,
      eventCompetitions: {
        where: { parentId: null, competition: { participationType: "INDIVIDUAL" } },
        select: {
          competition: {
            select: {
              id: true, code: true, name: true,
              targetGroups: { select: { targetGroup: { select: { schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true } } } },
            },
          },
        },
      },
    },
  });
  if (!event) return null;
  const zoneStateIds = ZONE_SCOPES.includes(event.scope) && event.zoneId
    ? new Set((await db.zoneState.findMany({ where: { zoneId: event.zoneId }, select: { stateId: true } })).map((z) => z.stateId))
    : null;
  return {
    event,
    individual: event.eventCompetitions.map((ec) => ec.competition)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    /** The participant's contingent is inside the event's state / zone (always true for national events). */
    inScope(stateId: string | null) {
      if (STATE_SCOPES.includes(event.scope)) return !!stateId && stateId === event.stateId;
      if (ZONE_SCOPES.includes(event.scope)) return !!stateId && !!zoneStateIds?.has(stateId);
      return true;
    },
  };
}

export type PreregEvent = NonNullable<Awaited<ReturnType<typeof loadPreregEvent>>>;

export const PARTICIPANT_SELECT = {
  id: true, name: true, ic: true, passport: true, eduLevel: true, classGrade: true, ppki: true, age: true,
  contingent: {
    select: {
      id: true, name: true,
      state: { select: { id: true, name: true } },
      school: { select: { state: { select: { id: true, name: true } } } },
      higherInstitution: { select: { state: { select: { id: true, name: true } } } },
      country: { select: { name: true } },
    },
  },
} as const;

type P = { eduLevel: string; classGrade: string | null; ppki: boolean; age: number | null;
  contingent: { state: { id: string; name: string } | null; school: { state: { id: string; name: string } | null } | null;
    higherInstitution: { state: { id: string; name: string } | null } | null; country: { name: string } | null } | null };

/** Effective state of the participant's contingent: school, then institution, then the contingent's own. */
export const stateOf = (p: P) => p.contingent?.school?.state ?? p.contingent?.higherInstitution?.state ?? p.contingent?.state ?? null;

/** The event's individual competitions this participant falls into (target groups; none = open to all). */
export function eligibleCompetitions(ev: PreregEvent, p: P) {
  return ev.individual.filter((c) => {
    const groups = c.targetGroups.map((t) => t.targetGroup);
    return groups.length === 0 || groups.some((g) => matchesTargetGroup(p, g));
  });
}
