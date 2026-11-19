import type { Prisma } from "@prisma/client";

// A competition marked "Dalam talian" in an event (EventCompetition.isOnline,
// set in the event's Pertandingan section) is played online although the event
// is physical: its teams never come to the venue, so attendance leaves them
// out everywhere — Log Kehadiran, the attendance counters, the attendance
// dashboard and Kehadiran Individu. The flag lives on the original row
// (parentId null); judging splits follow it.

/**
 * TeamEvent filter: only teams whose competition is played on site in this
 * event. Spread into a `where` (it only adds a top-level NOT).
 */
export const onsiteOnly = (eventId: string) => ({
  NOT: { team: { competition: { eventCompetitions: { some: { eventId, isOnline: true } } } } },
}) satisfies Prisma.TeamEventWhereInput;


/**
 * TeamEvent filter for the attendance reports (Dashboard Kehadiran, Kehadiran
 * Individu): only teams whose competition is one of this event's competitions
 * marked "Bersemuka" (the original row, isOnline false). Stricter than
 * onsiteOnly: teams of competitions not set up in the event's Pertandingan
 * section — e.g. walk-in teams registered at the counter — are left out too.
 * The counters and Log Kehadiran keep onsiteOnly so such teams can still be
 * checked in.
 */
export const bersemukaOnly = (eventId: string) => ({
  team: { competition: { eventCompetitions: { some: { eventId, parentId: null, isOnline: false } } } },
}) satisfies Prisma.TeamEventWhereInput;
