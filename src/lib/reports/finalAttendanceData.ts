import { db } from "@/lib/db";

// Laporan Kehadiran Akhir — who actually took part, split by how the
// competition was run in the event:
//
// • Bersemuka — accepted, ACTIVE teams of the event's competitions marked
//   "Bersemuka" (original row, isOnline false), counted exactly as the
//   attendance dashboard (dashboard-stats) does, in either of its modes:
//   counter — a team, and all its members, are present once the contingent
//   checked in at the main counter (TeamEvent.attendedAt); individual — a
//   member is present when checked in on site (Kehadiran Individu), a team
//   when at least one member is. A contingent / trainer is present when at
//   least one of its teams is. International teams (foreign contingents
//   registered for this event) are not checked in at the counter: all of them,
//   accepted or not, count as present.
// • Walk-in — the event's walk-in competitions (on site, but not in the
//   dashboard): an entry is present once CONFIRMED; a team walk-in brings all
//   its members.
// • Dalam talian — competitions marked "Dalam talian" (isOnline). No attendance
//   is taken for them, so every accepted, ACTIVE team counts.
//
// Every breakdown counts unique participants.

export type Mode = "BERSEMUKA" | "WALKIN" | "ONLINE";
export type AttendanceBasis = "counter" | "individual";

export interface Count { reg: number; present: number }

export interface DimRow {
  key: string;
  label: string;
  reg: number;
  present: number;
  male: number;
  female: number;
}

export interface MatrixData {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  /** cells[rowKey][colKey] = present participants */
  cells: Record<string, Record<string, number>>;
}

export interface StateRow {
  stateName: string;
  contingents: Count;
  teams: Count;
  participants: Count;
  male: number;
  female: number;
}

export interface CompRow {
  code: string;
  name: string;
  targetGroup: string;
  walkIn: boolean;
  teams: Count;
  participants: Count;
  male: number;
  female: number;
}

export interface ModeReport {
  mode: Mode;
  /** Whether attendance is taken (false for Dalam talian: present = registered). */
  attendanceTaken: boolean;
  competitions: number;
  contingents: Count;
  teams: Count;
  participants: Count;
  trainers: Count;
  walkIn: Count;
  male: number;
  female: number;
  byTargetGroup: DimRow[];
  byGrade: { level: string; rows: DimRow[] }[];
  byEthnicity: DimRow[];
  byLocality: DimRow[];
  tgByEthnicity: MatrixData;
  tgByLocality: MatrixData;
  byState: StateRow[];
  byCompetition: CompRow[];
}

export interface FinalAttendanceData {
  eventName: string;
  generatedAt: string;
  basis: AttendanceBasis;
  overall: { participants: number; contingents: number; teams: number; trainers: number; both: number };
  bersemuka: ModeReport;
  walkIn: ModeReport;
  online: ModeReport;
}

// ── labels ──────────────────────────────────────────────────────────────────

const ETHNICITY: [string, string][] = [
  ["MELAYU", "Melayu"], ["CINA", "Cina"], ["INDIA", "India"],
  ["ORANG_ASLI_SEMENANJUNG", "Orang Asli (Semenanjung)"],
  ["BUMIPUTRA_SABAH", "Bumiputera Sabah"], ["BUMIPUTRA_SARAWAK", "Bumiputera Sarawak"],
  ["LAIN_LAIN", "Lain-lain"], ["NONE", "Tidak dinyatakan"],
];
const LOCALITY: [string, string][] = [
  ["BANDAR", "Bandar"], ["SUB_BANDAR", "Sub-bandar"], ["LUAR_BANDAR", "Luar bandar"],
  ["PEDALAMAN_1", "Pedalaman 1"], ["PEDALAMAN_2", "Pedalaman 2"], ["PEDALAMAN_3", "Pedalaman 3"],
  ["NONE", "Tidak dinyatakan"],
];
const LEVEL_ORDER = ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH", "SPECIAL"];
const LEVEL_LABEL: Record<string, string> = {
  KINDERGARTEN: "Prasekolah", PRIMARY: "Sekolah Rendah", SECONDARY: "Sekolah Menengah", YOUTH: "Belia", SPECIAL: "Pendidikan Khas",
};

