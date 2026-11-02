import { db } from "@/lib/db";

// Participation by school level ("Participation → School Level"), on the same
// base as the organizer dashboard's "Total Participation": an *eligibility*
// count. For every competition, each participant whose education level matches
// one of its target groups (and, for PPKI-only groups, who is PPKI) is one
// participation — whether or not they registered in a team. Restricted here to
// SCHOOL contingents. A participant has one education level, so each
// participation belongs to exactly one level and levels add up to the total.
//
// The eligibility pass is heavy (~1.5 M participations per school level), so it
// runs one level at a time and the page loads them in turn.

export const SCHOOL_LEVEL_DIMENSIONS = ["state", "schoolCategory", "ethnicity", "gender"] as const;
export type SchoolLevelDimension = (typeof SCHOOL_LEVEL_DIMENSIONS)[number];
export type LevelBreakdown = Record<SchoolLevelDimension, { label: string; count: number }[]>;

export type LevelCompetition = {
  id: string; code: string; name: string;
  schools: number; participations: number; male: number; female: number;
};

export type SchoolLevelResult = {
  level: string;
  competitions: LevelCompetition[];
  schools: number;          // distinct schools with eligible participants
  participations: number;
  male: number;
  female: number;
  breakdown: LevelBreakdown;
  ms: number;               // processing time, shown on the page
};

export type SchoolLevelOverview = {
  levels: { level: string; label: string; competitions: number; participants: number }[];
  /** Distinct schools across all levels (a school is counted once). */
  schools: number;
};

export const LEVEL_LABEL: Record<string, string> = {
  KINDERGARTEN: "Pra-Sekolah",
  PRIMARY:      "Sekolah Rendah",
  SECONDARY:    "Sekolah Menengah",
  YOUTH:        "Belia",
  HIGHER:       "Pengajian Tinggi",
};
const LEVEL_ORDER = Object.keys(LEVEL_LABEL);

const ETHNICITY_LABEL: Record<string, string> = {
  MELAYU: "Melayu", CINA: "Cina", INDIA: "India", ORANG_ASLI_SEMENANJUNG: "Orang Asli",
  BUMIPUTRA_SABAH: "Bumiputra Sabah", BUMIPUTRA_SARAWAK: "Bumiputra Sarawak", LAIN_LAIN: "Lain-lain",
};
const GENDER_LABEL: Record<string, string> = { MALE: "Lelaki", FEMALE: "Perempuan" };

function label(dim: SchoolLevelDimension, raw: string | null) {
  if (raw == null || raw === "") return dim === "state" ? "Tiada negeri" : "Tidak dinyatakan";
  if (dim === "ethnicity") return ETHNICITY_LABEL[raw] ?? raw;
  if (dim === "gender") return GENDER_LABEL[raw] ?? raw;
  return raw;
}

// Eligible (competition, participant) pairs of school contingents — the
// dashboard's eligibility rule: same level as a target group, PPKI groups need PPKI.
const SCHOOL_PARTICIPANTS = `
  FROM contestants p
  JOIN contingents ct ON ct.id = p."contingentId" AND ct."contingentType" = 'SCHOOL'
  JOIN schools s      ON s.id = ct."schoolId"`;

/** Levels that have competitions, with competition and participant counts (fast). */
export async function getSchoolLevelOverview(): Promise<SchoolLevelOverview> {
  const [comps, people, schools] = await Promise.all([
    db.$queryRawUnsafe<{ lvl: string; n: number }[]>(`
      SELECT upper(tg."schoolLevel") AS lvl, COUNT(DISTINCT ctg."competitionId")::int AS n
      FROM competition_target_groups ctg JOIN target_groups tg ON tg.id = ctg."targetGroupId"
      JOIN competitions c ON c.id = ctg."competitionId" AND c."includeInDashboardStats"
      GROUP BY 1`),
    db.$queryRawUnsafe<{ lvl: string; n: number }[]>(`
      SELECT upper(p."eduLevel"::text) AS lvl, COUNT(*)::int AS n ${SCHOOL_PARTICIPANTS} GROUP BY 1`),
    db.$queryRawUnsafe<{ n: number }[]>(`
      SELECT COUNT(DISTINCT s.id)::int AS n ${SCHOOL_PARTICIPANTS}
      WHERE EXISTS (
        SELECT 1 FROM target_groups tg JOIN competition_target_groups ctg ON ctg."targetGroupId" = tg.id
        JOIN competitions c ON c.id = ctg."competitionId" AND c."includeInDashboardStats"
        WHERE upper(tg."schoolLevel") = upper(p."eduLevel"::text) AND (NOT tg.ppki OR p.ppki))`),
  ]);
  const peopleBy = new Map(people.map(r => [r.lvl, r.n]));
  return {
    levels: comps
      .sort((a, b) => (LEVEL_ORDER.indexOf(a.lvl) + 1 || 99) - (LEVEL_ORDER.indexOf(b.lvl) + 1 || 99))
      .map(r => ({ level: r.lvl, label: LEVEL_LABEL[r.lvl] ?? r.lvl, competitions: r.n, participants: peopleBy.get(r.lvl) ?? 0 })),
    schools: schools[0]?.n ?? 0,
  };
}

