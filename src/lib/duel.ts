/**
 * Duel competitions (Robot Tempur, Robot Sumo…): pure logic, no database.
 *
 * Teams are drawn into sessions of at most `perSession`. Each session is ranked
 * 1…n and earns points 1st = n … last = 1; the top `advance` ranks of every
 * session go on to the next round, until the entrants fit in one session — the
 * final. Final standings are the points summed over every round
 * (src/lib/duel-server.ts loads the rows; this file only computes).
 */
import type { SharedRankMode } from "@/lib/sharedRank";
import { EMPTY_SCORECARD, parseScorecard, type Scorecard } from "@/lib/duel-scorecard";

/** NATIONAL: one bracket for everyone. STATE: each state runs its own bracket and standings. */
export type DuelScope = "NATIONAL" | "STATE";

/**
 * ELIMINATION: sessions of `perSession`, top `advance` go on, round after round.
 * LEAGUE (1 vs 1 only): a round-robin group stage, then a seeded knockout of
 * the top `groupAdvance` of every group.
 */
export type DuelFormat = "ELIMINATION" | "LEAGUE";

export type DuelConfig = {
  scope: DuelScope;
  format: DuelFormat;
  perSession: number;
  advance: number;
  /** LEAGUE: teams per group, how many of each group reach the knockout, and whether a group match can end level. */
  groupSize: number;
  groupAdvance: number;
  allowDraw: boolean;
  arenas: number;
  durationSec: number;
  breakSec: number;
  /** Per-duel scorecard (src/lib/duel-scorecard.ts); when enabled, results are entered on it. */
  scorecard: Scorecard;
};

export const DUEL_DEFAULTS: DuelConfig = {
  scope: "NATIONAL", format: "ELIMINATION", perSession: 4, advance: 2,
  groupSize: 4, groupAdvance: 2, allowDraw: true,
  arenas: 2, durationSec: 180, breakSec: 60,
  scorecard: EMPTY_SCORECARD,
};

/** Group-stage match points. */
export const LEAGUE_POINTS = { win: 3, draw: 1, loss: 0 } as const;

export type DuelSplit = "even" | "fill";

const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

/** Config with defaults, clamped to sane ranges; `advance` is below `perSession`. */
export function parseDuelConfig(json: unknown): DuelConfig {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const perSession = int(o.perSession, 2, 32, DUEL_DEFAULTS.perSession);
  const groupSize = int(o.groupSize, 3, 16, DUEL_DEFAULTS.groupSize);
  return {
    scope: o.scope === "STATE" ? "STATE" : "NATIONAL",
    // A league is 1 vs 1 matches; with bigger sessions it falls back to elimination.
    format: o.format === "LEAGUE" && perSession === 2 ? "LEAGUE" : "ELIMINATION",
    perSession,
    advance: int(o.advance, 1, perSession - 1, Math.min(DUEL_DEFAULTS.advance, perSession - 1)),
    groupSize,
    groupAdvance: int(o.groupAdvance, 1, groupSize - 1, Math.min(DUEL_DEFAULTS.groupAdvance, groupSize - 1)),
    allowDraw: o.allowDraw !== false,
    arenas: int(o.arenas, 1, 20, DUEL_DEFAULTS.arenas),
    durationSec: int(o.durationSec, 10, 4 * 3600, DUEL_DEFAULTS.durationSec),
    breakSec: int(o.breakSec, 0, 3600, DUEL_DEFAULTS.breakSec),
    scorecard: parseScorecard(o.scorecard),
  };
}