/** Class grade, normalised into a sortable key and a label. Free text (Belia) is bucketed. */
function gradeOf(eduLevel: string, raw: string | null): { key: string; label: string } {
  const g = (raw ?? "").trim();
  const digit = g.match(/\d/)?.[0];
  if (eduLevel === "KINDERGARTEN") {
    const age = g.match(/[56]/)?.[0];
    return age ? { key: `0-${age}`, label: `Prasekolah ${age} tahun` } : { key: "0-9", label: "Prasekolah" };
  }
  if (eduLevel === "PRIMARY")
    return digit ? { key: `1-${digit}`, label: `Darjah ${digit}` } : { key: "1-9", label: "Darjah (tidak dinyatakan)" };
  if (eduLevel === "SECONDARY")
    return digit ? { key: `2-${digit}`, label: `Tingkatan ${digit}` } : { key: "2-9", label: "Tingkatan (tidak dinyatakan)" };
  const s = g.toLowerCase();
  if (/ting(katan)?\s*6|^t6$|6\s*atas/.test(s)) return { key: "3-1", label: "Tingkatan 6" };
  if (/matrik/.test(s)) return { key: "3-2", label: "Matrikulasi" };
  if (/dip|siploma|dvm/.test(s)) return { key: "3-3", label: "Diploma / DVM" };
  if (/sem|tahun|year|^\d$/.test(s)) return { key: "3-4", label: "IPT (tahun / semester)" };
  if (!s) return { key: "3-9", label: "Tidak dinyatakan" };
  return { key: "3-8", label: "Lain-lain" };
}

function stateName(c: {
  state: { name: string } | null;
  school: { state: { name: string } | null } | null;
  higherInstitution: { state: { name: string } | null } | null;
  country: { name: string; codeIso2: string } | null;
}): string {
  if (c.country && c.country.codeIso2 !== "MY") return `Antarabangsa (${c.country.name})`;
  return c.state?.name ?? c.school?.state?.name ?? c.higherInstitution?.state?.name ?? "Tidak dinyatakan";
}

// ── accumulation ────────────────────────────────────────────────────────────

type TG = { id: string; code: string; name: string; schoolLevel: string; classGrades: string[]; ppki: boolean };

interface Person { gender: string; ethnicity: string | null; eduLevel: string; classGrade: string | null; ppki: boolean }

interface Entry {
  teamKey: string;
  compKey: string;
  compCode: string;
  compName: string;
  tgs: TG[];
  walkIn: boolean;
  contingentId: string;
  stateName: string;
  locality: string;
  teamPresent: boolean;
  members: { pid: string; present: boolean }[];
  trainerIds: string[];
}

/** The competition's target group that fits the participant (PPKI, grade); else its first. */
function pickTg(tgs: TG[], p: Person): TG | null {
  if (!tgs.length) return null;
  const grade = (p.classGrade ?? "").trim().toLowerCase();
  return tgs.find(t => t.ppki === p.ppki && t.classGrades.some(g => g.toLowerCase() === grade))
    ?? tgs.find(t => t.ppki === p.ppki)
    ?? tgs[0];
}

