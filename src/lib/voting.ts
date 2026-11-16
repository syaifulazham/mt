import { randomInt } from "crypto";
import { db } from "@/lib/db";

/**
 * Public voting ("Undian Awam"): an extra judging option on the Penghakiman
 * page. A session lists entries with links (article, video, site…); the
 * public page /vote/<routeSlug> lets anyone score each entry between the
 * session's minScore and maxScore — one ballot per entry per voter cookie,
 * a re-vote overwrites it.
 */

export const VOTING_WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
export const VOTER_COOKIE = "mt_voter";
export const SCORE_LIMIT = 100;
export const MAX_LINKS = 5;

export type VotingLink = { label: string; url: string };

const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export async function genVotingSlug() {
  for (;;) {
    const slug = Array.from({ length: 8 }, () => SLUG_CHARS[randomInt(SLUG_CHARS.length)]).join("");
    if (!(await db.votingSession.findUnique({ where: { routeSlug: slug }, select: { id: true } }))) return slug;
  }
}

/** http(s) URL, or null. A bare "example.com/x" gets https://. */
export function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
}

/** Valid links only, at most MAX_LINKS; the label defaults to the host. */
export function parseLinks(raw: unknown): VotingLink[] {
  if (!Array.isArray(raw)) return [];
  const out: VotingLink[] = [];
  for (const l of raw) {
    const url = cleanUrl((l as { url?: unknown })?.url);
    if (!url) continue;
    const label = String((l as { label?: unknown })?.label ?? "").trim().slice(0, 60) || new URL(url).hostname.replace(/^www\./, "");
    out.push({ label, url });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/** Min/max from a request body, or an error message. */
export function parseRange(min: unknown, max: unknown): { minScore: number; maxScore: number } | string {
  const a = Number(min), b = Number(max);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return "Skor min dan maks mesti nombor bulat";
  if (a < 0 || b > SCORE_LIMIT) return `Skor mesti antara 0 dan ${SCORE_LIMIT}`;
  if (a >= b) return "Skor maks mesti lebih besar daripada skor min";
  return { minScore: a, maxScore: b };
}

export type EntryTally = { entryId: string; votes: number; total: number; average: number | null };

/** Vote count, total and average per entry of a session. */
export async function tallySession(sessionId: string): Promise<Map<string, EntryTally>> {
  const rows = await db.votingBallot.groupBy({
    by: ["entryId"], where: { sessionId },
    _count: { _all: true }, _sum: { score: true }, _avg: { score: true },
  });
  return new Map(rows.map(r => [r.entryId, {
    entryId: r.entryId, votes: r._count._all, total: r._sum.score ?? 0,
    average: r._avg.score === null ? null : Math.round(r._avg.score * 100) / 100,
  }]));
}

/** Entry DTO with its tally, for the organizer panel and (when shown) the public page. */
export function entryWithTally(
  e: { id: string; teamId: string | null; title: string; subtitle: string | null; links: unknown; sortOrder: number },
  tally: Map<string, EntryTally>,
) {
  const t = tally.get(e.id);
  return {
    id: e.id, teamId: e.teamId, title: e.title, subtitle: e.subtitle,
    links: parseLinks(e.links), sortOrder: e.sortOrder,
    votes: t?.votes ?? 0, total: t?.total ?? 0, average: t?.average ?? null,
  };
}
