import { db } from "@/lib/db";
import {
  VB_EVENT_ID_RE, encodeVibeBlocksToken, parseVibeBlocksToken,
  vibeBlocksQueryResults, vibeBlocksRegisterFreshEntry, vibeBlocksErrorMessage,
  type VibeBlocksEvent,
} from "@/lib/vibeblocks";

/**
 * Recreating a walk-in competition's VibeBlocks event.
 *
 * VibeBlocks freezes an event's schedule once a token is registered and never
 * reopens a closed event, so the way to change either is a new event. The new
 * one is `<slug>_<n>` / `<name>_<n>` (n = next free number, from 2). The walk-in
 * then points at it, and `syncVibeBlocksEntries` gives every registration a new
 * token there — registrations keep their session and slot.
 */

const SUFFIX = /_(\d+)$/;

/** Next free `<slug>_<n>` event id and `<name>_<n>` name. */
export function nextEventIdentity(
  slug: string, currentName: string, liveEvents: Pick<VibeBlocksEvent, "event_id">[], currentId: string | null,
) {
  const taken = new Set(liveEvents.map((e) => e.event_id));
  if (currentId) taken.add(currentId);
  const numberOf = (id: string) => {
    const m = id.startsWith(`${slug}_`) ? id.slice(slug.length).match(SUFFIX) : null;
    return m && m.index === 0 ? Number(m[1]) : null;
  };
  let n = 1;
  for (const id of taken) n = Math.max(n, numberOf(id) ?? 1);
  n += 1;
  const suffix = `_${n}`;
  const eventId = slug.slice(0, 64 - suffix.length) + suffix;
  // Only strip a suffix this feature added (the current event is itself a recreate).
  const baseName = currentId && numberOf(currentId) ? currentName.trim().replace(SUFFIX, "") : currentName.trim();
  const name = baseName.slice(0, 120 - suffix.length) + suffix;
  return { eventId, name, n, valid: VB_EVENT_ID_RE.test(eventId) };
}

/** Registrations that should hold a token: confirmed ones, and any that already have one. */
async function tokenHolders(wicId: string) {
  return db.walkInRegistration.findMany({
    where: {
      walkInCompetitionId: wicId,
      OR: [{ status: "CONFIRMED" }, { status: "PENDING", viblockToken: { contains: ":ent_" } }],
    },
    select: { id: true, viblockToken: true },
    orderBy: [{ sessionNumber: "asc" }, { slotNumber: "asc" }, { createdAt: "asc" }],
  });
}

/** Registrations whose token is not an entry of `eventId` (or who have none). */
export async function registrationsToSync(wicId: string, eventId: string) {
  const regs = await tokenHolders(wicId);
  const byEntry = new Map<string, string>(); // entryId -> regId
  for (const r of regs) {
    const p = r.viblockToken ? parseVibeBlocksToken(r.viblockToken) : null;
    if (p) byEntry.set(p.entryId, r.id);
  }
  const inEvent = new Set<string>();
  const ids = [...byEntry.keys()];
  for (let i = 0; i < ids.length; i += 1000) {
    const res = await vibeBlocksQueryResults(eventId, ids.slice(i, i + 1000));
    for (const r of res.results) inEvent.add(r.entry_id);
  }
  return {
    total: regs.length,
    pending: regs.filter((r) => {
      const p = r.viblockToken ? parseVibeBlocksToken(r.viblockToken) : null;
      return !p || !inEvent.has(p.entryId);
    }).map((r) => r.id),
  };
}

/**
 * Registers up to `limit` out-of-date registrations in the current event.
 * Safe to re-run; the caller repeats it while `remaining > 0`.
 */
export async function syncVibeBlocksEntries(wicId: string, eventId: string, limit = 40) {
  const { total, pending } = await registrationsToSync(wicId, eventId);
  const batch = pending.slice(0, limit);
  let synced = 0;
  const errors: string[] = [];
  for (const regId of batch) {
    try {
      const v = await vibeBlocksRegisterFreshEntry(eventId, { walkInCompetitionId: wicId, partnerReference: regId });
      await db.walkInRegistration.update({
        where: { id: regId }, data: { viblockToken: encodeVibeBlocksToken(v.entryToken, v.entry_id) },
      });
      synced++;
    } catch (e) {
      console.error(`[vibeblocks] sync ${regId} to ${eventId} failed:`, e);
      errors.push(vibeBlocksErrorMessage(e));
    }
  }
  const failed = batch.length - synced;
  return {
    total, synced, failed,
    // Failures are left for the next run but not counted, so the caller's loop ends.
    remaining: pending.length - batch.length,
    error: errors[0] ?? null,
  };
}

/**
 * Event ID for a new VibeBlocks event: the slug when it is free, otherwise the
 * next `<slug>_<n>`. `taken` = ids on VibeBlocks plus ids linked here (several
 * walk-in competitions of one event each need their own VibeBlocks event).
 */
export function freeEventId(slug: string, taken: Iterable<string>) {
  const ids = new Set(taken);
  if (!ids.has(slug)) return slug;
  return nextEventIdentity(slug, "", [...ids].map((event_id) => ({ event_id })), null).eventId;
}
