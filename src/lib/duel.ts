/**
 * Duel competitions (Robot Tempur, Robot Sumo…): pure logic, no database.
 *
 * Teams are drawn into sessions of at most `perSession`. Each session is ranked
 * 1…n and earns points 1st = n … last = 1; the top `advance` ranks of every
 * session go on to the next round, until the entrants fit in one session — the
 * final. Final standings are the points summed over every round
 * (src/lib/duel-server.ts loads the rows; this file only computes).
 */

/** NATIONAL: one bracket for everyone. STATE: each state runs its own bracket and standings. */
export type DuelScope = "NATIONAL" | "STATE";

export type DuelConfig = {
  scope: DuelScope;
  perSession: number;
  advance: number;
  arenas: number;
  durationSec: number;
  breakSec: number;
};

export const DUEL_DEFAULTS: DuelConfig = { scope: "NATIONAL", perSession: 4, advance: 2, arenas: 2, durationSec: 180, breakSec: 60 };

export type DuelSplit = "even" | "fill";

const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

/** Config with defaults, clamped to sane ranges; `advance` is below `perSession`. */
export function parseDuelConfig(json: unknown): DuelConfig {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const perSession = int(o.perSession, 2, 32, DUEL_DEFAULTS.perSession);
  return {
    scope: o.scope === "STATE" ? "STATE" : "NATIONAL",
    perSession,
    advance: int(o.advance, 1, perSession - 1, Math.min(DUEL_DEFAULTS.advance, perSession - 1)),
    arenas: int(o.arenas, 1, 20, DUEL_DEFAULTS.arenas),
    durationSec: int(o.durationSec, 10, 4 * 3600, DUEL_DEFAULTS.durationSec),
    breakSec: int(o.breakSec, 0, 3600, DUEL_DEFAULTS.breakSec),
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
  number: number; isFinal: boolean;
  sessions: { entries: { teamId: string; rank: number | null; points: number | null }[] }[];
};

export type Standing = {
  teamId: string; position: number; total: number; reached: number;
  finalRank: number | null; perRound: Record<number, number | null>;
};

/**
 * Points summed over every round. Ties: furthest round reached, then rank in
 * the final, then rank in the team's last round. Equal on all of these share
 * a position.
 */
export function duelStandings(rounds: StandingRound[]): Standing[] {
  const map = new Map<string, Standing & { lastRank: number | null }>();
  for (const r of [...rounds].sort((a, b) => a.number - b.number)) {
    for (const s of r.sessions) for (const e of s.entries) {
      const row = map.get(e.teamId) ?? { teamId: e.teamId, position: 0, total: 0, reached: 0, finalRank: null, perRound: {}, lastRank: null };
      row.total += e.points ?? 0;
      row.reached = Math.max(row.reached, r.number);
      row.perRound[r.number] = e.points;
      row.lastRank = e.rank;
      if (r.isFinal) row.finalRank = e.rank;
      map.set(e.teamId, row);
    }
  }
  const nz = (v: number | null) => v ?? Number.MAX_SAFE_INTEGER;
  const cmp = (a: Standing & { lastRank: number | null }, b: Standing & { lastRank: number | null }) =>
    b.total - a.total || b.reached - a.reached || nz(a.finalRank) - nz(b.finalRank) || nz(a.lastRank) - nz(b.lastRank);
  const rows = [...map.values()].sort(cmp);
  rows.forEach((r, i) => { r.position = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].position : i + 1; });
  return rows.map(r => ({ teamId: r.teamId, position: r.position, total: r.total, reached: r.reached, finalRank: r.finalRank, perRound: r.perRound }));
}
