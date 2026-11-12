import { randomInt, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

// Per-session scorecard links (/scorecard/<slug>, 5-character passcode): a
// marshal marks one duel's scorecard on a phone and saves its result. Saving
// runs the organizer ranks handler as an OPERATOR of that competition, so the
// same rules apply (ranks follow the scores, disqualified last, locks).

const PASS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");

export const genScorecardPasscode = () => pick(PASS_CHARS, 5);

export async function genScorecardSlug() {
  for (;;) {
    const slug = pick(SLUG_CHARS, 10);
    if (!(await db.duelScorecardLink.findUnique({ where: { routeSlug: slug }, select: { id: true } }))) return slug;
  }
}

export const samePasscode = (a: string, b: string) => {
  const x = Buffer.from(a.trim().toUpperCase()), y = Buffer.from(b.trim().toUpperCase());
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The session's link, created on first request. */
export async function ensureScorecardLink(sessionId: string, ecId: string) {
  const found = await db.duelScorecardLink.findUnique({ where: { sessionId }, select: { routeSlug: true, passcode: true } });
  if (found) return found;
  try {
    return await db.duelScorecardLink.create({
      data: { sessionId, eventCompetitionId: ecId, routeSlug: await genScorecardSlug(), passcode: genScorecardPasscode() },
      select: { routeSlug: true, passcode: true },
    });
  } catch {
    // Created by a concurrent request.
    return (await db.duelScorecardLink.findUnique({ where: { sessionId }, select: { routeSlug: true, passcode: true } }))!;
  }
}
