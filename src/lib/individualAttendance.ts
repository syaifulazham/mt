import { db } from "@/lib/db";

// Individual attendance of an event ("Kehadiran Individu"), from the
// competition counter's per-participant check-ins (TeamEventParticipantAttendance).
//
// The unit is a team membership: a participant entered in two teams counts once
// per team, exactly as the counter records them. Only ACCEPTed team entries are
// counted. A team is "full" when every member checked in, "partial" when some
// did and some didn't, and "absent" when none did. The people the organizer
// most needs to chase — absent while their teammates were present — are the
// absentees of partial teams.

export type AttendanceStats = {
  contingents: number;
  teams: number;
  teamsFull: number;
  /** Teams with at least one absent member (partial + fully absent). */
  teamsWithAbsent: number;
  teamsPartial: number;
  teamsAbsent: number;
  members: number;
  present: number;
  absent: number;
  /** Absent while at least one teammate was present. */
  absentWhileTeamPresent: number;
};

export type AbsenteeRow = {
  participantId: string;
  name: string;
  gender: string | null;
  classGrade: string | null;
  teamId: string;
  teamName: string;
  competitionCode: string;
  competitionName: string;
  contingentName: string;
  stateName: string;
  presentTeammates: string[];
  teamSize: number;
  /** The contingent was checked in at the main counter (team arrival). */
  teamArrivedAt: string | null;
};

export type IndividualAttendance = {
  total: AttendanceStats;
  byState: (AttendanceStats & { stateName: string })[];
  absentees: AbsenteeRow[];
  /** Individual check-ins recorded for the event at all (0 = the competition counter wasn't used). */
  checkIns: number;
  firstCheckIn: string | null;
  lastCheckIn: string | null;
};

const NO_STATE = "Tiada negeri";

function emptyStats(): AttendanceStats {
  return {
    contingents: 0, teams: 0, teamsFull: 0, teamsWithAbsent: 0, teamsPartial: 0, teamsAbsent: 0,
    members: 0, present: 0, absent: 0, absentWhileTeamPresent: 0,
  };
}

export async function individualAttendance(eventId: string): Promise<IndividualAttendance> {
  const teamEvents = await db.teamEvent.findMany({
    where:  { eventId, acceptance: "ACCEPT" },
    select: {
      id: true, attendedAt: true,
      participantAttendance: { select: { participantId: true, attendedAt: true } },
      team: {
        select: {
          id: true, name: true,
          competition: { select: { code: true, name: true } },
          members: { select: { participant: { select: { id: true, name: true, gender: true, classGrade: true } } } },
          contingent: {
            select: {
              id: true, name: true,
              state: { select: { name: true } },
              school: { select: { state: { select: { name: true } } } },
              higherInstitution: { select: { state: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const total = emptyStats();
  const states = new Map<string, AttendanceStats>();
  const contingentsAll = new Set<string>();
  const contingentsByState = new Map<string, Set<string>>();
  const absentees: AbsenteeRow[] = [];
  let checkIns = 0;
  let first: Date | null = null, last: Date | null = null;

  for (const te of teamEvents) {
    const c = te.team.contingent;
    const stateName = c.state?.name ?? c.school?.state?.name ?? c.higherInstitution?.state?.name ?? NO_STATE;
    const st = states.get(stateName) ?? emptyStats();
    states.set(stateName, st);

    contingentsAll.add(c.id);
    const cs = contingentsByState.get(stateName) ?? new Set<string>();
    cs.add(c.id); contingentsByState.set(stateName, cs);

    for (const a of te.participantAttendance) {
      checkIns++;
      if (!first || a.attendedAt < first) first = a.attendedAt;
      if (!last || a.attendedAt > last) last = a.attendedAt;
    }
    const presentIds = new Set(te.participantAttendance.map(a => a.participantId));
    const members = te.team.members.map(m => m.participant);
    const present = members.filter(m => presentIds.has(m.id));
    const absent  = members.filter(m => !presentIds.has(m.id));
    const partial = present.length > 0 && absent.length > 0;

    for (const s of [total, st]) {
      s.teams++;
      s.members += members.length;
      s.present += present.length;
      s.absent  += absent.length;
      if (members.length > 0 && absent.length === 0) s.teamsFull++;
      if (absent.length > 0) s.teamsWithAbsent++;
      if (partial) { s.teamsPartial++; s.absentWhileTeamPresent += absent.length; }
      if (members.length > 0 && present.length === 0) s.teamsAbsent++;
    }

    if (partial) {
      for (const m of absent) {
        absentees.push({
          participantId: m.id, name: m.name, gender: m.gender, classGrade: m.classGrade,
          teamId: te.team.id, teamName: te.team.name,
          competitionCode: te.team.competition.code, competitionName: te.team.competition.name,
          contingentName: c.name, stateName,
          presentTeammates: present.map(p => p.name), teamSize: members.length,
          teamArrivedAt: te.attendedAt?.toISOString() ?? null,
        });
      }
    }
  }

  total.contingents = contingentsAll.size;
  const byState = [...states.entries()]
    .map(([stateName, s]) => ({ ...s, contingents: contingentsByState.get(stateName)?.size ?? 0, stateName }))
    .sort((a, b) => a.stateName === NO_STATE ? 1 : b.stateName === NO_STATE ? -1 : a.stateName.localeCompare(b.stateName));

  absentees.sort((a, b) =>
    a.stateName.localeCompare(b.stateName) || a.contingentName.localeCompare(b.contingentName)
    || a.competitionCode.localeCompare(b.competitionCode) || a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name));

  return {
    total, byState, absentees, checkIns,
    firstCheckIn: first?.toISOString() ?? null, lastCheckIn: last?.toISOString() ?? null,
  };
}