/** Session sizes for n teams: "even" 13/4 → 4,3,3,3; "fill" 13/4 → 4,4,4,1. */
export function sessionSizes(n: number, perSession: number, split: DuelSplit): number[] {
  if (n <= 0) return [];
  const k = Math.ceil(n / perSession);
  if (split === "fill") {
    const sizes = Array(Math.floor(n / perSession)).fill(perSession);
    if (n % perSession) sizes.push(n % perSession);
    return sizes;
  }
  const base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

export type DrawTeam = { id: string; contingentId: string | null; stateId: string | null };
export type ClashRules = { noSameContingent: boolean; noSameState: boolean };
export type Clash = { session: number; kind: "contingent" | "state"; teamIds: string[] };

/** Same-contingent / same-state groups inside each session (only for the rules switched on). */
export function findClashes(sessions: string[][], byId: Map<string, DrawTeam>, rules: ClashRules): Clash[] {
  const out: Clash[] = [];
  sessions.forEach((ids, session) => {
    const check = (kind: Clash["kind"], key: (t: DrawTeam) => string | null) => {
      const groups = new Map<string, string[]>();
      for (const id of ids) {
        const t = byId.get(id);
        const k = t && key(t);
        if (k) groups.set(k, [...(groups.get(k) ?? []), id]);
      }
      for (const g of groups.values()) if (g.length > 1) out.push({ session, kind, teamIds: g });
    };
    if (rules.noSameContingent) check("contingent", t => t.contingentId);
    if (rules.noSameState) check("state", t => t.stateId);
  });
  return out;
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * A random draw into sessions sized by `split`, avoiding the clash rules when
 * possible. Tries up to `attempts` shuffles and keeps the one with fewest
 * clashes; `clashes` lists what could not be avoided.
 */
export function drawSessions(
  teams: DrawTeam[],
  opts: ClashRules & { perSession: number; split: DuelSplit; attempts?: number; random?: () => number },
): { sessions: string[][]; clashes: Clash[] } {
  const sizes = sessionSizes(teams.length, opts.perSession, opts.split);
  const rnd = opts.random ?? Math.random;
  const byId = new Map(teams.map(t => [t.id, t]));
  const rules = { noSameContingent: opts.noSameContingent, noSameState: opts.noSameState };
  const conflicts = (a: DrawTeam, b: DrawTeam) =>
    (rules.noSameContingent && !!a.contingentId && a.contingentId === b.contingentId) ||
    (rules.noSameState && !!a.stateId && a.stateId === b.stateId);

  // Largest clash groups first, so they are spread before the sessions fill.
  const groupSize = (t: DrawTeam) => teams.filter(o => conflicts(t, o)).length;
  let best: { sessions: string[][]; clashes: Clash[] } | null = null;
  const attempts = rules.noSameContingent || rules.noSameState ? (opts.attempts ?? 200) : 1;

  for (let a = 0; a < attempts; a++) {
    const order = shuffle(teams, rnd).sort((x, y) => groupSize(y) - groupSize(x));
    const sessions: DrawTeam[][] = sizes.map(() => []);
    for (const t of order) {
      const open = sessions.map((s, i) => ({ s, i })).filter(({ s, i }) => s.length < sizes[i]);
      const score = ({ s, i }: { s: DrawTeam[]; i: number }) => s.filter(o => conflicts(t, o)).length * 1000 - (sizes[i] - s.length);
      const min = Math.min(...open.map(score));
      const pick = shuffle(open.filter(o => score(o) === min), rnd)[0];
      pick.s.push(t);
    }
    const ids = sessions.map(s => s.map(t => t.id));
    const clashes = findClashes(ids, byId, rules);
    if (!best || clashes.length < best.clashes.length) best = { sessions: ids, clashes };
    if (clashes.length === 0) break;
  }
  return best ?? { sessions: [], clashes: [] };
}

/** Session letters: A…Z, AA, AB… */
export function sessionLetter(i: number): string {
  let s = "", n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Arena and wave per session, with estimated start times. Each session goes to
 * the arena with the fewest sessions queued (`queued[i]` = sessions already
 * waiting on arena i + 1, e.g. another state's bracket), so with empty arenas
 * session i → arena i % arenas + 1.
 */
export function scheduleRound(
  count: number, cfg: Pick<DuelConfig, "arenas" | "durationSec" | "breakSec">, startAt: Date | null, queued: number[] = [],
) {
  const load = Array.from({ length: cfg.arenas }, (_, i) => queued[i] ?? 0);
  return Array.from({ length: count }, () => {
    const a = load.indexOf(Math.min(...load));
    const wave = load[a]++;
    return {
      arena: a + 1,
      wave,
      scheduledAt: startAt ? new Date(startAt.getTime() + wave * (cfg.durationSec + cfg.breakSec) * 1000) : null,
    };
  });
}

/** Rank points: 1st of n = n, last = 1. */
export const pointsFor = (rank: number, n: number) => Math.max(0, n - rank + 1);

/** Milliseconds left on a session's clock (0 when over). */
export function remainingMs(
  s: { startedAt: Date | string | null; pausedAt: Date | string | null; pausedMs: number; endedAt: Date | string | null },
  durationSec: number, now: number = Date.now(),
): number {
  if (!s.startedAt) return durationSec * 1000;
  const t = (d: Date | string) => new Date(d).getTime();
  const until = s.endedAt ? t(s.endedAt) : s.pausedAt ? t(s.pausedAt) : now;
  const elapsed = until - t(s.startedAt) - s.pausedMs;
  return Math.max(0, durationSec * 1000 - elapsed);
}

export type StandingRound = {
  number: number; isFinal: boolean; stage?: string;
  sessions: { pool?: string | null; status?: string; entries: { teamId: string; rank: number | null; points: number | null }[] }[];
};

export type LeagueRecord = { pool: string; played: number; won: number; drawn: number; lost: number; points: number };

export type Standing = {
  teamId: string; position: number; total: number; reached: number;
  finalRank: number | null; perRound: Record<number, number | null>;
  /** Rank in each round (knockout: 1 = won the match). */
  ranks: Record<number, number | null>;
  /** LEAGUE format: the team's group-stage record. */
  league?: LeagueRecord;
};

/**
 * Points summed over every round. Ties: furthest round reached, then rank in
 * the final, then rank in the team's last round. Equal on all of these share
 * a position.
 */
export function duelStandings(rounds: StandingRound[], mode: SharedRankMode = "SKIP"): Standing[] {
  if (rounds.some(r => r.stage === "GROUP")) return leagueStandings(rounds, mode);
  const map = new Map<string, Standing & { lastRank: number | null }>();
  for (const r of [...rounds].sort((a, b) => a.number - b.number)) {
    for (const s of r.sessions) for (const e of s.entries) {
      const row = map.get(e.teamId) ?? { teamId: e.teamId, position: 0, total: 0, reached: 0, finalRank: null, perRound: {}, ranks: {}, lastRank: null };
      row.total += e.points ?? 0;
      row.reached = Math.max(row.reached, r.number);
      row.perRound[r.number] = e.points;
      row.ranks[r.number] = e.rank;
      row.lastRank = e.rank;
      if (r.isFinal) row.finalRank = e.rank;
      map.set(e.teamId, row);
    }
  }
  const nz = (v: number | null) => v ?? Number.MAX_SAFE_INTEGER;
  const cmp = (a: Standing & { lastRank: number | null }, b: Standing & { lastRank: number | null }) =>
    b.total - a.total || b.reached - a.reached || nz(a.finalRank) - nz(b.finalRank) || nz(a.lastRank) - nz(b.lastRank);
  const rows = [...map.values()].sort(cmp);
  // Equal rows share a position; the event's sharedRankMode decides 1, 2, 2, 4 or 1, 2, 2, 3.
  rows.forEach((r, i) => {
    r.position = i === 0 ? 1 : cmp(rows[i - 1], r) === 0 ? rows[i - 1].position
      : mode === "DENSE" ? rows[i - 1].position + 1 : i + 1;
  });
  return rows.map(r => ({ teamId: r.teamId, position: r.position, total: r.total, reached: r.reached, finalRank: r.finalRank, perRound: r.perRound, ranks: r.ranks }));
}

/** Positions for rows already sorted by `cmp`: equal rows share, as the event's sharedRankMode says. */
function assignPositions<T extends { position: number }>(rows: T[], cmp: (a: T, b: T) => number, mode: SharedRankMode) {
  rows.forEach((r, i) => {
    r.position = i === 0 ? 1 : cmp(rows[i - 1], r) === 0 ? rows[i - 1].position
      : mode === "DENSE" ? rows[i - 1].position + 1 : i + 1;
  });
}

// ── League: group stage, then knockout ───────────────────────────────────────

/**
 * Round-robin matchdays (circle method): every pair meets once, and nobody
 * plays twice on a matchday. Odd groups get one team resting each matchday.
 */
export function roundRobin(ids: string[]): [string, string][][] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length, days: [string, string][][] = [];
  for (let d = 0; d < n - 1; d++) {
    const day: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      // Alternate sides so the fixed team is not always listed first.
      if (a && b) day.push(d % 2 && i === 0 ? [b, a] : [a, b]);
    }
    days.push(day);
    list.splice(1, 0, list.pop()!);
  }
  return days;
}

/**
 * Group matches in playing order: matchday 1 of every group, then matchday 2…
 * so a team is not on in back-to-back waves and groups progress together.
 */
export function leagueFixtures(groups: { label: string; teamIds: string[] }[]) {
  const days = groups.map(g => roundRobin(g.teamIds));
  const out: { pool: string; label: string; teamIds: [string, string] }[] = [];
  const count = new Map<string, number>();
  for (let d = 0; d < Math.max(0, ...days.map(x => x.length)); d++) {
    groups.forEach((g, gi) => {
      for (const m of days[gi][d] ?? []) {
        const k = (count.get(g.label) ?? 0) + 1;
        count.set(g.label, k);
        out.push({ pool: g.label, label: `${g.label}${k}`, teamIds: m });
      }
    });
  }
  return out;
}

/** Group-match points from ranks: both 1 = draw; else 1 = win, 2 = loss. */
export function leaguePointsFor(rank: number, ranks: number[]) {
  const draw = ranks.length === 2 && ranks[0] === ranks[1];
  return draw ? LEAGUE_POINTS.draw : rank === 1 ? LEAGUE_POINTS.win : LEAGUE_POINTS.loss;
}

export type LeagueRow = LeagueRecord & { teamId: string; position: number };

/**
 * Group tables from the group-stage sessions (one match each, `pool` = group).
 * Order: points, then wins, then points in the matches between the tied teams;
 * still equal → shared position.
 */
export function leagueTables(group: StandingRound | undefined, mode: SharedRankMode = "SKIP") {
  const pools = new Map<string, Map<string, LeagueRow>>();
  const results: { pool: string; a: string; b: string; ra: number; rb: number }[] = [];
  for (const s of group?.sessions ?? []) {
    const pool = s.pool ?? "";
    const rows = pools.get(pool) ?? new Map<string, LeagueRow>();
    pools.set(pool, rows);
    for (const e of s.entries) if (!rows.has(e.teamId)) rows.set(e.teamId, { teamId: e.teamId, pool, position: 0, played: 0, won: 0, drawn: 0, lost: 0, points: 0 });
    const [a, b] = s.entries;
    if (!a || !b || a.rank == null || b.rank == null) continue;
    results.push({ pool, a: a.teamId, b: b.teamId, ra: a.rank, rb: b.rank });
    for (const [me, my, their] of [[a, a.rank, b.rank], [b, b.rank, a.rank]] as const) {
      const r = rows.get(me.teamId)!;
      r.played++;
      if (my === their) { r.drawn++; r.points += LEAGUE_POINTS.draw; }
      else if (my < their) { r.won++; r.points += LEAGUE_POINTS.win; }
      else { r.lost++; r.points += LEAGUE_POINTS.loss; }
    }
  }
  return [...pools.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([pool, map]) => {
    const rows = [...map.values()];
    const key = (r: LeagueRow) => `${r.points}:${r.won}`;
    // Head-to-head points among the teams level on points and wins.
    const h2h = new Map<string, number>();
    for (const m of results.filter(x => x.pool === pool)) {
      const ta = map.get(m.a)!, tb = map.get(m.b)!;
      if (key(ta) !== key(tb)) continue;
      const pa = m.ra === m.rb ? LEAGUE_POINTS.draw : m.ra < m.rb ? LEAGUE_POINTS.win : 0;
      const pb = m.ra === m.rb ? LEAGUE_POINTS.draw : m.rb < m.ra ? LEAGUE_POINTS.win : 0;
      h2h.set(m.a, (h2h.get(m.a) ?? 0) + pa);
      h2h.set(m.b, (h2h.get(m.b) ?? 0) + pb);
    }
    const cmp = (x: LeagueRow, y: LeagueRow) => y.points - x.points || y.won - x.won || (h2h.get(y.teamId) ?? 0) - (h2h.get(x.teamId) ?? 0);
    rows.sort(cmp);
    assignPositions(rows, cmp, mode);
    return { pool, rows, done: (group?.sessions ?? []).filter(s => (s.pool ?? "") === pool).every(s => s.status === "DONE") };
  });
}

/**
 * Who reaches the knockout: the first `perGroup` of every table, plus the
 * groups where a shared position straddles the cut (to be settled by hand).
 */
export function leagueQualifiers(tables: ReturnType<typeof leagueTables>, perGroup: number) {
  const qualifiers: (LeagueRow & { seed: number })[] = [];
  const cutoffTies: string[] = [];
  for (const t of tables) {
    t.rows.slice(0, perGroup).forEach(r => qualifiers.push({ ...r, seed: 0 }));
    const last = t.rows[perGroup - 1], next = t.rows[perGroup];
    if (last && next && last.position === next.position) cutoffTies.push(t.pool);
  }
  // Seeds: group winners first (best record first), then runners-up…
  qualifiers.sort((a, b) => a.position - b.position || b.points - a.points || b.won - a.won || a.pool.localeCompare(b.pool, undefined, { numeric: true }));
  qualifiers.forEach((q, i) => { q.seed = i + 1; });
  return { qualifiers, cutoffTies };
}

/** Seed order of a bracket of `size` (a power of 2): 1 and 2 can only meet in the final. */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap(s => [s, n + 1 - s]);
  }
  return order;
}

