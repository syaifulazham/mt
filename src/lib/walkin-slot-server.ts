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
