import { db } from "@/lib/db";

// Senarai Kehadiran Penyertaan — who was actually present, school by school,
// grouped by competition (the per-school form: L/P, bangsa, murid, guru).
//
// Present means the same as the Bersemuka / Walk-in parts of Laporan Kehadiran
// Akhir (finalAttendanceData.ts):
// • accepted, ACTIVE teams of the event's on-site competitions (original row,
//   isOnline false) — counter basis: the contingent checked in at the main
//   counter (TeamEvent.attendedAt); individual basis: the member was checked in
//   on site (Kehadiran Individu);
// • CONFIRMED walk-ins (a team walk-in brings all its members).
// That is the Bersemuka list. The Dalam Talian list (mode ONLINE) covers the
// competitions run "Dalam talian" instead: no attendance is taken, so every
// accepted, ACTIVE team counts (as in Laporan Kehadiran Akhir), and there are
// no walk-ins. In either list every international participant (a foreign
// contingent registered for this event) of its competitions is included,
// whatever their check-in or acceptance — they are not checked in at the counter.
//
// Murid = unique present participants of that school in that competition;
// Guru = unique trainers of that school's present teams in that competition.

export type AttendanceBasis = "counter" | "individual";
export type ListMode = "BERSEMUKA" | "ONLINE";

export interface Tally {
  male: number;
  female: number;
  melayu: number;
  cina: number;
  india: number;
  lain: number;
  murid: number;
  guru: number;
}

export interface SchoolRow extends Tally {
  contingentId: string;
  schoolCode: string | null;
  name: string;
  region: string;
  international: boolean;
}

export interface CompetitionGroup {
  key: string;
  code: string;
  name: string;
  walkIn: boolean;
  rows: SchoolRow[];
  total: Tally;
}

export interface AttendanceListData {
  eventName: string;
  generatedAt: string;
  basis: AttendanceBasis;
  mode: ListMode;
  groups: CompetitionGroup[];
  total: Tally & { schools: number; internationalMurid: number };
}

const zero = (): Tally => ({ male: 0, female: 0, melayu: 0, cina: 0, india: 0, lain: 0, murid: 0, guru: 0 });
const add = (a: Tally, b: Tally): Tally => ({
  male: a.male + b.male, female: a.female + b.female,
  melayu: a.melayu + b.melayu, cina: a.cina + b.cina, india: a.india + b.india, lain: a.lain + b.lain,
  murid: a.murid + b.murid, guru: a.guru + b.guru,
});

const CONTINGENT_SELECT = {
  select: {
    id: true, name: true,
    state: { select: { name: true } },
    school: { select: { code: true, name: true, state: { select: { name: true } } } },
    higherInstitution: { select: { code: true, name: true, state: { select: { name: true } } } },
    country: { select: { name: true, codeIso2: true } },
  },
} as const;
const PERSON_SELECT = { select: { id: true, gender: true, ethnicity: true } } as const;

type ContingentInfo = {
  id: string; name: string;
  state: { name: string } | null;
  school: { code: string; name: string; state: { name: string } | null } | null;
  higherInstitution: { code: string | null; name: string; state: { name: string } | null } | null;
  country: { name: string; codeIso2: string } | null;
};
type Person = { id: string; gender: string; ethnicity: string | null };

const isForeign = (c: ContingentInfo) => !!c.country && c.country.codeIso2 !== "MY";

interface Acc {
  contingent: ContingentInfo;
  people: Map<string, Person>;
  trainers: Set<string>;
}
interface GroupAcc { code: string; name: string; walkIn: boolean; byContingent: Map<string, Acc> }