/**
 * First knockout round from seeded qualifiers (best first). The bracket is
 * the next power of 2; the top seeds get the byes (a match of one). Then
 * same-group pairings are swapped away where another match allows it, since
 * those two have already met.
 */
export function seedKnockout(seeded: { teamId: string; pool: string }[]): string[][] {
  const q = seeded.length;
  if (q < 2) return seeded.map(s => [s.teamId]);
  let size = 2;
  while (size < q) size *= 2;
  const order = bracketOrder(size);
  const matches: { teamId: string; pool: string }[][] = [];
  for (let i = 0; i < size; i += 2) matches.push([seeded[order[i] - 1], seeded[order[i + 1] - 1]].filter(Boolean));
  const clash = (m: { pool: string }[]) => m.length === 2 && m[0].pool === m[1].pool;
  for (let i = 0; i < matches.length; i++) {
    if (!clash(matches[i])) continue;
    // Nearest match first, so the bracket halves stay as seeded where possible.
    const others = matches.map((_, j) => j).filter(j => j !== i && matches[j].length === 2).sort((a, b) => Math.abs(a - i) - Math.abs(b - i));
    for (const j of others) {
      const a = [matches[i][0], matches[j][1]], b = [matches[j][0], matches[i][1]];
      if (!clash(a) && !clash(b)) { matches[i] = a; matches[j] = b; break; }
    }
  }
  return matches.map(m => m.map(t => t.teamId));
}

