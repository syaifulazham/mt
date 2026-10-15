import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { computeCompetitionResults, type RankingEntry } from "@/lib/resultsRankings";
import { announceKey } from "@/lib/announceKey";

export { announceKey };

// Announcement list of an event — the master guideline every MC / announcer
// board follows, managed on the organizer's Pengumuman page.
//
// A result can be announced once a Super Admin VERIFIED it (regular and walk-in
// alike): a competition's national results once it is verified as a whole, and
// each state's results once that state is verified. Verified, unannounced
// results form the list, in the order a Super Admin arranged (drag-and-drop;
// unplaced ones follow by verification time). A Super Admin gives each result
// a green light when it may be read out; the MC boards announce green-lit
// results in list order and tick them off. Entries are event-wide, shared by
// every board.

export type AnnounceKind = "event" | "walkin";

export type AnnounceItem = {
  kind: AnnounceKind;
  refId: string;
  /** null = the national (all states) results; otherwise that state's results. */
  stateId: string | null;
  stateName: string | null;
  code: string;
  name: string;
  /** Target-group school levels of the competition (KINDERGARTEN | PRIMARY | SECONDARY | YOUTH). */
  levels: string[];
  verifiedAt: string | null;
  verifiedBy: string | null;
  greenLight: boolean;
  greenLitAt: string | null;
  greenLitBy: string | null;
  announcedAt: string | null;
  announcedBy: string | null;
  /** Present when requested (announcer board); a state item's are that state's, ranked from 1. */
  rankings?: RankingEntry[];
};

/** A result announced complete (SELESAI) but not yet verified. */
export type WaitingItem = {
  kind: AnnounceKind;
  refId: string;
  stateId: string | null;
  stateName: string | null;
  code: string;
  name: string;
  levels: string[];
  completedAt: string | null;
  completedBy: string | null;
};

export type AnnouncementBoard = {
  /** Verified, not yet announced — in the announcement list's order. */
  list: AnnounceItem[];
  /** Announced complete, awaiting a Super Admin's verification. */
  waiting: WaitingItem[];
  /** Already announced, latest first. */
  announced: AnnounceItem[];
  /** Competitions with nothing completed yet (still being judged). */
  stillJudging: number;
  /** Places announced per result (configuration; 5 = ranks 1–5). */
  maxPlaces: number;
};

