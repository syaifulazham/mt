import { AsyncLocalStorage } from "async_hooks";
import { randomInt, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * International registration links: /intl/<routeSlug> opens an event's
 * Penyertaan Antarabangsa page for whoever holds the 6-character passcode (a
 * third party handling foreign schools, without an organizer account).
 * Requests run the organizer international route handlers inside
 * `asInternationalLink`; `requireInternationalAdmin` reads that identity
 * instead of the organizer session, and `loadForeignContingent` / the school
 * list hold an OWN-scoped link to the schools it created. Acceptance and
 * link management are not reachable through a link.
 */
export type InternationalLinkIdentity = {
  id: string; email: string; name: string; role: "ADMIN";
  linkId: string; eventId: string; scope: "ALL" | "OWN"; contingentIds: string[];
};

const store = new AsyncLocalStorage<InternationalLinkIdentity>();
export const currentInternationalLink = () => store.getStore();
export const asInternationalLink = <T>(who: InternationalLinkIdentity, fn: () => Promise<T>) => store.run(who, fn);

const PASS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
export const genInternationalPasscode = () => pick(PASS_CHARS, 6);

export async function genInternationalSlug() {
  for (;;) {
    const slug = pick(SLUG_CHARS, 10);
    if (!(await db.internationalLink.findUnique({ where: { routeSlug: slug }, select: { id: true } }))) return slug;
  }
}

const samePasscode = (a: string, b: string) => {
  const x = Buffer.from(a.trim().toUpperCase()), y = Buffer.from(b.trim().toUpperCase());
  return x.length === y.length && timingSafeEqual(x, y);
};

export const INTL_LINK_SELECT = {
  id: true, routeSlug: true, passcode: true, label: true, scope: true, active: true, createdAt: true, lastUsedAt: true,
  contingentIds: true,
} as const;

/** An active link with its event, or null. */
export function findInternationalLink(slug: string) {
  return db.internationalLink.findFirst({
    where:  { routeSlug: slug, active: true },
    select: { ...INTL_LINK_SELECT, eventId: true, event: { select: { id: true, name: true, slug: true } } },
  });
}

/**
 * The link and its identity for a request carrying the passcode
 * (`x-intl-passcode`), or the error response: 404 unknown / closed, 403 wrong passcode.
 */
export async function authInternationalLink(req: NextRequest, slug: string, passcode?: string) {
  const link = await findInternationalLink(slug);
  if (!link) return { res: NextResponse.json({ error: "NOT_FOUND", message: "Pautan tidak wujud atau telah ditutup." }, { status: 404 }) } as const;
  const given = passcode ?? req.headers.get("x-intl-passcode") ?? "";
  if (!given || !samePasscode(given, link.passcode))
    return { res: NextResponse.json({ error: "WRONG_PASSCODE", message: "Kod laluan salah." }, { status: 403 }) } as const;
  if (!link.lastUsedAt || Date.now() - link.lastUsedAt.getTime() > 60_000)
    await db.internationalLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });
  const who: InternationalLinkIdentity = {
    id: `intl-link:${link.id}`, email: "", name: link.label || "Pautan antarabangsa", role: "ADMIN",
    linkId: link.id, eventId: link.eventId, scope: link.scope === "OWN" ? "OWN" : "ALL", contingentIds: link.contingentIds,
  };
  return { link, who } as const;
}
