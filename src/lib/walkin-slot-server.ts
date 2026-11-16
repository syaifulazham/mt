import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildSlotSchedule, isValidSlotScheduleConfig, slotDateChoices, type SlotScheduleConfig } from "@/lib/walkin-slots";

/**
 * Server side of walk-in slot booking. A slot is (date, session, slot): the
 * session times come from the competition's Jadual Slot, and the date is one of
 * the event's days. Single-day events have no date to choose and store "".
 */
export type WalkInSlot = { slotDate: string; sessionNumber: number; slotNumber: number };

type SlotFail = { error: "SLOT_REQUIRED" | "DATE_REQUIRED" | "SLOT_TAKEN"; status: number };

/** The dates a participant chooses from: the event's days left on in the Jadual Slot, or none for a one-day event. */
export function slotDatesOf(event: { startDate: Date | null; endDate: Date | null }, cfg: SlotScheduleConfig | null): string[] {
  return slotDateChoices(event.startDate, event.endDate, cfg);
}

const ACTIVE_REG = { in: ["PENDING", "CONFIRMED"] as ("PENDING" | "CONFIRMED")[] };

/** Is the slot held by an active registration (and, unless excluded, a pending borang entry)? */
export async function slotTaken(wicId: string, slot: WalkInSlot, opts: { includeSubmissions?: boolean } = {}) {
  const [reg, sub] = await Promise.all([
    db.walkInRegistration.findFirst({ where: { walkInCompetitionId: wicId, ...slot, status: ACTIVE_REG }, select: { id: true } }),
    opts.includeSubmissions === false
      ? null
      : db.walkInFormSubmission.findFirst({ where: { walkInCompetitionId: wicId, ...slot, status: "PENDING" }, select: { id: true } }),
  ]);
  return Boolean(reg || sub);
}

/**
 * Validates the slot a request asks for and checks it is still free. With no
 * schedule configured there is no slot (`slot: null`).
 */
export async function claimSlot(
  wicId: string,
  cfg: SlotScheduleConfig | null,
  dates: string[],
  input: { sessionNumber?: unknown; slotNumber?: unknown; slotDate?: unknown },
): Promise<{ slot: WalkInSlot | null } | SlotFail> {
  if (!cfg) return { slot: null };
  const s = Number.isInteger(input.sessionNumber) ? (input.sessionNumber as number) : 0;
  const n = Number.isInteger(input.slotNumber) ? (input.slotNumber as number) : 0;
  if (s < 1 || s > cfg.totalSessions || n < 1 || n > cfg.slotsPerSession) return { error: "SLOT_REQUIRED", status: 400 };
  let slotDate = "";
  if (dates.length > 0) {
    if (typeof input.slotDate !== "string" || !dates.includes(input.slotDate)) return { error: "DATE_REQUIRED", status: 400 };
    slotDate = input.slotDate;
  }
  const slot = { slotDate, sessionNumber: s, slotNumber: n };
  if (await slotTaken(wicId, slot)) return { error: "SLOT_TAKEN", status: 409 };
  return { slot };
}

/** The slot a stored registration/submission holds, or null. */
export function heldSlot(row: { slotDate: string; sessionNumber: number | null; slotNumber: number | null }): WalkInSlot | null {
  return row.sessionNumber != null && row.slotNumber != null
    ? { slotDate: row.slotDate, sessionNumber: row.sessionNumber, slotNumber: row.slotNumber }
    : null;
}

/** Sessions of the schedule with the slots already booked on `slotDate`. */
export async function slotAvailability(wicId: string, cfg: SlotScheduleConfig, slotDate: string) {
  const where = { walkInCompetitionId: wicId, slotDate, sessionNumber: { not: null } };
  const [regs, subs] = await Promise.all([
    db.walkInRegistration.findMany({ where: { ...where, status: ACTIVE_REG }, select: { sessionNumber: true, slotNumber: true } }),
    db.walkInFormSubmission.findMany({ where: { ...where, status: "PENDING" }, select: { sessionNumber: true, slotNumber: true } }),
  ]);
  const booked = [...regs, ...subs];
  return buildSlotSchedule(cfg)
    .filter((b): b is Extract<typeof b, { type: "session" }> => b.type === "session")
    .map((b) => ({
      n: b.n, start: b.start, end: b.end,
      booked: booked.filter((r) => r.sessionNumber === b.n).map((r) => r.slotNumber),
    }));
}

