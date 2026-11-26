import { db } from "@/lib/db";

// ─── types ────────────────────────────────────────────────────────────────────

export type Level = "PRASEKOLAH" | "RENDAH" | "MENENGAH" | "BELIA";

export interface CompStat {
  code: string;
  name: string;
  teams: number;
  participants: number;
}

export interface StateStat {
  stateName: string;
  schoolC: number;
  /** Pra-sekolah contingents (also counted in schoolC). */
  prasekolahC: number;
  rendahC: number;
  menengahC: number;
  beliaC: number;
  rTeams: number;
  mTeams: number;
  bTeams: number;
  totalTeams: number;
  /** Unique participants: team members plus walk-ins not already in a team
   *  (the rows add up to uniqueParticipants). */
  participants: number;
  /** Of which walk-in participants not already counted as team participants. */
  walkInParticipants: number;
  male: number;
  female: number;
}

export interface StateCompGroup {
  stateName: string;
  comps: (CompStat & { level: Level })[];
}

export interface WalkInCompStat {
  code: string;
  name: string;
  /** Team walk-ins (0 for an individual competition). */
  teams: number;
  participants: number;
}

export interface WalkInStateCompGroup {
  stateName: string;
  comps: (WalkInCompStat & { level: Level })[];
}

/** Which competitions the report covers: on site (Bersemuka, with walk-ins), online, or both. */
export type ProgramMode = "BERSEMUKA" | "ONLINE" | "SEMUA";

export interface InternationalStat {
  participants: number;
  teams: number;
  /** Teams not accepted into the event that are still counted (international teams always count). */
  notAcceptedTeams: number;
  countries: { name: string; participants: number; teams: number }[];
}

export interface TeamSummary {
  prasekolahContingents: number;
  rendahContingents: number;
  menengahContingents: number;
  schoolContingents: number;
  beliaContingents: number;
  schoolTeams: number;
  beliaTeams: number;
  schoolParticipants: number;
  beliaParticipants: number;
  /** Participants by their own level — the Pelajar breakdown (Laporan Kehadiran Akhir's target groups). */
  prasekolahPax: number;
  rendahPax: number;
  menengahPax: number;
}