function buildMode(mode: Mode, entries: Entry[], people: Map<string, Person>): ModeReport {
  const attendanceTaken = mode !== "ONLINE";

  type Acc = { label: string; reg: Set<string>; present: Set<string> };
  const dim = (m: Map<string, Acc>, key: string, label: string) => {
    let a = m.get(key);
    if (!a) { a = { label, reg: new Set(), present: new Set() }; m.set(key, a); }
    return a;
  };
  const toRows = (m: Map<string, Acc>, order?: string[]): DimRow[] => {
    const rows = [...m.entries()].map(([key, a]) => {
      const present = [...a.present];
      return {
        key, label: a.label, reg: a.reg.size, present: present.length,
        male: present.filter(id => people.get(id)?.gender === "MALE").length,
        female: present.filter(id => people.get(id)?.gender === "FEMALE").length,
      };
    });
    return order
      ? rows.sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key))
      : rows.sort((x, y) => x.key.localeCompare(y.key, undefined, { numeric: true }));
  };

  const regP = new Set<string>(), presP = new Set<string>();
  const regC = new Set<string>(), presC = new Set<string>();
  const regT = new Set<string>(), presT = new Set<string>();
  const wiReg = new Set<string>(), wiPres = new Set<string>();
  const comps = new Set<string>();

  const byTg = new Map<string, Acc>(), tgMeta = new Map<string, TG | null>();
  const byGrade = new Map<string, Map<string, Acc>>();
  const byEth = new Map<string, Acc>(), byLoc = new Map<string, Acc>();
  const tgEth = new Map<string, Map<string, Set<string>>>(), tgLoc = new Map<string, Map<string, Set<string>>>();
  const cell = (m: Map<string, Map<string, Set<string>>>, r: string, c: string) => {
    if (!m.has(r)) m.set(r, new Map());
    const row = m.get(r)!;
    if (!row.has(c)) row.set(c, new Set());
    return row.get(c)!;
  };

  type SAcc = { cReg: Set<string>; cPres: Set<string>; tReg: number; tPres: number; pReg: Set<string>; pPres: Set<string> };
  const byState = new Map<string, SAcc>();
  type CAcc = { code: string; name: string; walkIn: boolean; tgs: Set<string>; tReg: number; tPres: number; pReg: Set<string>; pPres: Set<string> };
  const byComp = new Map<string, CAcc>();

  for (const e of entries) {
    comps.add(e.compKey);
    regC.add(e.contingentId);
    regT.add(e.teamKey);
    if (e.teamPresent) { presC.add(e.contingentId); presT.add(e.teamKey); }

    let s = byState.get(e.stateName);
    if (!s) { s = { cReg: new Set(), cPres: new Set(), tReg: 0, tPres: 0, pReg: new Set(), pPres: new Set() }; byState.set(e.stateName, s); }
    s.cReg.add(e.contingentId); s.tReg++;
    if (e.teamPresent) { s.cPres.add(e.contingentId); s.tPres++; }

    let c = byComp.get(e.compKey);
    if (!c) { c = { code: e.compCode, name: e.compName, walkIn: e.walkIn, tgs: new Set(), tReg: 0, tPres: 0, pReg: new Set(), pPres: new Set() }; byComp.set(e.compKey, c); }
    c.tReg++;
    if (e.teamPresent) c.tPres++;
    for (const t of e.tgs) c.tgs.add(t.name);

    for (const m of e.members) {
      const p = people.get(m.pid);
      if (!p) continue;
      const tg = pickTg(e.tgs, p);
      const tgKey = tg?.id ?? "NONE";
      tgMeta.set(tgKey, tg);
      const grade = gradeOf(p.eduLevel, p.classGrade);
      const level = p.eduLevel;
      if (!byGrade.has(level)) byGrade.set(level, new Map());
      const eth = p.ethnicity ?? "NONE";
      const ethLabel = ETHNICITY.find(([k]) => k === eth)?.[1] ?? eth;
      const loc = e.locality;
      const locLabel = LOCALITY.find(([k]) => k === loc)?.[1] ?? loc;

      const accs = [
        dim(byTg, tgKey, tg ? tg.name : "Tiada kumpulan sasaran"),
        dim(byGrade.get(level)!, grade.key, grade.label),
        dim(byEth, eth, ethLabel),
        dim(byLoc, loc, locLabel),
      ];
      regP.add(m.pid); s.pReg.add(m.pid); c.pReg.add(m.pid);
      if (e.walkIn) wiReg.add(m.pid);
      for (const a of accs) a.reg.add(m.pid);
      if (m.present) {
        presP.add(m.pid); s.pPres.add(m.pid); c.pPres.add(m.pid);
        if (e.walkIn) wiPres.add(m.pid);
        for (const a of accs) a.present.add(m.pid);
        cell(tgEth, tgKey, eth).add(m.pid);
        cell(tgLoc, tgKey, loc).add(m.pid);
      }
    }
  }

  const tgOrder = [...tgMeta.entries()]
    .sort(([, a], [, b]) =>
      (a ? LEVEL_ORDER.indexOf(a.schoolLevel) : 99) - (b ? LEVEL_ORDER.indexOf(b.schoolLevel) : 99)
      || Number(a?.ppki ?? 0) - Number(b?.ppki ?? 0)
      || (a?.name ?? "").localeCompare(b?.name ?? ""))
    .map(([k]) => k);
  const byTargetGroup = toRows(byTg, tgOrder);

  const matrix = (m: Map<string, Map<string, Set<string>>>, labels: [string, string][]): MatrixData => {
    const used = new Set([...m.values()].flatMap(r => [...r.keys()]));
    return {
      rows: byTargetGroup.filter(r => m.has(r.key)).map(r => ({ key: r.key, label: r.label })),
      cols: labels.filter(([k]) => used.has(k)).map(([key, label]) => ({ key, label })),
      cells: Object.fromEntries([...m.entries()].map(([r, row]) => [r, Object.fromEntries([...row.entries()].map(([k, v]) => [k, v.size]))])),
    };
  };

  const genderOf = (ids: Iterable<string>, g: string) => [...ids].filter(id => people.get(id)?.gender === g).length;

  const trainersReg = new Set<string>(), trainersPres = new Set<string>();
  for (const e of entries) for (const t of e.trainerIds) { trainersReg.add(t); if (e.teamPresent) trainersPres.add(t); }

  return {
    mode, attendanceTaken,
    competitions: comps.size,
    contingents: { reg: regC.size, present: presC.size },
    teams: { reg: regT.size, present: presT.size },
    participants: { reg: regP.size, present: presP.size },
    trainers: { reg: trainersReg.size, present: trainersPres.size },
    walkIn: { reg: wiReg.size, present: wiPres.size },
    male: genderOf(presP, "MALE"),
    female: genderOf(presP, "FEMALE"),
    byTargetGroup,
    byGrade: [...byGrade.entries()]
      .sort(([a], [b]) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))
      .map(([level, m]) => ({ level: LEVEL_LABEL[level] ?? level, rows: toRows(m) })),
    byEthnicity: toRows(byEth, ETHNICITY.map(([k]) => k)),
    byLocality: toRows(byLoc, LOCALITY.map(([k]) => k)),
    tgByEthnicity: matrix(tgEth, ETHNICITY),
    tgByLocality: matrix(tgLoc, LOCALITY),
    byState: [...byState.entries()]
      .map(([name, s]) => ({
        stateName: name,
        contingents: { reg: s.cReg.size, present: s.cPres.size },
        teams: { reg: s.tReg, present: s.tPres },
        participants: { reg: s.pReg.size, present: s.pPres.size },
        male: genderOf(s.pPres, "MALE"),
        female: genderOf(s.pPres, "FEMALE"),
      }))
      .sort((a, b) => Number(a.stateName.startsWith("Antarabangsa") || a.stateName === "Tidak dinyatakan")
        - Number(b.stateName.startsWith("Antarabangsa") || b.stateName === "Tidak dinyatakan")
        || a.stateName.localeCompare(b.stateName, "ms")),
    byCompetition: [...byComp.values()]
      .map(c => ({
        code: c.code, name: c.name, walkIn: c.walkIn, targetGroup: [...c.tgs].join(", "),
        teams: { reg: c.tReg, present: c.tPres },
        participants: { reg: c.pReg.size, present: c.pPres.size },
        male: genderOf(c.pPres, "MALE"),
        female: genderOf(c.pPres, "FEMALE"),
      }))
      .sort((a, b) => Number(a.walkIn) - Number(b.walkIn) || a.code.localeCompare(b.code, undefined, { numeric: true })),
  };
}