/** Slot GET routes: availability for the requested date (sessions null until a valid date is given). */
export async function slotAvailabilityResponse(
  wicId: string, cfg: SlotScheduleConfig, event: { startDate: Date | null; endDate: Date | null }, date: string | null,
) {
  const dates = slotDatesOf(event, cfg);
  if (dates.length > 0 && (!date || !dates.includes(date))) return { config: cfg, dates, sessions: null };
  return { config: cfg, dates, sessions: await slotAvailability(wicId, cfg, dates.length > 0 ? date! : "") };
}

/** Open slot dates of every walk-in competition of an event that has a schedule, keyed by its id. */
export async function eventSlotDatesByWic(eventId: string): Promise<Record<string, string[]>> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { startDate: true, endDate: true, walkInCompetitions: { select: { id: true, walkInSlotSchedule: true } } },
  });
  if (!event) return {};
  const out: Record<string, string[]> = {};
  for (const w of event.walkInCompetitions) {
    if (isValidSlotScheduleConfig(w.walkInSlotSchedule)) out[w.id] = slotDatesOf(event, w.walkInSlotSchedule);
  }
  return out;
}

export type DatePlanItem = { id: string; slotDate: string | null; reason?: "NO_FREE_DATE" };

/**
 * Proposes a date for each pending borang entry of the event that has none
 * (booked before the event had a date step). Entries keep their session and
 * slot and go to the earliest open date where that slot is still free; entries
 * without a slot go to the open date with the fewest entries. Entries are taken
 * oldest first, so earlier bookings get the earlier days.
 */
export async function planUndatedSubmissions(eventId: string): Promise<DatePlanItem[]> {
  const datesByWic = await eventSlotDatesByWic(eventId);
  const wicIds = Object.keys(datesByWic).filter((id) => datesByWic[id].length > 0);
  if (wicIds.length === 0) return [];
  const [undated, subs, regs] = await Promise.all([
    db.walkInFormSubmission.findMany({
      where: { walkInCompetitionId: { in: wicIds }, status: "PENDING", slotDate: "" },
      orderBy: { createdAt: "asc" },
      select: { id: true, walkInCompetitionId: true, sessionNumber: true, slotNumber: true },
    }),
    db.walkInFormSubmission.findMany({
      where: { walkInCompetitionId: { in: wicIds }, status: "PENDING", slotDate: { not: "" } },
      select: { walkInCompetitionId: true, slotDate: true, sessionNumber: true, slotNumber: true },
    }),
    db.walkInRegistration.findMany({
      where: { walkInCompetitionId: { in: wicIds }, status: ACTIVE_REG, slotDate: { not: "" } },
      select: { walkInCompetitionId: true, slotDate: true, sessionNumber: true, slotNumber: true },
    }),
  ]);
  const key = (w: string, d: string, s: number, n: number) => `${w}|${d}|${s}|${n}`;
  const taken = new Set<string>();
  const perDay = new Map<string, number>();
  for (const r of [...subs, ...regs]) {
    perDay.set(`${r.walkInCompetitionId}|${r.slotDate}`, (perDay.get(`${r.walkInCompetitionId}|${r.slotDate}`) ?? 0) + 1);
    if (r.sessionNumber != null && r.slotNumber != null) taken.add(key(r.walkInCompetitionId, r.slotDate, r.sessionNumber, r.slotNumber));
  }
  return undated.map((s) => {
    const dates = datesByWic[s.walkInCompetitionId];
    let date: string | undefined;
    if (s.sessionNumber != null && s.slotNumber != null) {
      date = dates.find((d) => !taken.has(key(s.walkInCompetitionId, d, s.sessionNumber!, s.slotNumber!)));
      if (date) taken.add(key(s.walkInCompetitionId, date, s.sessionNumber, s.slotNumber));
    } else {
      date = [...dates].sort((a, b) => (perDay.get(`${s.walkInCompetitionId}|${a}`) ?? 0) - (perDay.get(`${s.walkInCompetitionId}|${b}`) ?? 0))[0];
    }
    if (!date) return { id: s.id, slotDate: null, reason: "NO_FREE_DATE" as const };
    perDay.set(`${s.walkInCompetitionId}|${date}`, (perDay.get(`${s.walkInCompetitionId}|${date}`) ?? 0) + 1);
    return { id: s.id, slotDate: date };
  });
}

/** A unique violation on the slot index (rather than on participant/competition). */
export function isSlotConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.includes("sessionNumber") : String(target ?? "").includes("slot");
}

