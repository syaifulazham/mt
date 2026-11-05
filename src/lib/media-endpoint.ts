import { randomInt, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Media endpoints: /media/<routeSlug> pages where an event's media team, with
 * the endpoint's passcode, creates galleries and uploads photos. They see and
 * change only the galleries made through their own endpoint. Created and
 * managed by SUPER_ADMIN on the event's Manage → Media page.
 */

export const MEDIA_ADMIN_ROLES = ["SUPER_ADMIN"];

/** Organizer-chosen passcodes: 6–32 letters and digits. */
export const PASSCODE_RE = /^[A-Za-z0-9]{6,32}$/;

const PASS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");

/** Random 6-character passcode, easy to read aloud. */
export const genMediaPasscode = () => pick(PASS_CHARS, 6);

export async function genMediaSlug() {
  for (;;) {
    const slug = pick(SLUG_CHARS, 8);
    if (!(await db.mediaEndpoint.findUnique({ where: { routeSlug: slug }, select: { id: true } }))) return slug;
  }
}

function samePasscode(a: string, b: string) {
  const x = Buffer.from(a.toUpperCase()), y = Buffer.from(b.toUpperCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The active endpoint for a request carrying its passcode (header
 * x-media-passcode), or a response to return. Passcodes are case-insensitive.
 */
export async function authMedia(req: NextRequest, slug: string) {
  const ep = await db.mediaEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { id: true, eventId: true, passcode: true, active: true, label: true, event: { select: { name: true } } },
  });
  if (!ep || !ep.active) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  const given = req.headers.get("x-media-passcode") ?? "";
  if (!given || !samePasscode(given, ep.passcode))
    return { res: NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 }) };
  // At most once a minute, so uploads do not write it per photo.
  void db.mediaEndpoint.updateMany({
    where: { id: ep.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - 60_000) } }] },
    data: { lastUsedAt: new Date() },
  }).catch(() => null);
  return { ep };
}

/** A gallery of this endpoint, with its photos. */
export async function ownGallery(endpointId: string, galleryId: string) {
  return db.gallery.findFirst({ where: { id: galleryId, mediaEndpointId: endpointId }, select: { id: true } });
}

/** What the admin page lists for an endpoint. */
export const ENDPOINT_SELECT = {
  id: true, routeSlug: true, passcode: true, label: true, active: true, createdAt: true, lastUsedAt: true,
  galleries: { select: { _count: { select: { photos: true } } } },
} as const;

export function endpointDto(e: { galleries: { _count: { photos: number } }[] } & Record<string, unknown>) {
  const { galleries, ...rest } = e;
  return { ...rest, galleryCount: galleries.length, photoCount: galleries.reduce((n, g) => n + g._count.photos, 0) };
}

/** A duel session in this endpoint's event (the media team films it). */
export async function ownDuelSession(eventId: string, sid: string) {
  return db.duelSession.findFirst({
    where: { id: sid, round: { eventCompetition: { eventId } } },
    select: {
      id: true, label: true, status: true, streamInputId: true, streamPublishUrl: true, streamPlaybackUrl: true,
      replayVideoId: true, replayStatus: true,
      round: { select: { number: true, isFinal: true, eventCompetition: { select: { competition: { select: { code: true } } } } } },
    },
  });
}
