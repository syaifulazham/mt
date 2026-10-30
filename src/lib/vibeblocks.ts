import { randomInt } from "crypto";
import { db } from "@/lib/db";

// VibeBlocks Competition Partner API v1.8 (see WALKIN-PARTNER-API-GUIDE.md and
// the TECHLYMPICS-API-INTEGRATION contract). Server-side only: the API key
// must never reach a browser or participant device.

const BASE_URL   = process.env.WALKIN_VIBEBLOCKS_URL ?? "";
const API_KEY    = process.env.WALKIN_VIBEBLOCKS_API_KEY ?? "";
const TIMEOUT_MS = 10_000;

export function vibeBlocksConfigured() {
  return !!API_KEY && !!BASE_URL;
}

/** Contract limits. */
export const VB_EVENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const VB_RUN_DURATION_MIN = 60;
export const VB_RUN_DURATION_MAX = 3600;
export const VB_RUN_DURATION_DEFAULT = 900;
const VB_RESULTS_MAX_IDS = 5000;

/** Generate a random 8-character uppercase alphanumeric entry token (A-Z 0-9). */
export function generateEntryToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let t = "";
  for (let i = 0; i < 8; i++) t += chars[randomInt(chars.length)];
  return t;
}

/** Encode entry_token + entry_id into a single DB string: "AB12CD34:ent_abc..." */
export function encodeVibeBlocksToken(entryToken: string, entryId: string): string {
  return `${entryToken}:${entryId}`;
}

/**
 * Parse a composite viblockToken DB value back into parts.
 * Returns null if the stored value is not a VibeBlocks composite token.
 */
export function parseVibeBlocksToken(
  stored: string,
): { entryToken: string; entryId: string } | null {
  const idx = stored.indexOf(":");
  if (idx < 0) return null;
  const entryToken = stored.slice(0, idx);
  const entryId = stored.slice(idx + 1);
  if (!/^[A-Z0-9]{8}$/.test(entryToken)) return null;
  if (!entryId.startsWith("ent_")) return null;
  return { entryToken, entryId };
}