export interface FinalProgramData {
  mode: ProgramMode;
  /** International participants included in this mode's figures. */
  international: InternationalStat;
  eventName: string;
  eventId: string;
  slug: string;
  locationLabel: string;
  /** Bersemuka teams (or the mode's teams); in SEMUA the on-site teams only — onlineSummary has the rest. */
  regSummary: TeamSummary;
  /** SEMUA only: the Dalam Talian teams. */
  onlineSummary: TeamSummary | null;
  /** Unique participants of every counted team (in SEMUA: Bersemuka and Dalam Talian together). */
  teamParticipants: number;
  /** Unique participants of teams and walk-ins together — Laporan Kehadiran Akhir's "Peserta unik" in SEMUA. */
  uniqueParticipants: number;
  /** Participants of the Belia competitions (the education-level table's Belia total). */
  beliaCompParticipants: number;
  /** Walk-in participants who are not already counted as team participants — the
   *  walk-in part of the unique total (teamParticipants + this = uniqueParticipants).
   *  The Kaum and Jantina walk-in figures count only these. */
  walkInExtraParticipants: number;
  walkInSummary: {
    schoolParticipants: number;
    beliaParticipants: number;
    total: number;
    /** Team walk-ins (a team counts once, however its members registered). */
    schoolTeams: number;
    beliaTeams: number;
    teams: number;
    /** Walk-in entries — a team or an individual each count once; Laporan Kehadiran Akhir's "Pasukan / penyertaan". */
    entries: number;
  };
  schoolMale: number;
  schoolFemale: number;
  beliaMale: number;
  beliaFemale: number;
  ethnicityStats: {
    melayu: number;
    cina: number;
    india: number;
    orgAsli: number;
    lainLain: number;
    sabah: number;
    sarawak: number;
  };
  trainerCount: number;
  stateStats: StateStat[];
  prasekolahComps: CompStat[];
  rendahComps: CompStat[];
  menengahComps: CompStat[];
  beliaComps: CompStat[];
  prasekolahParticipants: number;
  rendahParticipants: number;
  menengahParticipants: number;
  stateCompStats: StateCompGroup[];
  walkInPrasekolahComps: WalkInCompStat[];
  walkInRendahComps: WalkInCompStat[];
  walkInMenengahComps: WalkInCompStat[];
  walkInBeliaComps: WalkInCompStat[];
  walkInEthnicityStats: {
    melayu: number; cina: number; india: number;
    orgAsli: number; sabah: number; sarawak: number; lainLain: number;
  };
  walkInSchoolMale: number;
  walkInSchoolFemale: number;
  walkInBeliaMale: number;
  walkInBeliaFemale: number;
  walkInMultiCompCount: number;
  multiTeamParticipantCount: number;
  walkInStateCompStats: WalkInStateCompGroup[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

type TgInfo = { targetGroup: { schoolLevel: string; classGrades: string[]; ppki: boolean } };
const LEVEL_OF: Record<string, Level> = { KINDERGARTEN: "PRASEKOLAH", PRIMARY: "RENDAH", SECONDARY: "MENENGAH" };

/**
 * The participant's own level, as Laporan Kehadiran Akhir counts them: the
 * competition's target group that fits the participant (PPKI, then class
 * grade), else its first. A competition open to several levels (e.g. 6.6O
 * Innovatech PPKI — Rendah, Menengah and Belia) thus splits by participant.
 */
function participantLevel(tgs: TgInfo[], p: { classGrade: string | null; ppki: boolean }): Level {
  if (!tgs.length) return "BELIA";
  const grade = (p.classGrade ?? "").trim().toLowerCase();
  const tg = tgs.find(t => t.targetGroup.ppki === p.ppki && t.targetGroup.classGrades.some(g => g.toLowerCase() === grade))
    ?? tgs.find(t => t.targetGroup.ppki === p.ppki)
    ?? tgs[0];
  return LEVEL_OF[tg.targetGroup.schoolLevel.toUpperCase()] ?? "BELIA";
}

function classifyLevel(targetGroups: { targetGroup: { schoolLevel: string } }[]): Level {
  const levels = targetGroups.map(tg => tg.targetGroup.schoolLevel.toUpperCase());
  if (levels.some(l => l.includes("PRIMARY"))) return "RENDAH";
  if (levels.some(l => l.includes("SECONDARY"))) return "MENENGAH";
  if (levels.some(l => l.includes("KINDERGARTEN"))) return "PRASEKOLAH";
  return "BELIA";
}

function getStateName(contingent: {
  state: { name: string } | null;
  school: { state: { name: string } | null } | null;
  higherInstitution: { state: { name: string } | null } | null;
  country?: { codeIso2: string; name: string } | null;
}): string {
  if (contingent.country && contingent.country.codeIso2 !== "MY") return `Antarabangsa (${contingent.country.name})`;
  return (
    contingent.state?.name ??
    contingent.school?.state?.name ??
    contingent.higherInstitution?.state?.name ??
    "Lain-lain"
  );
}

/** States alphabetically; international and unknown last. */
function byStateName(a: string, b: string): number {
  const last = (n: string) => Number(n.startsWith("Antarabangsa") || n === "Lain-lain");
  return last(a) - last(b) || a.localeCompare(b);
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function computeFinalProgramData(eventId: string, mode: ProgramMode = "BERSEMUKA"): Promise<FinalProgramData | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, name: true, slug: true,
      zone:  { select: { name: true } },
      state: { select: { name: true } },
    },
  });
  if (!event) return null;

  // Attendance-based, the same as Laporan Kehadiran Akhir (counter basis) and
  // Senarai Kehadiran Penyertaan, one mode at a time:
  // • BERSEMUKA — the event's on-site competitions (original row, isOnline
  //   false): an accepted, ACTIVE team counts when its contingent checked in at
  //   the main counter (TeamEvent.attendedAt); plus CONFIRMED walk-ins.
  // • ONLINE — competitions run "Dalam talian": no attendance is taken, so every
  //   accepted, ACTIVE team counts. No walk-ins.
  // International teams (foreign contingents registered for this event) always
  // count, accepted or not: they are not checked in at the counter. Trainers are
  // those of the teams that count.
  const anchors = await db.eventCompetition.findMany({
    where: { eventId, parentId: null },
    select: { competitionId: true, isOnline: true },
  });
  const onlineComp = new Set(anchors.filter(a => a.isOnline).map(a => a.competitionId));

  const modeComps = anchors
    .filter(a => mode === "SEMUA" || (mode === "ONLINE") === a.isOnline)
    .map(a => a.competitionId);

  const allTeams = await db.team.findMany({
    where: {
      status: "ACTIVE",
      competitionId: { in: modeComps },
      OR: [
        { teamEvents: { some: { eventId, acceptance: "ACCEPT" } } },
        { contingent: { internationalEventId: eventId, country: { codeIso2: { not: "MY" } } } },
      ],
    },
    include: {
      teamEvents: { where: { eventId }, select: { acceptance: true, attendedAt: true } },
      competition: {
        select: {
          id: true, code: true, name: true,
          targetGroups: { include: { targetGroup: { select: { schoolLevel: true, classGrades: true, ppki: true } } } },
        },
      },
      contingent: {
        select: {
          id: true,
          state: { select: { name: true } },
          school: { select: { state: { select: { name: true } } } },
          higherInstitution: { select: { state: { select: { name: true } } } },
          internationalEventId: true,
          country: { select: { codeIso2: true, name: true } },
        },
      },
      members: {
        select: {
          participant: { select: { id: true, gender: true, ethnicity: true, classGrade: true, ppki: true } },
        },
      },
      trainers: {
        select: { trainerId: true },
      },
    },
  });

  const isForeign = (t: (typeof allTeams)[number]) =>
    t.contingent.internationalEventId === eventId && !!t.contingent.country && t.contingent.country.codeIso2 !== "MY";
  const teams = allTeams.filter(t => {
    if (isForeign(t)) return true;
    const te = t.teamEvents.find(x => x.acceptance === "ACCEPT");
    if (!te) return false;
    return onlineComp.has(t.competitionId) || !!te.attendedAt;
  });

  const foreignTeams = teams.filter(isForeign);
  const byCountry = new Map<string, { pids: Set<string>; teams: number }>();
  for (const t of foreignTeams) {
    const name = t.contingent.country!.name;
    let c = byCountry.get(name);
    if (!c) { c = { pids: new Set(), teams: 0 }; byCountry.set(name, c); }
    c.teams++;
    for (const m of t.members) c.pids.add(m.participant.id);
  }
  const international: InternationalStat = {
    participants: new Set(foreignTeams.flatMap(t => t.members.map(m => m.participant.id))).size,
    teams: foreignTeams.length,
    notAcceptedTeams: foreignTeams.filter(t => !t.teamEvents.some(x => x.acceptance === "ACCEPT")).length,
    countries: [...byCountry.entries()]
      .map(([name, c]) => ({ name, participants: c.pids.size, teams: c.teams }))
      .sort((a, b) => b.participants - a.participants || a.name.localeCompare(b.name)),
  };

  // Walk-ins count once CONFIRMED; a team walk-in (one registration anchored on
  // one member) brings every member of the team.
  const walkInRegs = mode === "ONLINE" ? [] : await db.walkInRegistration.findMany({
    where: {
      status: "CONFIRMED",
      walkInCompetition: { eventId },
    },
    select: {
      id: true,
      walkInCompetitionId: true,
      team: { select: { id: true, trainers: { select: { trainerId: true } }, members: { select: { participant: { select: { id: true, gender: true, ethnicity: true, classGrade: true, ppki: true } } } } } },
      walkInCompetition: {
        select: {
          competition: {
            select: {
              id: true, code: true, name: true,
              targetGroups: { include: { targetGroup: { select: { schoolLevel: true, classGrades: true, ppki: true } } } },
            },
          },
        },
      },
      participant: { select: { id: true, gender: true, ethnicity: true, classGrade: true, ppki: true } },
      contingent: {
        select: {
          state: { select: { name: true } },
          school: { select: { state: { select: { name: true } } } },
          higherInstitution: { select: { state: { select: { name: true } } } },
        },
      },
    },
  });

  const seenWalkInTeams = new Set<string>();
  // entryKey: one per walk-in entry (a team, or an individual registration).
  const walkIns = walkInRegs.flatMap(w => {
    if (!w.team || !w.team.members.length) return [{ ...w, entryKey: `w:${w.id}`, isTeam: false }];
    const k = `${w.walkInCompetitionId}:${w.team.id}`;
    if (seenWalkInTeams.has(k)) return [];
    seenWalkInTeams.add(k);
    return w.team.members.map(m => ({ ...w, participant: m.participant, entryKey: `wt:${k}`, isTeam: true }));
  });
  const teamEntries = (list: typeof walkIns) => new Set(list.filter(w => w.isTeam).map(w => w.entryKey)).size;

  // ── flat team data ────────────────────────────────────────────────────────
  type TD = {
    online: boolean;
    compId: string; compCode: string; compName: string; level: Level;
    contingentId: string; stateName: string;
    /** level: the participant's own (participantLevel) — participant counts and gender use it. */
    members: { id: string; gender: string; ethnicity: string | null; level: Level }[];
  };

  const tds: TD[] = teams.map(t => ({
    online: onlineComp.has(t.competitionId),
    compId: t.competition.id,
    compCode: t.competition.code,
    compName: t.competition.name,
    level: classifyLevel(t.competition.targetGroups),
    contingentId: t.contingent.id,
    stateName: getStateName(t.contingent),
    members: t.members.map(m => ({
      id: m.participant.id,
      gender: m.participant.gender as string,
      ethnicity: m.participant.ethnicity as string | null,
      level: participantLevel(t.competition.targetGroups, m.participant),
    })),
  }));

  const prasekolahTDs = tds.filter(t => t.level === "PRASEKOLAH");
  const rendahTDs  = tds.filter(t => t.level === "RENDAH");
  const menengahTDs = tds.filter(t => t.level === "MENENGAH");
  const beliaTDs   = tds.filter(t => t.level === "BELIA");

  // unique trainers of the teams that attended (in SEMUA also of team walk-ins,
  // as Laporan Kehadiran Akhir's overall Jurulatih)
  const trainerCount = new Set([
    ...teams.flatMap(t => t.trainers.map(tr => tr.trainerId)),
    ...(mode === "SEMUA" ? walkIns.flatMap(w => w.team?.trainers.map(tr => tr.trainerId) ?? []) : []),
  ]).size;

  const uniquePids = (list: TD[]) => new Set(list.flatMap(t => t.members.map(m => m.id)));
  // Participants by their own level (Pelajar = every level but Belia).
  const allMembers = tds.flatMap(t => t.members);
  const paxAt = (pred: (l: Level) => boolean, g?: string) =>
    new Set(allMembers.filter(m => pred(m.level) && (!g || m.gender === g)).map(m => m.id)).size;
  const isSchool = (l: Level) => l !== "BELIA";
  const isBelia = (l: Level) => l === "BELIA";

  // summary — per group of teams (in SEMUA, on-site and online apart)
  const summarize = (list: TD[]): TeamSummary => {
    const at = (l: Level) => list.filter(t => t.level === l);
    const school = list.filter(t => t.level !== "BELIA");
    const members = list.flatMap(t => t.members);
    const pax = (pred: (l: Level) => boolean) => new Set(members.filter(m => pred(m.level)).map(m => m.id)).size;
    const contingents = (l: TD[]) => new Set(l.map(t => t.contingentId)).size;
    return {
      prasekolahContingents: contingents(at("PRASEKOLAH")),
      rendahContingents:  contingents(at("RENDAH")),
      menengahContingents: contingents(at("MENENGAH")),
      schoolContingents:  contingents(school),
      beliaContingents:   contingents(at("BELIA")),
      schoolTeams:        school.length,
      beliaTeams:         at("BELIA").length,
      schoolParticipants: pax(isSchool),
      beliaParticipants:  pax(isBelia),
      prasekolahPax:      pax(l => l === "PRASEKOLAH"),
      rendahPax:          pax(l => l === "RENDAH"),
      menengahPax:        pax(l => l === "MENENGAH"),
    };
  };
  const regSummary = summarize(mode === "SEMUA" ? tds.filter(t => !t.online) : tds);
  const onlineSummary = mode === "SEMUA" ? summarize(tds.filter(t => t.online)) : null;
  const teamPids = uniquePids(tds);

  // gender
  const schoolMale   = paxAt(isSchool, "MALE");
  const schoolFemale = paxAt(isSchool, "FEMALE");
  const beliaMale    = paxAt(isBelia, "MALE");
  const beliaFemale  = paxAt(isBelia, "FEMALE");

  // ethnicity
  const ethn = new Map<string, Set<string>>();
  for (const t of tds)
    for (const m of t.members) {
      const k = m.ethnicity ?? "LAIN_LAIN";
      if (!ethn.has(k)) ethn.set(k, new Set());
      ethn.get(k)!.add(m.id);
    }
  const ethnicityStats = {
    melayu:  ethn.get("MELAYU")?.size ?? 0,
    cina:    ethn.get("CINA")?.size ?? 0,
    india:   ethn.get("INDIA")?.size ?? 0,
    orgAsli: ethn.get("ORANG_ASLI_SEMENANJUNG")?.size ?? 0,
    lainLain: ethn.get("LAIN_LAIN")?.size ?? 0,
    sabah:   ethn.get("BUMIPUTRA_SABAH")?.size ?? 0,
    sarawak: ethn.get("BUMIPUTRA_SARAWAK")?.size ?? 0,
  };

  // walk-in
  const wiLevel = (w: (typeof walkIns)[number]) => participantLevel(w.walkInCompetition.competition.targetGroups, w.participant);
  const wiSchool = walkIns.filter(w => wiLevel(w) !== "BELIA");
  const wiBelia  = walkIns.filter(w => wiLevel(w) === "BELIA");
  const walkInSummary = {
    schoolParticipants: new Set(wiSchool.map(w => w.participant.id)).size,
    beliaParticipants:  new Set(wiBelia.map(w => w.participant.id)).size,
    total: new Set(walkIns.map(w => w.participant.id)).size,
    schoolTeams: teamEntries(wiSchool),
    beliaTeams:  teamEntries(wiBelia),
    teams:       teamEntries(walkIns),
    entries:     new Set(walkIns.map(w => w.entryKey)).size,
  };

  // walk-in per competition
  const wiCompMap = new Map<string, { code: string; name: string; level: Level; pids: Set<string>; teams: Set<string> }>();
  for (const w of walkIns) {
    const comp = w.walkInCompetition.competition;
    const level = classifyLevel(comp.targetGroups);
    if (!wiCompMap.has(comp.id))
      wiCompMap.set(comp.id, { code: comp.code, name: comp.name, level, pids: new Set(), teams: new Set() });
    wiCompMap.get(comp.id)!.pids.add(w.participant.id);
    if (w.isTeam) wiCompMap.get(comp.id)!.teams.add(w.entryKey);
  }
  const allWiComps = [...wiCompMap.values()]
    .map(c => ({ code: c.code, name: c.name, level: c.level, teams: c.teams.size, participants: c.pids.size }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // walk-in gender
  // Kaum and Jantina count each person once: a walk-in who is also a team
  // participant is already in the registered figures, so the walk-in figures
  // cover only the rest (registered + walk-in = uniqueParticipants).
  const wiExtra = walkIns.filter(w => !teamPids.has(w.participant.id));
  const wiExtraSchool = wiExtra.filter(w => wiLevel(w) !== "BELIA");
  const wiExtraBelia  = wiExtra.filter(w => wiLevel(w) === "BELIA" && !wiExtraSchool.some(s => s.participant.id === w.participant.id));
  const walkInExtraParticipants = new Set(wiExtra.map(w => w.participant.id)).size;
  const gCount = (list: typeof walkIns, g: string) => new Set(list.filter(w => (w.participant.gender as string) === g).map(w => w.participant.id)).size;
  const walkInSchoolMale   = gCount(wiExtraSchool, "MALE");
  const walkInSchoolFemale = gCount(wiExtraSchool, "FEMALE");
  const walkInBeliaMale    = gCount(wiExtraBelia, "MALE");
  const walkInBeliaFemale  = gCount(wiExtraBelia, "FEMALE");

  // walk-in ethnicity
  const wiEthn = new Map<string, Set<string>>();
  for (const w of wiExtra) {
    const k = (w.participant.ethnicity as string | null) ?? "LAIN_LAIN";
    if (!wiEthn.has(k)) wiEthn.set(k, new Set());
    wiEthn.get(k)!.add(w.participant.id);
  }
  const walkInEthnicityStats = {
    melayu:   wiEthn.get("MELAYU")?.size ?? 0,
    cina:     wiEthn.get("CINA")?.size ?? 0,
    india:    wiEthn.get("INDIA")?.size ?? 0,
    orgAsli:  wiEthn.get("ORANG_ASLI_SEMENANJUNG")?.size ?? 0,
    sabah:    wiEthn.get("BUMIPUTRA_SABAH")?.size ?? 0,
    sarawak:  wiEthn.get("BUMIPUTRA_SARAWAK")?.size ?? 0,
    lainLain: wiEthn.get("LAIN_LAIN")?.size ?? 0,
  };

  // walk-in multi-competition participants
  const wiCompPerPax = new Map<string, number>();
  for (const w of walkIns)
    wiCompPerPax.set(w.participant.id, (wiCompPerPax.get(w.participant.id) ?? 0) + 1);
  const walkInMultiCompCount = [...wiCompPerPax.values()].filter(c => c > 1).length;

  // walk-in state × competition
  const wiScMap = new Map<string, Map<string, { code: string; name: string; level: Level; pids: Set<string>; teams: Set<string> }>>();
  for (const w of walkIns) {
    const comp = w.walkInCompetition.competition;
    const level = classifyLevel(comp.targetGroups);
    const stateName = getStateName(w.contingent);
    if (!wiScMap.has(stateName)) wiScMap.set(stateName, new Map());
    const byComp = wiScMap.get(stateName)!;
    if (!byComp.has(comp.id))
      byComp.set(comp.id, { code: comp.code, name: comp.name, level, pids: new Set(), teams: new Set() });
    byComp.get(comp.id)!.pids.add(w.participant.id);
    if (w.isTeam) byComp.get(comp.id)!.teams.add(w.entryKey);
  }
  const walkInStateCompStats: WalkInStateCompGroup[] = [...wiScMap.entries()]
    .map(([stateName, byComp]) => ({
      stateName,
      comps: [...byComp.values()]
        .map(c => ({ code: c.code, name: c.name, level: c.level, teams: c.teams.size, participants: c.pids.size }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => byStateName(a.stateName, b.stateName));

  // registered participants in more than one team
  const teamsPerPax = new Map<string, number>();
  for (const t of tds)
    for (const m of t.members)
      teamsPerPax.set(m.id, (teamsPerPax.get(m.id) ?? 0) + 1);
  const multiTeamParticipantCount = [...teamsPerPax.values()].filter(c => c > 1).length;

  // competition stats
  const compMap = new Map<string, { code: string; name: string; level: Level; teams: number; pids: Set<string> }>();
  for (const t of tds) {
    if (!compMap.has(t.compId))
      compMap.set(t.compId, { code: t.compCode, name: t.compName, level: t.level, teams: 0, pids: new Set() });
    const c = compMap.get(t.compId)!;
    c.teams++;
    t.members.forEach(m => c.pids.add(m.id));
  }
  const allComps = [...compMap.values()]
    .map(c => ({ code: c.code, name: c.name, level: c.level, teams: c.teams, participants: c.pids.size }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // state stats
  const stateMap = new Map<string, {
    pCIds: Set<string>; rCIds: Set<string>; mCIds: Set<string>; bCIds: Set<string>;
    pTeams: number; rTeams: number; mTeams: number; bTeams: number;
    pids: Set<string>; malePids: Set<string>; femalePids: Set<string>;
  }>();
  for (const t of tds) {
    if (!stateMap.has(t.stateName))
      stateMap.set(t.stateName, {
        pCIds: new Set(), rCIds: new Set(), mCIds: new Set(), bCIds: new Set(),
        pTeams: 0, rTeams: 0, mTeams: 0, bTeams: 0,
        pids: new Set(), malePids: new Set(), femalePids: new Set(),
      });
    const s = stateMap.get(t.stateName)!;
    if (t.level === "PRASEKOLAH") { s.pCIds.add(t.contingentId); s.pTeams++; }
    else if (t.level === "RENDAH")    { s.rCIds.add(t.contingentId); s.rTeams++; }
    else if (t.level === "MENENGAH") { s.mCIds.add(t.contingentId); s.mTeams++; }
    else                         { s.bCIds.add(t.contingentId); s.bTeams++; }
    t.members.forEach(m => {
      s.pids.add(m.id);
      if (m.gender === "MALE") s.malePids.add(m.id);
      else s.femalePids.add(m.id);
    });
  }
  // Walk-ins not already counted as team participants join their contingent's
  // state, so the Peserta column adds up to the unique total.
  const wiStatePids = new Map<string, Set<string>>();
  for (const w of wiExtra) {
    const stateName = getStateName(w.contingent);
    if (!stateMap.has(stateName))
      stateMap.set(stateName, {
        pCIds: new Set(), rCIds: new Set(), mCIds: new Set(), bCIds: new Set(),
        pTeams: 0, rTeams: 0, mTeams: 0, bTeams: 0,
        pids: new Set(), malePids: new Set(), femalePids: new Set(),
      });
    const s = stateMap.get(stateName)!;
    const pid = w.participant.id;
    s.pids.add(pid);
    if ((w.participant.gender as string) === "MALE") s.malePids.add(pid);
    else s.femalePids.add(pid);
    if (!wiStatePids.has(stateName)) wiStatePids.set(stateName, new Set());
    wiStatePids.get(stateName)!.add(pid);
  }
  const stateStats: StateStat[] = [...stateMap.entries()]
    .map(([stateName, s]) => ({
      stateName,
      schoolC:   new Set([...s.pCIds, ...s.rCIds, ...s.mCIds]).size,
      prasekolahC: s.pCIds.size,
      rendahC:   s.rCIds.size,
      menengahC: s.mCIds.size,
      beliaC:    s.bCIds.size,
      rTeams:    s.rTeams,
      mTeams:    s.mTeams,
      bTeams:    s.bTeams,
      totalTeams: s.pTeams + s.rTeams + s.mTeams + s.bTeams,
      participants: s.pids.size,
      walkInParticipants: wiStatePids.get(stateName)?.size ?? 0,
      male:  s.malePids.size,
      female: s.femalePids.size,
    }))
    .sort((a, b) => byStateName(a.stateName, b.stateName));

  // state × competition
  const scMap = new Map<string, Map<string, { code: string; name: string; level: Level; teams: number; pids: Set<string> }>>();
  for (const t of tds) {
    if (!scMap.has(t.stateName)) scMap.set(t.stateName, new Map());
    const byComp = scMap.get(t.stateName)!;
    if (!byComp.has(t.compId))
      byComp.set(t.compId, { code: t.compCode, name: t.compName, level: t.level, teams: 0, pids: new Set() });
    const c = byComp.get(t.compId)!;
    c.teams++;
    t.members.forEach(m => c.pids.add(m.id));
  }
  const stateCompStats: StateCompGroup[] = [...scMap.entries()]
    .map(([stateName, byComp]) => ({
      stateName,
      comps: [...byComp.values()]
        .map(c => ({ code: c.code, name: c.name, level: c.level, teams: c.teams, participants: c.pids.size }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => byStateName(a.stateName, b.stateName));

  const uniqueParticipants = new Set([...teamPids, ...walkIns.map(w => w.participant.id)]).size;

  return {
    mode,
    onlineSummary,
    teamParticipants: teamPids.size,
    uniqueParticipants,
    walkInExtraParticipants,
    beliaCompParticipants: uniquePids(beliaTDs).size,
    international,
    eventName:   event.name,
    eventId:     event.id,
    slug:        event.slug,
    locationLabel: event.zone?.name ?? event.state?.name ?? event.name.toUpperCase(),
    regSummary,
    walkInSummary,
    trainerCount,
    schoolMale, schoolFemale, beliaMale, beliaFemale,
    ethnicityStats,
    stateStats,
    prasekolahComps: allComps.filter(c => c.level === "PRASEKOLAH"),
    rendahComps:   allComps.filter(c => c.level === "RENDAH"),
    menengahComps: allComps.filter(c => c.level === "MENENGAH"),
    beliaComps:    allComps.filter(c => c.level === "BELIA"),
    prasekolahParticipants: uniquePids(prasekolahTDs).size,
    rendahParticipants:   uniquePids(rendahTDs).size,
    menengahParticipants: uniquePids(menengahTDs).size,
    stateCompStats,
    walkInPrasekolahComps: allWiComps.filter(c => c.level === "PRASEKOLAH"),
    walkInRendahComps:   allWiComps.filter(c => c.level === "RENDAH"),
    walkInMenengahComps: allWiComps.filter(c => c.level === "MENENGAH"),
    walkInBeliaComps:    allWiComps.filter(c => c.level === "BELIA"),
    walkInEthnicityStats,
    walkInSchoolMale, walkInSchoolFemale,
    walkInBeliaMale, walkInBeliaFemale,
    walkInMultiCompCount,
    multiTeamParticipantCount,
    walkInStateCompStats,
  };
}

// ─── report wording (page + Word) ─────────────────────────────────────────────

export const PROGRAM_MODE_LABEL: Record<ProgramMode, string> = { BERSEMUKA: "Bersemuka", ONLINE: "Dalam Talian", SEMUA: "Semua (Bersemuka + Dalam Talian)" };

/** What the figures count, for the report header. */
export function programBasisNote(mode: ProgramMode): string {
  if (mode === "SEMUA")
    return "Semua pertandingan: Bersemuka (pasukan yang daftar masuk di kaunter dan walk-in yang disahkan) dan Dalam Talian (semua pasukan yang diterima). " +
      "Jumlah keseluruhan ialah peserta unik — seorang peserta yang menyertai lebih daripada satu kategori dikira sekali — sepadan dengan \u201cPeserta unik\u201d Laporan Kehadiran Akhir.";
  return mode === "ONLINE"
    ? "Pertandingan Dalam Talian: kehadiran tidak diambil, maka semua pasukan yang diterima dikira. Sepadan dengan bahagian Dalam Talian Laporan Kehadiran Akhir."
    : "Pertandingan Bersemuka, berdasarkan kehadiran: pasukan yang daftar masuk di kaunter dan walk-in yang disahkan. Sepadan dengan bahagian Bersemuka dan Walk-in Laporan Kehadiran Akhir (mod Kaunter) serta Senarai Kehadiran Penyertaan.";
}

/** The international-participants note, or null when there are none in this mode. */
export function internationalNote(i: InternationalStat): string | null {
  if (!i.participants) return null;
  const countries = i.countries.map(c => `${c.name} ${c.participants}`).join(", ");
  return `Termasuk ${i.participants.toLocaleString("en-MY")} peserta antarabangsa (${i.teams} pasukan — ${countries}). ` +
    "Peserta antarabangsa tidak daftar masuk di kaunter, maka semuanya dikira hadir" +
    (i.notAcceptedTeams ? `, termasuk ${i.notAcceptedTeams} pasukan yang belum diterima dalam acara` : "") +
    ". Mereka disenaraikan di bawah negeri “Antarabangsa (negara)”.";
}
