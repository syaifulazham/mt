const BASE_URL   = process.env.WALKIN_VIBEBLOCKS_URL ?? "";
const API_KEY    = process.env.WALKIN_VIBEBLOCKS_API_KEY ?? "";
const TIMEOUT_MS = 10_000;

export function vibeBlocksConfigured() {
  return !!API_KEY && !!BASE_URL;
}

/** Generate an 8-character uppercase alphanumeric entry token (A-Z 0-9). */
export function generateEntryToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let t = "";
  for (let i = 0; i < 8; i++) t += chars[Math.floor(Math.random() * chars.length)];
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
    if (!res.ok)
      throw Object.assign(
        new Error(json?.error?.message ?? json?.error ?? "VibeBlocks API error"),
        { status: res.status, body: json },
      );
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type VibeBlocksEvent = {
  event_id: string;
  challenge_id: string;
  name: string;
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
  return req<VibeBlocksEntryRegistrationResponse>(
    `/v1/partner/events/${encodeURIComponent(eventId)}/entries`,
    {
      method: "POST",
      body: JSON.stringify({
        entry_token: opts.entryToken,
        ...(opts.partnerReference ? { partner_reference: opts.partnerReference } : {}),
      }),
    },
  );
}

export async function vibeBlocksReplaceToken(
  eventId: string,
  entryId: string,
  entryToken: string,
) {
  return req<VibeBlocksEntryTokenReplacementResponse>(
    `/v1/partner/events/${encodeURIComponent(eventId)}/entries/${encodeURIComponent(entryId)}/token`,
    { method: "PUT", body: JSON.stringify({ entry_token: entryToken }) },
  );
}

export async function vibeBlocksQueryResults(eventId: string, entryIds: string[]) {
  return req<VibeBlocksResultsQueryResponse>(
    `/v1/partner/events/${encodeURIComponent(eventId)}/results:query`,
    { method: "POST", body: JSON.stringify({ entry_ids: entryIds }) },
  );
}

export type VibeBlocksCreateEventRequest = {
  event_id: string;
  challenge_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  run_duration_sec: number;
};

export type VibeBlocksCreateEventResponse = {
  event_id: string;
  challenge_id: string;
  name: string;
  status: string;
  starts_at: string;
  ends_at: string;
  run_duration_sec: number;
  already_exists: boolean;
};

export type VibeBlocksUpdateEventResponse = {
  event_id: string;
  updated: boolean;
};

export async function vibeBlocksCreateEvent(opts: VibeBlocksCreateEventRequest) {
  return req<VibeBlocksCreateEventResponse>("/v1/partner/events", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function vibeBlocksUpdateEvent(
  eventId: string,
  patch: Partial<Pick<VibeBlocksCreateEventRequest, "name" | "starts_at" | "ends_at" | "run_duration_sec">> & { status?: "open" | "closed" },
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
  createEvent: vibeBlocksCreateEvent,
  updateEvent: vibeBlocksUpdateEvent,
};