export async function computeAttendanceListData(
  eventId: string, basis: AttendanceBasis = "counter", mode: ListMode = "BERSEMUKA",
): Promise<AttendanceListData | null> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { name: true } });
  if (!event) return null;

  const anchors = await db.eventCompetition.findMany({
    where: { eventId, parentId: null },
    select: { competitionId: true, isOnline: true },
  });
  const online = new Map(anchors.map(a => [a.competitionId, a.isOnline]));
  const inMode = (competitionId: string) => (online.get(competitionId) === true) === (mode === "ONLINE");

  const teamSelect = {
    id: true, competitionId: true,
    competition: { select: { code: true, name: true } },
    contingent: CONTINGENT_SELECT,
    members: { select: { participant: PERSON_SELECT } },
    trainers: { select: { trainerId: true } },
  } as const;

  const [teamEvents, foreignTeams, walkIns] = await Promise.all([
    db.teamEvent.findMany({
      where: { eventId, acceptance: "ACCEPT", team: { status: "ACTIVE", competitionId: { in: [...online.keys()] } } },
      select: {
        attendedAt: true,
        participantAttendance: { select: { participantId: true } },
        team: { select: teamSelect },
      },
    }),
    // Every international team of this event, accepted or not.
    db.team.findMany({
      where: {
        status: "ACTIVE",
        competitionId: { in: [...online.keys()] },
        contingent: { internationalEventId: eventId, country: { codeIso2: { not: "MY" } } },
      },
      select: teamSelect,
    }),
    mode === "ONLINE" ? [] : db.walkInRegistration.findMany({
      where: { status: "CONFIRMED", walkInCompetition: { eventId } },
      select: {
        walkInCompetition: { select: { id: true, competition: { select: { id: true, code: true, name: true } } } },
        participant: PERSON_SELECT,
        contingent: CONTINGENT_SELECT,
        team: { select: { id: true, members: { select: { participant: PERSON_SELECT } }, trainers: { select: { trainerId: true } } } },
      },
    }),
  ]);

  const groups = new Map<string, GroupAcc>();
  const put = (
    key: string, comp: { code: string; name: string }, walkIn: boolean,
    contingent: ContingentInfo, people: Person[], trainerIds: string[],
  ) => {
    if (!people.length) return;
    let g = groups.get(key);
    if (!g) { g = { code: comp.code, name: comp.name, walkIn, byContingent: new Map() }; groups.set(key, g); }
    let a = g.byContingent.get(contingent.id);
    if (!a) { a = { contingent, people: new Map(), trainers: new Set() }; g.byContingent.set(contingent.id, a); }
    for (const p of people) a.people.set(p.id, p);
    for (const t of trainerIds) a.trainers.add(t);
  };

  const individual = basis === "individual";
  for (const te of teamEvents) {
    const t = te.team;
    const foreign = isForeign(t.contingent);
    if (foreign) continue; // listed below, from every international team
    if (!inMode(t.competitionId)) continue;
    const indiv = new Set(te.participantAttendance.map(a => a.participantId));
    const present = t.members
      .map(m => m.participant)
      .filter(p => mode === "ONLINE" || (individual ? indiv.has(p.id) : !!te.attendedAt));
    put(`c:${t.competitionId}`, t.competition, false, t.contingent, present, present.length ? t.trainers.map(x => x.trainerId) : []);
  }
  for (const t of foreignTeams) {
    if (!inMode(t.competitionId)) continue;
    put(`c:${t.competitionId}`, t.competition, false, t.contingent, t.members.map(m => m.participant), t.trainers.map(x => x.trainerId));
  }

  // Walk-ins are grouped under their competition, alongside its registered teams.
  const seenWalkInTeams = new Set<string>();
  for (const w of walkIns) {
    const wc = w.walkInCompetition;
    if (w.team) {
      const k = `${wc.id}:${w.team.id}`;
      if (seenWalkInTeams.has(k)) continue;
      seenWalkInTeams.add(k);
    }
    const people = w.team && w.team.members.length ? w.team.members.map(m => m.participant) : [w.participant];
    const key = `c:${wc.competition.id}`;
    put(key, wc.competition, !groups.has(key), w.contingent, people, w.team?.trainers.map(x => x.trainerId) ?? []);
  }

  const regionOf = (c: ContingentInfo) =>
    isForeign(c) ? c.country!.name
      : c.state?.name ?? c.school?.state?.name ?? c.higherInstitution?.state?.name ?? "–";

  const out: CompetitionGroup[] = [...groups.entries()].map(([key, g]) => {
    const rows: SchoolRow[] = [...g.byContingent.values()].map(a => {
      const ps = [...a.people.values()];
      const eth = (e: string) => ps.filter(p => p.ethnicity === e).length;
      const melayu = eth("MELAYU"), cina = eth("CINA"), india = eth("INDIA");
      const c = a.contingent;
      return {
        contingentId: c.id,
        schoolCode: c.school?.code ?? c.higherInstitution?.code ?? null,
        name: c.school?.name ?? c.higherInstitution?.name ?? c.name,
        region: regionOf(c),
        international: isForeign(c),
        male: ps.filter(p => p.gender === "MALE").length,
        female: ps.filter(p => p.gender === "FEMALE").length,
        melayu, cina, india,
        lain: ps.length - melayu - cina - india,
        murid: ps.length,
        guru: a.trainers.size,
      };
    }).sort((x, y) => Number(x.international) - Number(y.international)
      || x.region.localeCompare(y.region, "ms")
      || x.name.localeCompare(y.name, "ms"));
    return { key, code: g.code, name: g.name, walkIn: g.walkIn, rows, total: rows.reduce<Tally>(add, zero()) };
  }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const total = out.reduce<Tally>((s, g) => add(s, g.total), zero());
  return {
    eventName: event.name,
    generatedAt: new Date().toISOString(),
    basis,
    mode,
    groups: out,
    total: {
      ...total,
      schools: new Set(out.flatMap(g => g.rows.map(r => r.contingentId))).size,
      internationalMurid: out.reduce((s, g) => s + g.rows.filter(r => r.international).reduce((x, r) => x + r.murid, 0), 0),
    },
  };
}

export const LIST_MODE_LABEL: Record<ListMode, string> = { BERSEMUKA: "Bersemuka", ONLINE: "Dalam Talian" };

/** The explanatory note under the summary (page and Word). */
export function attendanceListNote(d: Pick<AttendanceListData, "basis" | "mode">): string {
  const who = d.mode === "ONLINE"
    ? "Pertandingan Dalam Talian: kehadiran tidak diambil, maka semua pasukan yang diterima disenaraikan (sama seperti bahagian Dalam Talian Laporan Kehadiran Akhir)."
    : `Hanya peserta yang hadir: pertandingan Bersemuka mengikut kehadiran ${d.basis === "individual" ? "individu" : "kaunter"} (sama seperti Laporan Kehadiran Akhir) dan walk-in yang disahkan.`;
  return `${who} Semua peserta antarabangsa disenaraikan. Murid dan guru dikira unik dalam setiap pertandingan; ` +
    "murid yang menyertai lebih daripada satu pertandingan dikira dalam setiap pertandingan. Lain-lain merangkumi Orang Asli, Bumiputera Sabah/Sarawak, lain-lain dan tidak dinyatakan.";
}