/** Next knockout round: winners of matches 1 & 2 meet, 3 & 4… (bracket order). */
export function nextKnockout(prev: { number: number; entries: { teamId: string; advanced: boolean }[] }[]): string[][] {
  const winners = [...prev].sort((a, b) => a.number - b.number).map(s => s.entries.find(e => e.advanced)?.teamId).filter((x): x is string => !!x);
  const out: string[][] = [];
  for (let i = 0; i < winners.length; i += 2) out.push(winners.slice(i, i + 2));
  return out;
}

/** Display name of a round. League knockouts are named by size: Suku Akhir, Separuh Akhir… */
export function roundTitle(r: { number: number; isFinal: boolean; stage?: string; sessions: unknown[] }, league: boolean): string {
  if (r.stage === "GROUP") return "Peringkat Kumpulan";
  if (r.isFinal) return "Akhir";
  if (!league) return `Pusingan ${r.number}`;
  const n = r.sessions.length;
  return n === 2 ? "Separuh Akhir" : n <= 4 ? "Suku Akhir" : `Pusingan ${n * 2} Terbaik`;
}

/** Whether a round belongs to a league bracket (group stage, or a knockout match "M1"…). */
export const isLeagueRound = (r: { stage?: string; sessions: { label: string }[] }) =>
  r.stage === "GROUP" || /^M\d+$/.test(r.sessions[0]?.label ?? "");

