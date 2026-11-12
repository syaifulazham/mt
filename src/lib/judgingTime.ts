/**
 * Judging TIME criteria: times are stored as (fractional) seconds. Each
 * criterion picks how precisely judges record them (`timePrecision`, decimal
 * places of a second): 0 = saat, 2 = 1/100 saat, 3 = milisaat. Client-safe.
 */
export type TimePrecision = 0 | 2 | 3;
export const TIME_PRECISIONS: { value: TimePrecision; label: string; example: string }[] = [
  { value: 0, label: "Saat",       example: "mm:ss" },
  { value: 2, label: "1/100 saat", example: "mm:ss.00" },
  { value: 3, label: "Milisaat",   example: "mm:ss.000" },
];

export function parsePrecision(v: unknown): TimePrecision {
  const n = Number(v);
  return n === 2 || n === 3 ? n : 0;
}

/** Rounds seconds to the criterion's precision (and away from float noise). */
export function roundTime(sec: number, precision: number = 3): number {
  const f = 10 ** precision;
  return Math.round(sec * f) / f;
}

/** Decimal places needed to show `sec` exactly (0, 2 or 3). */
function autoPrecision(sec: number): TimePrecision {
  const ms = Math.round(sec * 1000);
  if (ms % 1000 === 0) return 0;
  return ms % 10 === 0 ? 2 : 3;
}

/**
 * m:ss, m:ss.00 or m:ss.000. Without `precision` it shows only the decimals the
 * value has (whole-second times keep looking like before).
 */
export function formatTime(sec: number, precision?: number, padMinutes = false): string {
  const p = precision == null ? autoPrecision(sec) : precision;
  const f = 10 ** p;
  const total = Math.round(Math.max(0, sec) * f);       // in 1/f seconds
  const m = Math.floor(total / (60 * f));
  const rest = total - m * 60 * f;
  const s = Math.floor(rest / f);
  const frac = rest - s * f;
  const mm = padMinutes ? String(m).padStart(2, "0") : String(m);
  return `${mm}:${String(s).padStart(2, "0")}${p ? "." + String(frac).padStart(p, "0") : ""}`;
}

/** "m:ss", "m:ss.xx", "ss" or "ss.xxx" → seconds; null if not a time. */
export function parseTime(val: string): number | null {
  const v = val.trim().replace(",", ".");
  if (!v) return null;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(v);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const sec = Number(m[2]);
  if (m[1] && sec >= 60) return null;
  return roundTime(min * 60 + sec);
}

/** "1m 5s" / "2.35s" — the compact style of the judging boards and result tables. */
export function formatDuration(sec: number): string {
  const p = autoPrecision(sec);
  const t = roundTime(Math.max(0, sec), p);
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(p);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Points for a TIME criterion: `maxScore` at 0 s, falling linearly to 0 at
 * `maxTime` (and 0 beyond it), to 2 decimals — e.g. max 100, maxTime 2.000 s,
 * 1.020 s → 49. Null when there is no time, or the criterion has no maxScore /
 * maxTime (then the time only breaks ties).
 */
export function timeScore(c: { maxScore: number | null; maxTime: number | null }, sec: number | null | undefined): number | null {
  if (sec == null || !(sec > 0) || c.maxScore == null || c.maxTime == null || !(c.maxTime > 0)) return null;
  return Math.round(Math.max(0, c.maxScore * (1 - sec / c.maxTime)) * 100) / 100;
}
