import { AsyncLocalStorage } from "async_hooks";
import { randomInt, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Duel control links: /duel-control/<routeSlug> replicates one competition's
 * duel manager for whoever holds the passcode (arena marshals without an
 * organizer account). Requests run the organizer duel route handlers inside
 * `asDuelEndpoint`, which `duelGuard` reads instead of the organizer session:
 * CONTROL acts as an OPERATOR (arena control, results), FULL as an ADMIN
 * (also draw and confirm). Reopening a round stays Super Admin only.
 */

export type DuelEndpointIdentity = { id: string; email: string; name: string; role: "ADMIN" | "OPERATOR"; ecId: string };

const store = new AsyncLocalStorage<DuelEndpointIdentity>();
export const currentDuelEndpoint = () => store.getStore();
export const asDuelEndpoint = <T>(who: DuelEndpointIdentity, fn: () => Promise<T>) => store.run(who, fn);

export const PASSCODE_RE = /^[A-Za-z0-9]{6,32}$/;
const PASS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
export const genDuelControlPasscode = () => pick(PASS_CHARS, 6);

export async function genDuelControlSlug() {
  for (;;) {
    const slug = pick(SLUG_CHARS, 10);
    if (!(await db.duelControlEndpoint.findUnique({ where: { routeSlug: slug }, select: { id: true } }))) return slug;
  }
}

function samePasscode(a: string, b: string) {
  const x = Buffer.from(a.toUpperCase()), y = Buffer.from(b.toUpperCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

const EP_SELECT = {
  id: true, eventCompetitionId: true, passcode: true, label: true, access: true, active: true,
  eventCompetition: {
    select: {
      eventId: true,
      event: { select: { id: true, name: true, slug: true } },
      competition: { select: { name: true, code: true } },
    },
  },
} as const;

/** The active endpoint, without checking the passcode (what the passcode screen shows). */
export async function findDuelControl(slug: string) {
  const ep = await db.duelControlEndpoint.findUnique({ where: { routeSlug: slug }, select: EP_SELECT });
  return ep?.active ? ep : null;
}

/** The active endpoint for a request carrying its passcode (header x-duel-passcode), or a response. */
export async function authDuelControl(req: NextRequest, slug: string) {
  const ep = await findDuelControl(slug);
  if (!ep) return { res: NextResponse.json({ error: "NOT_FOUND", message: "Pautan tidak wujud atau telah ditutup." }, { status: 404 }) };
  const given = req.headers.get("x-duel-passcode") ?? "";
  if (!given || !samePasscode(given, ep.passcode))
    return { res: NextResponse.json({ error: "INVALID_PASSCODE", message: "Kod laluan salah." }, { status: 403 }) };
  void db.duelControlEndpoint.updateMany({
    where: { id: ep.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - 60_000) } }] },
    data: { lastUsedAt: new Date() },
  }).catch(() => null);
  const who: DuelEndpointIdentity = {
    id: `duel-link:${ep.id}`, email: "", name: `Pautan ${ep.label || "kawalan"}`,
    role: ep.access === "FULL" ? "ADMIN" : "OPERATOR", ecId: ep.eventCompetitionId,
  };
  return { ep, who };
}

/** What the duel manager lists for a link. */
export const LINK_SELECT = { id: true, routeSlug: true, passcode: true, label: true, access: true, active: true, createdAt: true, lastUsedAt: true } as const;