// ── Moving bookings between days ────────────────────────────────────────────

export type DateMoveItem = {
  kind: "registration" | "submission";
  id: string;
  name: string;
  from: { sessionNumber: number | null; slotNumber: number | null };
  /** Where it goes on the new day; null when no free slot is left. */
  to: { sessionNumber: number | null; slotNumber: number | null } | null;
};

/**
 * Plan for moving every active booking (PENDING/CONFIRMED registrations and
 * pending borang entries) of `from` to `to`: each keeps its session/slot when
 * that is free on `to`, otherwise takes the first free slot of the same
 * session, then of the nearest session (later first). When `to` is today
 * (Malaysia time), sessions that have already started are not used.
 * Bookings without a slot only change date.
 */
export async function planDateMove(wicId: string, cfg: SlotScheduleConfig, from: string, to: string, now = new Date()): Promise<DateMoveItem[]> {
  const ACTIVE = { in: ["PENDING", "CONFIRMED"] as ("PENDING" | "CONFIRMED")[] };
  const [regs, subs, regsTo, subsTo] = await Promise.all([
    db.walkInRegistration.findMany({
      where: { walkInCompetitionId: wicId, slotDate: from, status: ACTIVE },
      select: { id: true, sessionNumber: true, slotNumber: true, participant: { select: { name: true } }, team: { select: { name: true } } },
    }),
    db.walkInFormSubmission.findMany({
      where: { walkInCompetitionId: wicId, slotDate: from, status: "PENDING" },
      select: { id: true, sessionNumber: true, slotNumber: true, name: true, teamName: true },
    }),
    db.walkInRegistration.findMany({ where: { walkInCompetitionId: wicId, slotDate: to, status: ACTIVE, sessionNumber: { not: null } }, select: { sessionNumber: true, slotNumber: true } }),
    db.walkInFormSubmission.findMany({ where: { walkInCompetitionId: wicId, slotDate: to, status: "PENDING", sessionNumber: { not: null } }, select: { sessionNumber: true, slotNumber: true } }),
  ]);

  const key = (s: number, n: number) => `${s}:${n}`;
  const taken = new Set([...regsTo, ...subsTo].map((r) => key(r.sessionNumber!, r.slotNumber!)));

  // Sessions still usable on `to`.
  const today = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const nowMin = to === today ? (new Date(now.getTime() + 8 * 3600_000).getUTCHours() * 60 + new Date(now.getTime() + 8 * 3600_000).getUTCMinutes()) : -1;
  const sessions = buildSlotSchedule(cfg)
    .filter((b): b is Extract<typeof b, { type: "session" }> => b.type === "session" && b.start > nowMin)
    .map((b) => b.n);

  const items = [
    ...regs.map((r) => ({ kind: "registration" as const, id: r.id, name: r.team?.name ?? r.participant.name, s: r.sessionNumber, n: r.slotNumber })),
    ...subs.map((r) => ({ kind: "submission" as const, id: r.id, name: r.teamName ?? r.name, s: r.sessionNumber, n: r.slotNumber })),
  ].sort((a, b) => (a.s ?? 0) - (b.s ?? 0) || (a.n ?? 0) - (b.n ?? 0));

  const firstFree = (s: number) => {
    for (let n = 1; n <= cfg.slotsPerSession; n++) if (!taken.has(key(s, n))) return n;
    return null;
  };
  const out: DateMoveItem[] = [];
  for (const it of items) {
    const from = { sessionNumber: it.s, slotNumber: it.n };
    if (it.s == null || it.n == null) { out.push({ kind: it.kind, id: it.id, name: it.name, from, to: from }); continue; }
    let to: DateMoveItem["to"] = null;
    if (sessions.includes(it.s) && it.n <= cfg.slotsPerSession && !taken.has(key(it.s, it.n))) to = { sessionNumber: it.s, slotNumber: it.n };
    else {
      // Same session first, then nearest — later before earlier at equal distance.
      const order = [...sessions].sort((a, b) => Math.abs(a - it.s!) - Math.abs(b - it.s!) || b - a);
      for (const s of order) { const n = firstFree(s); if (n) { to = { sessionNumber: s, slotNumber: n }; break; } }
    }
    if (to) taken.add(key(to.sessionNumber!, to.slotNumber!));
    out.push({ kind: it.kind, id: it.id, name: it.name, from, to });
  }
  return out;
}
