import { db } from "@/lib/db";
import type { WebcraftPublishedProject } from "@/lib/eptim-webcraft";

export const WEBCRAFT_INTEGRATION = "eptim-webcraft";

/** Per-participant result of the WebCraft lookup on the judging page. */
export type ParticipantProjects =
  | { state: "ok"; projects: WebcraftPublishedProject[] }
  | { state: "no_account" }   // WebCraft has no such account
  | { state: "unknown" };     // the lookup failed for this one

export type WebcraftRosterMember = { participantId: string; name: string; webcraftUserId: string | null };
export type WebcraftRosterTeam = {
  teamId: string; teamName: string; contingent: string; acceptance: string;
  members: WebcraftRosterMember[];
};
export type WebcraftRosterCompetition = {
  competitionId: string; code: string; name: string; participationType: string;
  teams: WebcraftRosterTeam[];
};

/**
 * Every participant entered in this event's WebCraft-integrated competitions,
 * grouped by competition and team. Two queries, both on indexed columns, and
 * nothing remote — WebCraft is asked separately, after the page has rendered.
 */
export async function loadWebcraftRoster(eventId: string): Promise<WebcraftRosterCompetition[]> {
  const ecs = await db.eventCompetition.findMany({
    where:   { eventId, competition: { thirdPartyIntegration: WEBCRAFT_INTEGRATION } },
    select:  { competition: { select: { id: true, code: true, name: true, participationType: true } } },
    orderBy: { competition: { code: "asc" } },
  });
  if (ecs.length === 0) return [];

  const teamEvents = await db.teamEvent.findMany({
    where:  { eventId, team: { competitionId: { in: ecs.map((e) => e.competition.id) } } },
    select: {
      acceptance: true,
      team: {
        select: {
          id: true, name: true, competitionId: true,
          contingent: { select: { name: true } },
          members: {
            select: {
              participant: {
                select: { id: true, name: true, webcraftAccess: { select: { webcraftUserId: true } } },
              },
            },
          },
        },
      },
    },
  });

  const byComp = new Map<string, WebcraftRosterTeam[]>();
  for (const te of teamEvents) {
    const t = te.team;
    const list = byComp.get(t.competitionId) ?? [];
    list.push({
      teamId:     t.id,
      teamName:   t.name,
      contingent: t.contingent.name,
      acceptance: te.acceptance,
      members: t.members
        .map(({ participant: p }) => ({
          participantId:  p.id,
          name:           p.name,
          webcraftUserId: p.webcraftAccess?.webcraftUserId ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
    byComp.set(t.competitionId, list);
  }

  return ecs.map(({ competition: c }) => ({
    competitionId:     c.id,
    code:              c.code,
    name:              c.name,
    participationType: c.participationType,
    teams: (byComp.get(c.id) ?? []).sort(
      (a, b) => a.contingent.localeCompare(b.contingent) || a.teamName.localeCompare(b.teamName),
    ),
  }));
}

/** Cheap existence check for the event manage canvas — one indexed count. */
export async function eventHasWebcraft(eventSlug: string): Promise<boolean> {
  const n = await db.eventCompetition.count({
    where: { event: { slug: eventSlug }, competition: { thirdPartyIntegration: WEBCRAFT_INTEGRATION } },
  });
  return n > 0;
}
