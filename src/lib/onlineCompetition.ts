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

