const BASE_URL   = process.env.WALKIN_EPTIM_VIBLOCK_URL ?? "";
const API_KEY    = process.env.WALKIN_EPTIM_VIBLOCK_API_KEY ?? "";
const TIMEOUT_MS = 10_000;

export function viblockConfigured() {
  return !!API_KEY && !!BASE_URL;
}

async function req(path: string, options?: RequestInit) {
  if (!BASE_URL) throw new Error("WALKIN_EPTIM_VIBLOCK_URL not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
        ...(options?.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok)
      throw Object.assign(new Error(json?.error ?? "Viblock API error"), {
        status: res.status,
        body: json,
      });
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// Public competition endpoints (no X-API-Key required)
async function pubReq(path: string, options?: RequestInit) {
  if (!BASE_URL) throw new Error("WALKIN_EPTIM_VIBLOCK_URL not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok)
      throw Object.assign(new Error(json?.error ?? "Viblock API error"), {
        status: res.status,
        body: json,
      });
    return json;
  } finally {
    clearTimeout(timer);
  }
}

let _cachedEventId: string | null = null;

/** Get the first competition-mode event id from Viblock Arena. Cached after first call. */
async function getCompetitionEventId(): Promise<string> {
  if (_cachedEventId) return _cachedEventId;
  const data = await pubReq("/competition/events");
  const events = data?.events;
  if (!events || events.length === 0)
    throw new Error("No competition-mode events found on Viblock Arena");
  _cachedEventId = events[0].id;
  return _cachedEventId!;
}

/**
 * Register a competitor in Viblock Arena competition mode.
 * Returns the registration object including the unique 5-char token.
 */
export async function viblockCompetitionRegister(opts: {
  sector: string;
  region: string;
  name: string;
}): Promise<{ registration_id: string; token: string; event_id: string }> {
  const eventId = await getCompetitionEventId();
  return pubReq("/competition/register", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      sector: opts.sector,
      region: opts.region,
      name: opts.name,
    }),
  });
}

/**
 * List challenges for the event scoped by the API key.
 * Uses authenticated endpoint (X-API-Key required).
 */
export async function viblockGetChallenges(status?: string): Promise<{
  event_id: string;
  challenges: { id: string; name: string; description: string | null; challenge_mode: string; status: string; order_index: number; created_at: string }[];
}> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return req(`/challenges${params}`);
}

export const viblock = {
  configured: viblockConfigured,
  competitionRegister: viblockCompetitionRegister,
  getChallenges: viblockGetChallenges,
  health: () => req("/health"),
};
