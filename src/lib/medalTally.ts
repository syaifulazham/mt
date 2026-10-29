import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { computeCompetitionResults, type CompetitionResult } from "@/lib/resultsRankings";

// Medal tally by state for NATIONAL events: 1st place = gold, 2nd = silver,
// 3rd = bronze in every competition (regular and walk-in), credited to the
// state of the winning team's contingent. Only competitions whose judging is
// VERIFIED count, unless the organizer asks for a preview of unverified ones.

export const MEDAL_TALLY_SCOPES = ["NATIONAL", "ONLINE_NATIONAL"];
export const MEDAL_WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export type Place = 1 | 2 | 3;

export interface MedalWinner {
  competitionId: string;
  competitionName: string;
  competitionCode: string;
  walkIn: boolean;
  verified: boolean;
  place: Place;
  teamName: string;
  contingentName: string;
}

export interface StateTally {
  /** null groups teams whose contingent has no state. */
  stateId: string | null;
  stateName: string;
  stateFlag: string | null;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  /** Shared when gold, silver and bronze are all equal. */
  position: number;
  winners: MedalWinner[];
}

export interface MedalTally {
  states: StateTally[];
  /** Competitions in the event, and how many were counted. */
  competitions: { total: number; counted: number; verified: number };
}

const NO_STATE = "Tiada negeri";

export async function computeMedalTally(eventId: string, opts: { includeUnverified?: boolean } = {}): Promise<MedalTally> {
  const [regular, walkIn, allStates] = await Promise.all([
    computeCompetitionResults(eventId, false, null),
    computeCompetitionResults(eventId, true, null),
    db.state.findMany({ select: { id: true, name: true, flagUrl: true } }),
  ]);
  const all: (CompetitionResult & { walkIn: boolean })[] = [
    ...regular.map((c) => ({ ...c, walkIn: false })),
    ...walkIn.map((c) => ({ ...c, walkIn: true })),
  ];

  const byState = new Map<string, StateTally>();
  const stateOf = (id: string | null, name: string | null, flag: string | null) => {
    const key = id ?? "";
    let s = byState.get(key);
    if (!s) {
      s = { stateId: id, stateName: name ?? NO_STATE, stateFlag: flag, gold: 0, silver: 0, bronze: 0, total: 0, position: 0, winners: [] };
      byState.set(key, s);
    }
    return s;
  };

  // Every state is listed, with 0 medals until it wins one.
  for (const st of allStates) stateOf(st.id, st.name, st.flagUrl);

  let counted = 0;
  let verified = 0;
  for (const c of all) {
    const isVerified = c.judgingStatus === "VERIFIED";
    if (isVerified) verified++;
    if (!isVerified && !opts.includeUnverified) continue;
    if (c.rankings.length === 0) continue;
    counted++;
    for (const r of c.rankings) {
      if (r.rank > 3) continue;
      const s = stateOf(r.stateId, r.stateName, r.stateFlag);
      const place = r.rank as Place;
      if (place === 1) s.gold++;
      else if (place === 2) s.silver++;
      else s.bronze++;
      s.total++;
      s.winners.push({
        competitionId: c.id, competitionName: c.name, competitionCode: c.code,
        walkIn: c.walkIn, verified: isVerified, place,
        teamName: r.teamName, contingentName: r.contingentName,
      });
    }
  }

  const states = [...byState.values()].sort((a, b) =>
    b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze ||
    // Teams without a state always go last.
    Number(a.stateId === null) - Number(b.stateId === null) ||
    a.stateName.localeCompare(b.stateName, "ms"),
  );
  states.forEach((s, i) => {
    const prev = states[i - 1];
    s.position = prev && prev.gold === s.gold && prev.silver === s.silver && prev.bronze === s.bronze ? prev.position : i + 1;
    s.winners.sort((a, b) => a.place - b.place || a.competitionCode.localeCompare(b.competitionCode));
  });

  return { states, competitions: { total: all.length, counted, verified } };
}

export function generateRouteSlug() {
  return randomBytes(10).toString("hex");
}

export function generatePasscode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[bytes[i] % chars.length];
  return out;
}
