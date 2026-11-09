// How a competition's results are ranked: one national list ("NATIONAL",
// Kebangsaan) or a separate list per state ("STATE", Negeri). Set per event
// competition on the Penghakiman page; unset means the event scope's default.
// Duel competitions keep the same value in duelConfig.scope (their brackets).

export type ResultScope = "NATIONAL" | "STATE";

export const RESULT_SCOPE_LABEL: Record<ResultScope, string> = { NATIONAL: "Kebangsaan", STATE: "Negeri" };

/** ZONE / STATE events (online too) rank per state by default; the rest nationally. */
export function defaultResultScope(eventScope: string): ResultScope {
  return /(^|_)(ZONE|STATE)$/.test(eventScope) ? "STATE" : "NATIONAL";
}

/**
 * The effective result scope: the stored value, else a duel's own bracket scope
 * (set before this setting existed), else the event scope's default.
 */
export function resolveResultScope(
  ec: { resultScope?: string | null; judgingMethod?: string | null; duelConfig?: unknown },
  eventScope: string,
): ResultScope {
  if (ec.resultScope === "NATIONAL" || ec.resultScope === "STATE") return ec.resultScope;
  const dc = ec.duelConfig as { scope?: unknown } | null | undefined;
  if (ec.judgingMethod === "DUEL" && (dc?.scope === "NATIONAL" || dc?.scope === "STATE")) return dc.scope;
  return defaultResultScope(eventScope);
}