export const MAX_PLACES_LIMIT = 20;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export async function announcementBoard(eventId: string, opts: { withRankings?: boolean } = {}): Promise<AnnouncementBoard> {
  const select = {
    id: true, judgingStatus: true, judgingCompletedAt: true, judgingCompletedBy: true,
    judgingVerifiedAt: true, judgingVerifiedBy: true,
    competition: { select: { code: true, name: true, targetGroups: { select: { targetGroup: { select: { schoolLevel: true } } } } } },
  } as const;
  const [ecs, wics, entries, event] = await Promise.all([
    db.eventCompetition.findMany({ where: { eventId }, select }),
    db.eventWalkInCompetition.findMany({ where: { eventId }, select }),
    db.announcementEntry.findMany({ where: { eventId } }),
    db.event.findUnique({ where: { id: eventId }, select: { announcementMaxPlaces: true } }),
  ]);
  const all = [
    ...ecs.map(c => ({ kind: "event" as const, c })),
    ...wics.map(c => ({ kind: "walkin" as const, c })),
  ];
  const [stateRowsE, stateRowsW] = await Promise.all([
    ecs.length  ? db.judgingStateStatus.findMany({ where: { scope: "event",  refId: { in: ecs.map(c => c.id) }, judgingStatus: { not: "OPEN" } } })  : Promise.resolve([]),
    wics.length ? db.judgingStateStatus.findMany({ where: { scope: "walkin", refId: { in: wics.map(c => c.id) }, judgingStatus: { not: "OPEN" } } }) : Promise.resolve([]),
  ]);
  const stateRows = [...stateRowsE, ...stateRowsW];
  const stateNames = new Map((stateRows.length
    ? await db.state.findMany({ where: { id: { in: [...new Set(stateRows.map(r => r.stateId))] } }, select: { id: true, name: true } })
    : []).map(s => [s.id, s.name]));
  const entryBy = new Map(entries.map(e => [announceKey(e.kind, e.refId, e.stateId || null), e]));
  const compOf = (kind: string, refId: string) => all.find(a => a.kind === kind && a.c.id === refId);
  const levelsOf = (c: (typeof all)[number]["c"]) =>
    [...new Set(c.competition.targetGroups.map(t => t.targetGroup.schoolLevel as string))];

  // Every result with a non-OPEN row: national (competition-level) and per state.
  type Scoped = {
    kind: AnnounceKind; c: (typeof all)[number]["c"]; stateId: string | null; status: string;
    completedAt: Date | null; completedBy: string | null; verifiedAt: Date | null; verifiedBy: string | null;
  };
  const scoped: Scoped[] = [
    ...all.filter(x => x.c.judgingStatus !== "OPEN").map(x => ({
      kind: x.kind, c: x.c, stateId: null, status: x.c.judgingStatus,
      completedAt: x.c.judgingCompletedAt, completedBy: x.c.judgingCompletedBy,
      verifiedAt: x.c.judgingVerifiedAt, verifiedBy: x.c.judgingVerifiedBy,
    })),
    ...stateRows.flatMap(r => {
      const x = compOf(r.scope, r.refId);
      return x ? [{
        kind: x.kind, c: x.c, stateId: r.stateId, status: r.judgingStatus,
        completedAt: r.judgingCompletedAt, completedBy: r.judgingCompletedBy,
        verifiedAt: r.judgingVerifiedAt, verifiedBy: r.judgingVerifiedBy,
      }] : [];
    }),
  ];
  const verified = scoped.filter(x => x.status === "VERIFIED");

  let rankingsBy = new Map<string, RankingEntry[]>();
  if (opts.withRankings && verified.length > 0) {
    const ids = (k: AnnounceKind) => [...new Set(verified.filter(x => x.kind === k).map(x => x.c.id))];
    const [reg, walk] = await Promise.all([
      ids("event").length  ? computeCompetitionResults(eventId, false, ids("event"))  : Promise.resolve([]),
      ids("walkin").length ? computeCompetitionResults(eventId, true,  ids("walkin")) : Promise.resolve([]),
    ]);
    rankingsBy = new Map([
      ...reg.map(r => [`event:${r.id}`, r.rankings] as const),
      ...walk.map(r => [`walkin:${r.id}`, r.rankings] as const),
    ]);
  }
  const rankingsFor = (kind: string, refId: string, stateId: string | null) => {
    const r = rankingsBy.get(`${kind}:${refId}`) ?? [];
    return stateId === null ? r : r.filter(x => x.stateId === stateId).map((x, i) => ({ ...x, rank: i + 1 }));
  };

  const items = verified.map((x) => {
    const e = entryBy.get(announceKey(x.kind, x.c.id, x.stateId));
    const item: AnnounceItem = {
      kind: x.kind, refId: x.c.id, stateId: x.stateId, stateName: x.stateId ? (stateNames.get(x.stateId) ?? "—") : null,
      code: x.c.competition.code, name: x.c.competition.name, levels: levelsOf(x.c),
      verifiedAt: iso(x.verifiedAt), verifiedBy: x.verifiedBy,
      greenLight: !!e?.greenLight, greenLitAt: iso(e?.greenLitAt ?? null), greenLitBy: e?.greenLitBy ?? null,
      announcedAt: iso(e?.announcedAt ?? null), announcedBy: e?.announcedBy ?? null,
      ...(opts.withRankings && { rankings: rankingsFor(x.kind, x.c.id, x.stateId) }),
    };
    return { item, sortOrder: e?.sortOrder ?? null };
  });

  const byTime = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");
  const anyNonOpen = new Set(scoped.map(x => `${x.kind}:${x.c.id}`));
  return {
    // Placed ones by position, then the rest by verification time
    list: items.filter(i => !i.item.announcedAt)
      .sort((a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
        || byTime(a.item.verifiedAt, b.item.verifiedAt) || a.item.code.localeCompare(b.item.code))
      .map(i => i.item),
    waiting: scoped.filter(x => x.status === "COMPLETED")
      .map(x => ({
        kind: x.kind, refId: x.c.id, stateId: x.stateId, stateName: x.stateId ? (stateNames.get(x.stateId) ?? "—") : null,
        code: x.c.competition.code, name: x.c.competition.name, levels: levelsOf(x.c),
        completedAt: iso(x.completedAt), completedBy: x.completedBy,
      }))
      .sort((a, b) => byTime(a.completedAt, b.completedAt) || a.code.localeCompare(b.code)),
    announced: items.filter(i => i.item.announcedAt).map(i => i.item)
      .sort((a, b) => byTime(b.announcedAt, a.announcedAt)),
    stillJudging: all.filter(x => !anyNonOpen.has(`${x.kind}:${x.c.id}`)).length,
    maxPlaces: event?.announcementMaxPlaces ?? 3,
  };
}

type Ref = { kind: string; refId: string; stateId: string | null };

/** Is that result (national or one state's) VERIFIED within the event? 404 if not the event's. */
async function verifiedRef(eventId: string, { kind, refId, stateId }: Ref): Promise<{ status: number; error?: string; verified?: boolean }> {
  if (kind !== "event" && kind !== "walkin") return { status: 400, error: "INVALID_KIND" };
  const row = kind === "event"
    ? await db.eventCompetition.findFirst({ where: { id: refId, eventId }, select: { judgingStatus: true } })
    : await db.eventWalkInCompetition.findFirst({ where: { id: refId, eventId }, select: { judgingStatus: true } });
  if (!row) return { status: 404, error: "NOT_FOUND" };
  const verified = stateId
    ? (await db.judgingStateStatus.findUnique({ where: { scope_refId_stateId: { scope: kind, refId, stateId } }, select: { judgingStatus: true } }))?.judgingStatus === "VERIFIED"
    : row.judgingStatus === "VERIFIED";
  return { status: 200, verified };
}

const entryWhere = (eventId: string, r: Ref) =>
  ({ eventId_kind_refId_stateId: { eventId, kind: r.kind, refId: r.refId, stateId: r.stateId ?? "" } });

/**
 * Mark (or unmark) a result announced. Announcing needs it VERIFIED and — when
 * `requireGreenLight` (MC boards) — green-lit by a Super Admin. Unmarking is
 * always allowed and puts it back in the list.
 */
export async function setAnnounced(
  eventId: string, kind: string, refId: string, stateId: string | null, announced: boolean, by: string | null,
  opts: { requireGreenLight?: boolean } = {},
): Promise<{ status: number; error?: string }> {
  const ref = { kind, refId, stateId };
  const v = await verifiedRef(eventId, ref);
  if (v.error) return { status: v.status, error: v.error };

  if (!announced) {
    await db.announcementEntry.updateMany({
      where: { eventId, kind, refId, stateId: stateId ?? "" }, data: { announcedAt: null, announcedBy: null },
    });
    return { status: 200 };
  }
  if (!v.verified) return { status: 409, error: "NOT_VERIFIED" };
  if (opts.requireGreenLight) {
    const e = await db.announcementEntry.findUnique({ where: entryWhere(eventId, ref), select: { greenLight: true } });
    if (!e?.greenLight) return { status: 409, error: "NOT_GREEN_LIT" };
  }
  // Keep the first announcement's time and board.
  await db.announcementEntry.upsert({
    where:  entryWhere(eventId, ref),
    create: { eventId, kind, refId, stateId: stateId ?? "", announcedAt: new Date(), announcedBy: by },
    update: {},
  });
  await db.announcementEntry.updateMany({
    where: { eventId, kind, refId, stateId: stateId ?? "", announcedAt: null }, data: { announcedAt: new Date(), announcedBy: by },
  });
  return { status: 200 };
}

/** Green light on / off for a verified result (Super Admin). */
export async function setGreenLight(
  eventId: string, ref: Ref, on: boolean, by: string,
): Promise<{ status: number; error?: string }> {
  const v = await verifiedRef(eventId, ref);
  if (v.error) return { status: v.status, error: v.error };
  if (on && !v.verified) return { status: 409, error: "NOT_VERIFIED" };
  const data = on ? { greenLight: true, greenLitAt: new Date(), greenLitBy: by } : { greenLight: false, greenLitAt: null, greenLitBy: null };
  await db.announcementEntry.upsert({
    where:  entryWhere(eventId, ref),
    create: { eventId, kind: ref.kind, refId: ref.refId, stateId: ref.stateId ?? "", ...data },
    update: data,
  });
  return { status: 200 };
}

/**
 * Save the announcement list's order (Super Admin drag-and-drop): `keys` are
 * announceKey()s in the new order; each gets its position.
 */
export async function reorderAnnouncements(eventId: string, keys: string[]): Promise<{ status: number; error?: string }> {
  const refs = keys.map(k => {
    const [kind, refId, stateId] = k.split(":");
    return { kind, refId, stateId: stateId || "" };
  });
  if (refs.some(r => (r.kind !== "event" && r.kind !== "walkin") || !r.refId)) return { status: 400, error: "INVALID_KEYS" };
  await db.$transaction(refs.map((r, i) => db.announcementEntry.upsert({
    where:  { eventId_kind_refId_stateId: { eventId, kind: r.kind, refId: r.refId, stateId: r.stateId } },
    create: { eventId, kind: r.kind, refId: r.refId, stateId: r.stateId, sortOrder: i },
    update: { sortOrder: i },
  })));
  return { status: 200 };
}

/** Configuration: places the MC boards announce per result (Super Admin). */
export async function setMaxPlaces(eventId: string, maxPlaces: unknown): Promise<{ status: number; error?: string }> {
  const n = Number(maxPlaces);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PLACES_LIMIT) return { status: 400, error: "INVALID_MAX_PLACES" };
  await db.event.update({ where: { id: eventId }, data: { announcementMaxPlaces: n } });
  return { status: 200 };
}

// Endpoint credentials: 20-hex slug like the judging/results endpoints, and a
// 6-character passcode without look-alike characters.
const PASSCODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const genAnnounceSlug = () => randomBytes(10).toString("hex");
export function genAnnouncePasscode() {
  const buf = randomBytes(6);
  return Array.from(buf, (n) => PASSCODE_CHARS[n % PASSCODE_CHARS.length]).join("");
}