// ── main ────────────────────────────────────────────────────────────────────

const TG_SELECT = { select: { targetGroup: { select: { id: true, code: true, name: true, schoolLevel: true, classGrades: true, ppki: true } } } } as const;
const CONTINGENT_SELECT = {
  select: {
    id: true, locality: true, internationalEventId: true,
    state: { select: { name: true } },
    school: { select: { state: { select: { name: true } } } },
    higherInstitution: { select: { state: { select: { name: true } } } },
    country: { select: { name: true, codeIso2: true } },
  },
} as const;
const PERSON_SELECT = { select: { id: true, gender: true, ethnicity: true, eduLevel: true, classGrade: true, ppki: true } } as const;

export async function computeFinalAttendanceData(
  eventId: string, basis: AttendanceBasis = "counter",
): Promise<FinalAttendanceData | null> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { name: true } });
  if (!event) return null;

  const anchors = await db.eventCompetition.findMany({
    where: { eventId, parentId: null },
    select: { competitionId: true, isOnline: true },
  });
  const online = new Map(anchors.map(a => [a.competitionId, a.isOnline]));

  const teamSelect = {
    id: true, competitionId: true,
    competition: { select: { code: true, name: true, targetGroups: TG_SELECT } },
    contingent: CONTINGENT_SELECT,
    members: { select: { participant: PERSON_SELECT } },
    trainers: { select: { trainerId: true } },
  } as const;

  const [teamEvents, foreignTeams, walkIns] = await Promise.all([
    db.teamEvent.findMany({
      where: { eventId, acceptance: "ACCEPT", team: { status: "ACTIVE", competitionId: { in: [...online.keys()] } } },
      select: {
        id: true, attendedAt: true,
        participantAttendance: { select: { participantId: true } },
        team: { select: teamSelect },
      },
    }),
    // International teams (foreign contingents registered for this event) all
    // count as present — they are not checked in at the counter — accepted or not.
    db.team.findMany({
      where: {
        status: "ACTIVE",
        competitionId: { in: [...online.keys()] },
        contingent: { internationalEventId: eventId, country: { codeIso2: { not: "MY" } } },
      },
      select: teamSelect,
    }),
    db.walkInRegistration.findMany({
      where: { status: { notIn: ["REJECTED", "CANCELLED"] }, walkInCompetition: { eventId } },
      select: {
        id: true, status: true,
        walkInCompetition: { select: { id: true, competition: { select: { code: true, name: true, targetGroups: TG_SELECT } } } },
        participant: PERSON_SELECT,
        contingent: CONTINGENT_SELECT,
        team: { select: { id: true, members: { select: { participant: PERSON_SELECT } }, trainers: { select: { trainerId: true } } } },
      },
    }),
  ]);

  const people = new Map<string, Person>();
  const addPerson = (p: { id: string; gender: string; ethnicity: string | null; eduLevel: string; classGrade: string | null; ppki: boolean }) => {
    if (!people.has(p.id)) people.set(p.id, { gender: p.gender, ethnicity: p.ethnicity, eduLevel: p.eduLevel, classGrade: p.classGrade, ppki: p.ppki });
    return p.id;
  };

  const bersemuka: Entry[] = [], walkInEntries: Entry[] = [], onlineEntries: Entry[] = [];
  const individual = basis === "individual";
  const foreignIds = new Set(foreignTeams.map(t => t.id));
  const teamRows = [
    ...teamEvents.filter(te => !foreignIds.has(te.team.id)),
    ...foreignTeams.map(t => ({ team: t, attendedAt: null, participantAttendance: [] as { participantId: string }[], foreign: true })),
  ];
  for (const te of teamRows) {
    const t = te.team;
    const foreign = "foreign" in te;
    const isOnline = online.get(t.competitionId) === true;
    const indiv = new Set(te.participantAttendance.map(a => a.participantId));
    const counter = !!te.attendedAt || foreign;
    const entry: Entry = {
      teamKey: `t:${t.id}`,
      compKey: `c:${t.competitionId}`,
      compCode: t.competition.code,
      compName: t.competition.name,
      tgs: t.competition.targetGroups.map(x => x.targetGroup),
      walkIn: false,
      contingentId: t.contingent.id,
      stateName: stateName(t.contingent),
      locality: t.contingent.locality ?? "NONE",
      teamPresent: isOnline || foreign || (individual ? indiv.size > 0 : counter),
      members: t.members.map(m => {
        const pid = addPerson(m.participant);
        return { pid, present: isOnline || foreign || (individual ? indiv.has(pid) : counter) };
      }),
      trainerIds: t.trainers.map(x => x.trainerId),
    };
    (isOnline ? onlineEntries : bersemuka).push(entry);
  }

  // Walk-ins: a team walk-in is one registration (anchored on one member) for the whole team.
  const seenWalkInTeams = new Set<string>();
  for (const w of walkIns) {
    if (w.team && seenWalkInTeams.has(`${w.walkInCompetition.id}:${w.team.id}`)) continue;
    if (w.team) seenWalkInTeams.add(`${w.walkInCompetition.id}:${w.team.id}`);
    const present = w.status === "CONFIRMED";
    const members = w.team && w.team.members.length
      ? w.team.members.map(m => addPerson(m.participant))
      : [addPerson(w.participant)];
    walkInEntries.push({
      teamKey: w.team ? `wt:${w.walkInCompetition.id}:${w.team.id}` : `w:${w.id}`,
      compKey: `w:${w.walkInCompetition.id}`,
      compCode: w.walkInCompetition.competition.code,
      compName: w.walkInCompetition.competition.name,
      tgs: w.walkInCompetition.competition.targetGroups.map(x => x.targetGroup),
      walkIn: true,
      contingentId: w.contingent.id,
      stateName: stateName(w.contingent),
      locality: w.contingent.locality ?? "NONE",
      teamPresent: present,
      members: members.map(pid => ({ pid, present })),
      trainerIds: w.team?.trainers.map(x => x.trainerId) ?? [],
    });
  }

  const b = buildMode("BERSEMUKA", bersemuka, people);
  const w = buildMode("WALKIN", walkInEntries, people);
  const o = buildMode("ONLINE", onlineEntries, people);

  const presentOf = (list: Entry[]) => new Set(list.flatMap(e => e.members.filter(m => m.present).map(m => m.pid)));
  const bP = new Set([...presentOf(bersemuka), ...presentOf(walkInEntries)]), oP = presentOf(onlineEntries);
  const presentEntries = [...bersemuka, ...walkInEntries, ...onlineEntries].filter(e => e.teamPresent);

  return {
    eventName: event.name,
    generatedAt: new Date().toISOString(),
    basis,
    overall: {
      participants: new Set([...bP, ...oP]).size,
      both: [...bP].filter(id => oP.has(id)).length,
      contingents: new Set(presentEntries.map(e => e.contingentId)).size,
      teams: presentEntries.length,
      trainers: new Set(presentEntries.flatMap(e => e.trainerIds)).size,
    },
    bersemuka: b,
    walkIn: w,
    online: o,
  };
}
