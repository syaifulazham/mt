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

export interface FinalProgramData {
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
  stateCompStats: StateCompGroup[];
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
}): string {
  return (
    contingent.state?.name ??
    contingent.school?.state?.name ??
    contingent.higherInstitution?.state?.name ??
    "Lain-lain"
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function computeFinalProgramData(eventId: string): Promise<FinalProgramData | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, name: true, slug: true,
      zone:  { select: { name: true } },
      state: { select: { name: true } },
    },
  });
  if (!event) return null;

  const teams = await db.team.findMany({
    where: {
      status: "ACTIVE",
      teamEvents: { some: { eventId, acceptance: "ACCEPT" } },
    },
    include: {
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

  const walkIns = await db.walkInRegistration.findMany({
    where: {
      status: { not: "REJECTED" },
      walkInCompetition: { eventId },
    },
    select: {
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
    },
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

  // unique trainers across all active event teams
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
    .sort((a, b) => a.stateName.localeCompare(b.stateName));

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
    .sort((a, b) => a.stateName.localeCompare(b.stateName));

  return {
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
    stateCompStats,
  };
}
