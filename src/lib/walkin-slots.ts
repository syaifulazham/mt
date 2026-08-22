// Shared walk-in slot schedule config + timetable builder.
// Used by organizer UI (WalkInManageClient), participant UI (DashboardClient),
// and API routes (availability + registration validation).

export type SlotScheduleConfig = {
  startTime:       string; // "HH:MM"
  endTime:         string; // "HH:MM"
  totalSessions:   number;
  sessionMinutes:  number;
  slotsPerSession: number;
  gapMinutes:      number;
  restStart:       string; // "HH:MM"
  restEnd:         string; // "HH:MM"
};

export const DEFAULT_SLOT_SCHEDULE: SlotScheduleConfig = {
  startTime: "09:20", endTime: "15:55",
  totalSessions: 17, sessionMinutes: 15, slotsPerSession: 20, gapMinutes: 5,
  restStart: "13:00", restEnd: "14:00",
};

export type ScheduleBlock =
  | { type: "session"; n: number; start: number; end: number }
  | { type: "rest"; start: number; end: number };

export function slotTimeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtSlotMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function buildSlotSchedule(cfg: SlotScheduleConfig): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];
  const restS = cfg.restStart ? slotTimeToMin(cfg.restStart) : null;
  const restE = cfg.restEnd   ? slotTimeToMin(cfg.restEnd)   : null;
  const hasRest = restS != null && restE != null && restE > restS;
  let cursor = slotTimeToMin(cfg.startTime);
  let restDone = !hasRest;
  for (let i = 1; i <= cfg.totalSessions; i++) {
    if (!restDone && cursor + cfg.sessionMinutes > restS!) {
      blocks.push({ type: "rest", start: restS!, end: restE! });
      restDone = true;
      cursor = restE!;
    }
    blocks.push({ type: "session", n: i, start: cursor, end: cursor + cfg.sessionMinutes });
    cursor += cfg.sessionMinutes + cfg.gapMinutes;
  }
  return blocks;
}

export function isValidSlotScheduleConfig(v: unknown): v is SlotScheduleConfig {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  const timeOk = (s: unknown) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
  const numOk  = (n: unknown, min: number) => typeof n === "number" && Number.isInteger(n) && n >= min;
  return (
    timeOk(c.startTime) && timeOk(c.endTime) && timeOk(c.restStart) && timeOk(c.restEnd) &&
    numOk(c.totalSessions, 1) && numOk(c.sessionMinutes, 1) &&
    numOk(c.slotsPerSession, 1) && numOk(c.gapMinutes, 0)
  );
}
