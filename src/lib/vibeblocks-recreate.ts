import { db } from "@/lib/db";
import {
  encodeVibeBlocksToken, parseVibeBlocksToken,
  vibeBlocksQueryResults, vibeBlocksRegisterFreshEntry, vibeBlocksErrorMessage,
  type VibeBlocksEvent,
} from "@/lib/vibeblocks";
import { GAME_PROVIDERS, type GameProvider } from "@/lib/game-provider";

/**
 * Recreating a walk-in competition's game-platform event (VibeBlocks or TechTriathlon).
 *
 * VibeBlocks freezes an event's schedule once a token is registered and never
 * reopens a closed event, so the way to change either is a new event. The new
 * one is `<slug><sep><n>` / `<name>_<n>` (n = next free number, from 2; sep is
 * "_" on VibeBlocks, "-" on TechTriathlon, whose ids allow no "_"). The walk-in
 * then points at it, and `syncVibeBlocksEntries` gives every registration a new
 * token there — registrations keep their session and slot.
 */

const NAME_SUFFIX = /_(\d+)$/;

/** Next free `<slug><sep><n>` event id and `<name>_<n>` name. */
export function nextEventIdentity(
  slug: string, currentName: string, liveEvents: Pick<VibeBlocksEvent, "event_id">[], currentId: string | null,
  sep = "_",
) {
  const taken = new Set(liveEvents.map((e) => e.event_id));
  if (currentId) taken.add(currentId);
  const numberOf = (id: string) => {
    const m = id.startsWith(`${slug}${sep}`) ? id.slice(slug.length + sep.length).match(/^(\d+)$/) : null;
    return m ? Number(m[1]) : null;
  };
  let n = 1;
  for (const id of taken) n = Math.max(n, numberOf(id) ?? 1);
  n += 1;
  const idSuffix = `${sep}${n}`;
  const eventId = slug.slice(0, 64 - idSuffix.length) + idSuffix;
  // Only strip a suffix this feature added (the current event is itself a recreate).
  const baseName = currentId && numberOf(currentId) ? currentName.trim().replace(NAME_SUFFIX, "") : currentName.trim();
  const name = `${baseName.slice(0, 120 - String(n).length - 1)}_${n}`;
  return { eventId, name, n };
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
export async function registrationsToSync(wicId: string, eventId: string, provider: GameProvider = "vibeblocks") {
  const regs = await tokenHolders(wicId);
  const byEntry = new Map<string, string>(); // entryId -> regId
  for (const r of regs) {
    const p = r.viblockToken ? parseVibeBlocksToken(r.viblockToken) : null;
    if (p) byEntry.set(p.entryId, r.id);
  }
  const inEvent = new Set<string>();
  const ids = [...byEntry.keys()];
  const max = GAME_PROVIDERS[provider].maxResultIds;
  for (let i = 0; i < ids.length; i += max) {
    const res = await vibeBlocksQueryResults(eventId, ids.slice(i, i + max), provider);
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
export async function syncVibeBlocksEntries(wicId: string, eventId: string, provider: GameProvider = "vibeblocks", limit = 40) {
  const { total, pending } = await registrationsToSync(wicId, eventId, provider);
  const batch = pending.slice(0, limit);
  let synced = 0;
  const errors: string[] = [];
  for (const regId of batch) {
    try {
      const v = await vibeBlocksRegisterFreshEntry(eventId, { walkInCompetitionId: wicId, partnerReference: regId, provider });
      await db.walkInRegistration.update({
        where: { id: regId }, data: { viblockToken: encodeVibeBlocksToken(v.entryToken, v.entry_id) },
      });
      synced++;
    } catch (e) {
      console.error(`[${provider}] sync ${regId} to ${eventId} failed:`, e);
      errors.push(vibeBlocksErrorMessage(e, provider));
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
 * Event ID for a new event: the slug when it is free, otherwise the next
 * `<slug><sep><n>`. `taken` = ids on the platform plus ids linked here (several
 * walk-in competitions of one event each need their own event).
 */
export function freeEventId(slug: string, taken: Iterable<string>, sep = "_") {
  const ids = new Set(taken);
  if (!ids.has(slug)) return slug;
  return nextEventIdentity(slug, "", [...ids].map((event_id) => ({ event_id })), null, sep).eventId;
}