// School-contingent participants, grouped by (education level, PPKI) — the only
// attributes eligibility looks at. Each group carries its counts, so a
// competition's figures are sums over the (at most two) groups it admits.
type Group = {
  level: string; ppki: boolean;
  n: number; male: number; female: number;
  schools: Set<string>;
  dims: Record<SchoolLevelDimension, Map<string, number>>;
};

let groupsCache: { at: number; groups: Group[] } | null = null;
const CACHE_MS = 60_000; // the page loads its levels one after another

async function participantGroups(): Promise<Group[]> {
  if (groupsCache && Date.now() - groupsCache.at < CACHE_MS) return groupsCache.groups;
  const rows = await db.$queryRawUnsafe<{
    lvl: string; ppki: boolean; sid: string; gender: string | null; ethnicity: string | null;
    category: string | null; state: string | null;
  }[]>(`
    SELECT upper(p."eduLevel"::text) AS lvl, p.ppki, s.id AS sid, p.gender::text AS gender,
           p.ethnicity::text AS ethnicity, s.category::text AS category, st.name AS state
    ${SCHOOL_PARTICIPANTS}
    LEFT JOIN states st ON st.id = s."stateId"`);
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.lvl}:${r.ppki}`;
    let g = map.get(key);
    if (!g) {
      g = { level: r.lvl, ppki: !!r.ppki, n: 0, male: 0, female: 0, schools: new Set(),
            dims: { state: new Map(), schoolCategory: new Map(), ethnicity: new Map(), gender: new Map() } };
      map.set(key, g);
    }
    g.n++;
    if (r.gender === "MALE") g.male++; else if (r.gender === "FEMALE") g.female++;
    g.schools.add(r.sid);
    const vals: Record<SchoolLevelDimension, string | null> = {
      state: r.state, schoolCategory: r.category, ethnicity: r.ethnicity, gender: r.gender,
    };
    for (const d of SCHOOL_LEVEL_DIMENSIONS) {
      const l = label(d, vals[d]);
      g.dims[d].set(l, (g.dims[d].get(l) ?? 0) + 1);
    }
  }
  groupsCache = { at: Date.now(), groups: [...map.values()] };
  return groupsCache.groups;
}

/** One school level: per-competition counts, totals and breakdowns (eligibility pass). */
export async function getSchoolLevelResult(level: string): Promise<SchoolLevelResult> {
  const t0 = Date.now();
  const lvl = level.toUpperCase();
  const [competitions, allGroups] = await Promise.all([
    db.competition.findMany({
      where:   {
        includeInDashboardStats: true, // Competitions → Dashboard Stats, as on the dashboard
        targetGroups: { some: { targetGroup: { schoolLevel: { equals: lvl, mode: "insensitive" } } } },
      },
      select:  { id: true, code: true, name: true, targetGroups: { select: { targetGroup: { select: { schoolLevel: true, ppki: true } } } } },
      orderBy: { code: "asc" },
    }),
    participantGroups(),
  ]);
  const groups = allGroups.filter(g => g.level === lvl);

  // Dashboard rule: a participant is eligible if a target group has their level,
  // and a PPKI-only group admits PPKI participants only.
  const admits = (c: (typeof competitions)[number], g: Group) =>
    c.targetGroups.some(t => t.targetGroup.schoolLevel.toUpperCase() === lvl && (!t.targetGroup.ppki || g.ppki));

  const levelSchools = new Set<string>();
  const dimTotals: Record<SchoolLevelDimension, Map<string, number>> = {
    state: new Map(), schoolCategory: new Map(), ethnicity: new Map(), gender: new Map(),
  };
  let participations = 0, male = 0, female = 0;

  const rows = competitions.map((c): LevelCompetition => {
    const eligible = groups.filter(g => admits(c, g));
    const schools = new Set<string>();
    let n = 0, m = 0, f = 0;
    for (const g of eligible) {
      n += g.n; m += g.male; f += g.female;
      for (const s of g.schools) { schools.add(s); levelSchools.add(s); }
      for (const d of SCHOOL_LEVEL_DIMENSIONS)
        for (const [k, v] of g.dims[d]) dimTotals[d].set(k, (dimTotals[d].get(k) ?? 0) + v);
    }
    participations += n; male += m; female += f;
    return { id: c.id, code: c.code, name: c.name, schools: schools.size, participations: n, male: m, female: f };
  });

  const breakdown = Object.fromEntries(SCHOOL_LEVEL_DIMENSIONS.map(d => [
    d, [...dimTotals[d].entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  ])) as LevelBreakdown;

  return {
    level: lvl, competitions: rows,
    schools: levelSchools.size, participations, male, female, breakdown,
    ms: Date.now() - t0,
  };
}