async function req<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  if (!BASE_URL) throw new Error("WALKIN_VIBEBLOCKS_URL not configured");
  if (!API_KEY) throw new Error("WALKIN_VIBEBLOCKS_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": API_KEY,
        ...(options?.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const e = json?.error;
      const message = typeof e === "string" ? e : (e?.message ?? `VibeBlocks API error (HTTP ${res.status})`);
      const code = typeof e === "object" && e ? (e.code as string | undefined) : undefined;
      throw Object.assign(new Error(message), { status: res.status, code, body: json });
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export type VibeBlocksError = Error & { status?: number; code?: string; body?: unknown };

/** Network failures, timeouts and 5xx are temporary; everything else is final. */
function isTransient(e: unknown) {
  const status = (e as VibeBlocksError).status;
  return status === undefined || status >= 500;
}

/**
 * Retries a request with exponential backoff on temporary failures. The
 * caller passes the same request every time, so a retry after a lost response
 * hits the API's idempotent path (already_registered / already_replaced).
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 500;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

/** Error codes from VibeBlocks, as Malay messages for organizers. */
export function vibeBlocksErrorMessage(e: unknown): string {
  const err = e as VibeBlocksError;
  switch (err.code) {
    case "EVENT_TIMING_LOCKED":
      return "Masa mula/tamat tidak boleh diubah selepas token pertama didaftarkan.";
    case "EVENT_ALREADY_EXISTS":
      return "Event ID ini sudah wujud di VibeBlocks dengan konfigurasi berbeza.";
    case "ENTRY_TOKEN_REVOKED":
      return "Token ini telah dibatalkan.";
    case "ENTRY_TOKEN_ALREADY_USED":
      return "Token telah digunakan pada peranti lain.";
  }
  if (err.status === 401) return "Kunci API VibeBlocks tidak sah. Sila maklumkan pentadbir sistem.";
  if (err.status === 404) return "Acara atau entri tidak dijumpai di VibeBlocks.";
  if (err.status === 410) return "Acara atau token VibeBlocks telah tamat tempoh.";
  if (err.status === undefined) return "Tiada sambungan ke VibeBlocks. Cuba lagi.";
  return err.message || "Ralat VibeBlocks.";
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type VibeBlocksCompetitionRound = "qualifier" | "final";

export type VibeBlocksEvent = {
  event_id: string;
  challenge_id: string;
  name: string;
  competition_round: VibeBlocksCompetitionRound;
  status: "draft" | "open" | "closed";
  starts_at: string;
  ends_at: string;
  run_duration_sec: number;
};

export type VibeBlocksChallenge = {
  id: string;
  name: string;
  description: string | null;
  challenge_mode: string;
  status: string;
  order_index: number;
  created_at: string;
};

export type VibeBlocksEntryRegistrationResponse = {
  entry_id: string;
  event_id: string;
  status: "ready";
  expires_at: string;
  partner_reference: string | null;
  already_registered: boolean;
};

export type VibeBlocksEntryTokenReplacementResponse = {
  entry_id: string;
  event_id: string;
  status: "ready";
  expires_at: string;
  partner_reference: string | null;
  already_replaced: boolean;
};

export type VibeBlocksResultEntry = {
  rank: number | null;
  entry_id: string;
  status: "ready" | "in_progress" | "completed" | "timed_out";
  completed_stage_count: number;
  official_elapsed_ms: number | null;
  partner_reference: string | null;
  token_expires_at: string;
  consumed_at: string | null;
  is_used: boolean;
};

export type VibeBlocksResultsQueryResponse = {
  event_id: string;
  rank_scope: "requested_entry_ids";
  requested_count: number;
  ranked_count: number;
  results: VibeBlocksResultEntry[];
  missing_entry_ids: string[];
  invalid_entry_ids: { index: number; value: string }[];
  duplicate_entry_ids: string[];
};

// ── API functions ──────────────────────────────────────────────────────────────

export async function vibeBlocksHealth() {
  return req<{ status: string; service: string; version: string }>("/v1/partner/health");
}

export async function vibeBlocksListEvents() {
  return req<{ events: VibeBlocksEvent[] }>("/v1/partner/events");
}

export async function vibeBlocksListChallenges(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return req<{ challenges: VibeBlocksChallenge[] }>(`/v1/partner/challenges${qs}`);
}

export async function vibeBlocksRegisterEntry(
  eventId: string,
  opts: { entryToken: string; partnerReference?: string },
) {
  // expires_at is omitted so VibeBlocks applies the event end time.
  const body = JSON.stringify({
    entry_token: opts.entryToken,
    ...(opts.partnerReference ? { partner_reference: opts.partnerReference } : {}),
  });
  return withRetry(() => req<VibeBlocksEntryRegistrationResponse>(
    `/v1/partner/events/${encodeURIComponent(eventId)}/entries`,
    { method: "POST", body },
  ));
}

export async function vibeBlocksReplaceToken(
  eventId: string,
  entryId: string,
  entryToken: string,
) {
  const body = JSON.stringify({ entry_token: entryToken });
  return withRetry(() => req<VibeBlocksEntryTokenReplacementResponse>(
    `/v1/partner/events/${encodeURIComponent(eventId)}/entries/${encodeURIComponent(entryId)}/token`,
    { method: "PUT", body },
  ));
}

export async function vibeBlocksQueryResults(eventId: string, entryIds: string[]) {
  const body = JSON.stringify({ entry_ids: entryIds });
  return withRetry(() => req<VibeBlocksResultsQueryResponse>(
    `/v1/partner/events/${encodeURIComponent(eventId)}/results:query`,
    { method: "POST", body },
  ));
}

/** Better first: more completed stages, then lower official elapsed time. */
function compareResults(a: VibeBlocksResultEntry, b: VibeBlocksResultEntry) {
  return b.completed_stage_count - a.completed_stage_count ||
    (a.official_elapsed_ms ?? Infinity) - (b.official_elapsed_ms ?? Infinity);
}

/**
 * Full-event ranking. VibeBlocks ranks only within the entry_ids of one
 * request, so every ID goes in one request (up to 5,000). Beyond that the
 * requests are split and the ranks recomputed here with the same rules.
 */
export async function vibeBlocksQueryAllResults(eventId: string, entryIds: string[]) {
  if (entryIds.length <= VB_RESULTS_MAX_IDS) return vibeBlocksQueryResults(eventId, entryIds);

  const parts: VibeBlocksResultsQueryResponse[] = [];
  for (let i = 0; i < entryIds.length; i += VB_RESULTS_MAX_IDS)
    parts.push(await vibeBlocksQueryResults(eventId, entryIds.slice(i, i + VB_RESULTS_MAX_IDS)));

  const results = parts.flatMap((p) => p.results);
  // Entries without an accepted stage stay unranked; ties share a rank.
  const ranked = results.filter((r) => r.rank != null).sort(compareResults);
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    r.rank = prev && compareResults(prev, r) === 0 ? prev.rank : i + 1;
  });
  return {
    event_id: eventId,
    rank_scope: "requested_entry_ids" as const,
    requested_count: entryIds.length,
    ranked_count: ranked.length,
    results,
    missing_entry_ids: parts.flatMap((p) => p.missing_entry_ids),
    invalid_entry_ids: parts.flatMap((p) => p.invalid_entry_ids),
    duplicate_entry_ids: parts.flatMap((p) => p.duplicate_entry_ids),
  };
}

/** Same-competition registrations already holding this token. */
async function tokenTaken(walkInCompetitionId: string, token: string) {
  const n = await db.walkInRegistration.count({
    where: { walkInCompetitionId, viblockToken: { startsWith: `${token}:` } },
  });
  return n > 0;
}

async function freshToken(walkInCompetitionId: string) {
  for (;;) {
    const t = generateEntryToken();
    if (!(await tokenTaken(walkInCompetitionId, t))) return t;
  }
}

/** A token VibeBlocks refused as already known (used, revoked or conflicting). */
function isTokenConflict(e: unknown) {
  const err = e as VibeBlocksError;
  return (err.status === 409 || err.status === 410) && /TOKEN/i.test(err.code ?? "");
}

/**
 * Registers a new event-unique token for one registration. A token that
 * VibeBlocks rejects as already known is replaced with a new one; any other
 * error is thrown. The caller must store the returned entry_id.
 */
export async function vibeBlocksRegisterFreshEntry(
  eventId: string,
  opts: { walkInCompetitionId: string; partnerReference: string },
) {
  for (let attempt = 1; ; attempt++) {
    const entryToken = await freshToken(opts.walkInCompetitionId);
    try {
      const res = await vibeBlocksRegisterEntry(eventId, { entryToken, partnerReference: opts.partnerReference });
      return { entryToken, ...res };
    } catch (e) {
      if (attempt >= 3 || !isTokenConflict(e)) throw e;
    }
  }
}

/**
 * Renews an entry's token (PUT .../token). Revokes the old token, clears the
 * device binding, progress and results, and keeps the same entry_id.
 */
export async function vibeBlocksRenewEntry(
  eventId: string,
  entryId: string,
  opts: { walkInCompetitionId: string },
) {
  for (let attempt = 1; ; attempt++) {
    const entryToken = await freshToken(opts.walkInCompetitionId);
    try {
      const res = await vibeBlocksReplaceToken(eventId, entryId, entryToken);
      return { entryToken, ...res };
    } catch (e) {
      if (attempt >= 3 || !isTokenConflict(e)) throw e;
    }
  }
}

/** The live event from VibeBlocks, or null when it does not exist there. */
export async function vibeBlocksGetEvent(eventId: string) {
  const { events } = await vibeBlocksListEvents();
  return events.find((e) => e.event_id === eventId) ?? null;
}

export type VibeBlocksCreateEventRequest = {
  event_id: string;
  challenge_id: string;
  name: string;
  competition_round: VibeBlocksCompetitionRound;
  starts_at: string;
  ends_at: string;
  run_duration_sec: number;
};

export type VibeBlocksCreateEventResponse = VibeBlocksEvent & { already_exists: boolean };

export type VibeBlocksUpdateEventResponse = VibeBlocksEvent & { updated: boolean };

export async function vibeBlocksCreateEvent(opts: VibeBlocksCreateEventRequest) {
  const body = JSON.stringify(opts);
  return withRetry(() => req<VibeBlocksCreateEventResponse>("/v1/partner/events", { method: "POST", body }));
}

export async function vibeBlocksUpdateEvent(
  eventId: string,
  patch: Partial<Pick<VibeBlocksCreateEventRequest, "name" | "competition_round" | "starts_at" | "ends_at" | "run_duration_sec">> & { status?: "open" | "closed" },
) {
  return req<VibeBlocksUpdateEventResponse>(`/v1/partner/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export const vibeBlocks = {
  configured: vibeBlocksConfigured,
  health: vibeBlocksHealth,
  listEvents: vibeBlocksListEvents,
  listChallenges: vibeBlocksListChallenges,
  registerEntry: vibeBlocksRegisterEntry,
  replaceToken: vibeBlocksReplaceToken,
  queryResults: vibeBlocksQueryResults,
  queryAllResults: vibeBlocksQueryAllResults,
  registerFreshEntry: vibeBlocksRegisterFreshEntry,
  renewEntry: vibeBlocksRenewEntry,
  getEvent: vibeBlocksGetEvent,
  createEvent: vibeBlocksCreateEvent,
  updateEvent: vibeBlocksUpdateEvent,
};
