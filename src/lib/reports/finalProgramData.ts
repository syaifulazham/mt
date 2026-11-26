import { db } from "@/lib/db";

// ─── types ────────────────────────────────────────────────────────────────────

export type Level = "RENDAH" | "MENENGAH" | "BELIA";

export interface CompStat {
  code: string;
  name: string;
  teams: number;
  participants: number;
}

export interface StateStat {
  stateName: string;
  schoolC: number;
  rendahC: number;
  menengahC: number;
  beliaC: number;
  rTeams: number;
  mTeams: number;
  bTeams: number;
  totalTeams: number;
  participants: number;
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
  participants: number;
}

export interface WalkInStateCompGroup {
  stateName: string;
  comps: (WalkInCompStat & { level: Level })[];
}

/** Which competitions the report covers: on site (Bersemuka, with walk-ins) or online. */
export type ProgramMode = "BERSEMUKA" | "ONLINE";

export interface InternationalStat {
  participants: number;
  teams: number;
  /** Teams not accepted into the event that are still counted (international teams always count). */
  notAcceptedTeams: number;
  countries: { name: string; participants: number; teams: number }[];
}

export interface FinalProgramData {
  mode: ProgramMode;
  /** International participants included in this mode's figures. */
  international: InternationalStat;
  eventName: string;
  eventId: string;
  slug: string;
  locationLabel: string;
  regSummary: {
    rendahContingents: number;
    menengahContingents: number;
    schoolContingents: number;
    beliaContingents: number;
    schoolTeams: number;
    beliaTeams: number;
    schoolParticipants: number;
    beliaParticipants: number;
  };
  walkInSummary: {
    schoolParticipants: number;
    beliaParticipants: number;
    total: number;
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
  rendahComps: CompStat[];
  menengahComps: CompStat[];
  beliaComps: CompStat[];
  rendahParticipants: number;
  menengahParticipants: number;
  stateCompStats: StateCompGroup[];
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

function classifyLevel(targetGroups: { targetGroup: { schoolLevel: string } }[]): Level {
  const levels = targetGroups.map(tg => tg.targetGroup.schoolLevel.toUpperCase());
  if (levels.some(l => l.includes("PRIMARY"))) return "RENDAH";
  if (levels.some(l => l.includes("SECONDARY"))) return "MENENGAH";
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
    .filter(a => (mode === "ONLINE") === a.isOnline)
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
          targetGroups: { include: { targetGroup: { select: { schoolLevel: true } } } },
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
          participant: { select: { id: true, gender: true, ethnicity: true } },
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
      walkInCompetitionId: true,
      team: { select: { id: true, members: { select: { participant: { select: { id: true, gender: true, ethnicity: true } } } } } },
      walkInCompetition: {
        select: {
          competition: {
            select: {
              id: true, code: true, name: true,
              targetGroups: { include: { targetGroup: { select: { schoolLevel: true } } } },
            },
          },
        },
      },
      participant: { select: { id: true, gender: true, ethnicity: true } },
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
  const walkIns = walkInRegs.flatMap(w => {
    if (!w.team || !w.team.members.length) return [w];
    const k = `${w.walkInCompetitionId}:${w.team.id}`;
    if (seenWalkInTeams.has(k)) return [];
    seenWalkInTeams.add(k);
    return w.team.members.map(m => ({ ...w, participant: m.participant }));
  });

  // ── flat team data ────────────────────────────────────────────────────────
  type TD = {
    compId: string; compCode: string; compName: string; level: Level;
    contingentId: string; stateName: string;
    members: { id: string; gender: string; ethnicity: string | null }[];
  };

  const tds: TD[] = teams.map(t => ({
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
    })),
  }));

  const rendahTDs  = tds.filter(t => t.level === "RENDAH");
  const menengahTDs = tds.filter(t => t.level === "MENENGAH");
  const beliaTDs   = tds.filter(t => t.level === "BELIA");
  const schoolTDs  = [...rendahTDs, ...menengahTDs];

  // unique trainers of the teams that attended
  const trainerCount = new Set(teams.flatMap(t => t.trainers.map(tr => tr.trainerId))).size;

  const uniquePids = (list: TD[]) => new Set(list.flatMap(t => t.members.map(m => m.id)));
  const genderStat = (list: TD[], g: string) =>
    new Set(list.flatMap(t => t.members.filter(m => m.gender === g).map(m => m.id))).size;

  // summary
  const regSummary = {
    rendahContingents:  new Set(rendahTDs.map(t => t.contingentId)).size,
    menengahContingents: new Set(menengahTDs.map(t => t.contingentId)).size,
    schoolContingents:  new Set([...rendahTDs, ...menengahTDs].map(t => t.contingentId)).size,
    beliaContingents:   new Set(beliaTDs.map(t => t.contingentId)).size,
    schoolTeams:        schoolTDs.length,
    beliaTeams:         beliaTDs.length,
    schoolParticipants: uniquePids(schoolTDs).size,
    beliaParticipants:  uniquePids(beliaTDs).size,
  };

  // gender
  const schoolMale   = genderStat(schoolTDs, "MALE");
  const schoolFemale = genderStat(schoolTDs, "FEMALE");
  const beliaMale    = genderStat(beliaTDs, "MALE");
  const beliaFemale  = genderStat(beliaTDs, "FEMALE");

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
  const wiSchool = walkIns.filter(w => classifyLevel(w.walkInCompetition.competition.targetGroups) !== "BELIA");
  const wiBelia  = walkIns.filter(w => classifyLevel(w.walkInCompetition.competition.targetGroups) === "BELIA");
  const walkInSummary = {
    schoolParticipants: new Set(wiSchool.map(w => w.participant.id)).size,
    beliaParticipants:  new Set(wiBelia.map(w => w.participant.id)).size,
    total: new Set(walkIns.map(w => w.participant.id)).size,
  };

  // walk-in per competition
  const wiCompMap = new Map<string, { code: string; name: string; level: Level; pids: Set<string> }>();
  for (const w of walkIns) {
    const comp = w.walkInCompetition.competition;
    const level = classifyLevel(comp.targetGroups);
    if (!wiCompMap.has(comp.id))
      wiCompMap.set(comp.id, { code: comp.code, name: comp.name, level, pids: new Set() });
    wiCompMap.get(comp.id)!.pids.add(w.participant.id);
  }
  const allWiComps = [...wiCompMap.values()]
    .map(c => ({ code: c.code, name: c.name, level: c.level, participants: c.pids.size }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // walk-in gender
  const walkInSchoolMale   = new Set(wiSchool.filter(w => (w.participant.gender as string) === "MALE").map(w => w.participant.id)).size;
  const walkInSchoolFemale = new Set(wiSchool.filter(w => (w.participant.gender as string) === "FEMALE").map(w => w.participant.id)).size;
  const walkInBeliaMale    = new Set(wiBelia.filter(w => (w.participant.gender as string) === "MALE").map(w => w.participant.id)).size;
  const walkInBeliaFemale  = new Set(wiBelia.filter(w => (w.participant.gender as string) === "FEMALE").map(w => w.participant.id)).size;

  // walk-in ethnicity
  const wiEthn = new Map<string, Set<string>>();
  for (const w of walkIns) {
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
  const wiScMap = new Map<string, Map<string, { code: string; name: string; level: Level; pids: Set<string> }>>();
  for (const w of walkIns) {
    const comp = w.walkInCompetition.competition;
    const level = classifyLevel(comp.targetGroups);
    const stateName = getStateName(w.contingent);
    if (!wiScMap.has(stateName)) wiScMap.set(stateName, new Map());
    const byComp = wiScMap.get(stateName)!;
    if (!byComp.has(comp.id))
      byComp.set(comp.id, { code: comp.code, name: comp.name, level, pids: new Set() });
    byComp.get(comp.id)!.pids.add(w.participant.id);
  }
  const walkInStateCompStats: WalkInStateCompGroup[] = [...wiScMap.entries()]
    .map(([stateName, byComp]) => ({
      stateName,
      comps: [...byComp.values()]
        .map(c => ({ code: c.code, name: c.name, level: c.level, participants: c.pids.size }))
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
    rCIds: Set<string>; mCIds: Set<string>; bCIds: Set<string>;
    rTeams: number; mTeams: number; bTeams: number;
    pids: Set<string>; malePids: Set<string>; femalePids: Set<string>;
  }>();
  for (const t of tds) {
    if (!stateMap.has(t.stateName))
      stateMap.set(t.stateName, {
        rCIds: new Set(), mCIds: new Set(), bCIds: new Set(),
        rTeams: 0, mTeams: 0, bTeams: 0,
        pids: new Set(), malePids: new Set(), femalePids: new Set(),
      });
    const s = stateMap.get(t.stateName)!;
    if (t.level === "RENDAH")    { s.rCIds.add(t.contingentId); s.rTeams++; }
    else if (t.level === "MENENGAH") { s.mCIds.add(t.contingentId); s.mTeams++; }
    else                         { s.bCIds.add(t.contingentId); s.bTeams++; }
    t.members.forEach(m => {
      s.pids.add(m.id);
      if (m.gender === "MALE") s.malePids.add(m.id);
      else s.femalePids.add(m.id);
    });
  }
  const stateStats: StateStat[] = [...stateMap.entries()]
    .map(([stateName, s]) => ({
      stateName,
      schoolC:   new Set([...s.rCIds, ...s.mCIds]).size,
      rendahC:   s.rCIds.size,
      menengahC: s.mCIds.size,
      beliaC:    s.bCIds.size,
      rTeams:    s.rTeams,
      mTeams:    s.mTeams,
      bTeams:    s.bTeams,
      totalTeams: s.rTeams + s.mTeams + s.bTeams,
      participants: s.pids.size,
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

  return {
    mode,
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
    rendahComps:   allComps.filter(c => c.level === "RENDAH"),
    menengahComps: allComps.filter(c => c.level === "MENENGAH"),
    beliaComps:    allComps.filter(c => c.level === "BELIA"),
    rendahParticipants:   uniquePids(rendahTDs).size,
    menengahParticipants: uniquePids(menengahTDs).size,
    stateCompStats,
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

export const PROGRAM_MODE_LABEL: Record<ProgramMode, string> = { BERSEMUKA: "Bersemuka", ONLINE: "Dalam Talian" };

/** What the figures count, for the report header. */
export function programBasisNote(mode: ProgramMode): string {
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