/** Display name of a session: "Akhir", "Perlawanan A1" (league) or "Sesi B". */
export function sessionTitle(r: { isFinal: boolean; stage?: string; sessions: { label: string }[] }, s: { label: string }) {
  return r.isFinal ? "Akhir" : isLeagueRound(r) ? `Perlawanan ${s.label}` : `Sesi ${s.label}`;
}

/**
 * League standings: knockout depth first (furthest round, then rank in the
 * final); teams out in the same round, and those out in the groups, are
 * ordered by group-stage points then wins. `total` is the group points.
 */
export function leagueStandings(rounds: StandingRound[], mode: SharedRankMode = "SKIP"): Standing[] {
  const group = rounds.find(r => r.stage === "GROUP");
  const records = new Map(leagueTables(group, mode).flatMap(t => t.rows.map(r => [r.teamId, r] as const)));
  type Row = Standing & { league: LeagueRecord };
  const map = new Map<string, Row>();
  for (const [teamId, r] of records) {
    map.set(teamId, {
      teamId, position: 0, total: r.points, reached: group?.number ?? 1, finalRank: null,
      perRound: { [group?.number ?? 1]: r.points }, ranks: { [group?.number ?? 1]: r.position },
      league: { pool: r.pool, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, points: r.points },
    });
  }
  for (const r of [...rounds].filter(x => x.stage !== "GROUP").sort((a, b) => a.number - b.number)) {
    for (const s of r.sessions) for (const e of s.entries) {
      const row = map.get(e.teamId);
      if (!row) continue;
      row.reached = Math.max(row.reached, r.number);
      row.perRound[r.number] = e.points;
      row.ranks[r.number] = e.rank;
      if (r.isFinal) row.finalRank = e.rank;
    }
  }
  const nz = (v: number | null) => v ?? Number.MAX_SAFE_INTEGER;
  const cmp = (a: Row, b: Row) =>
    b.reached - a.reached || nz(a.finalRank) - nz(b.finalRank) || b.league.points - a.league.points || b.league.won - a.league.won;
  const rows = [...map.values()].sort(cmp);
  assignPositions(rows, cmp, mode);
  return rows;
}
