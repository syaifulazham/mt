// Eptim FC-1 — the Viblock Arena external API (see VIBLOCK-ARENA-API-GUIDELINE.md).
//
// Every request is scoped to ONE Viblock event by its API key, so "the FC-1
// event" is whichever event EPTIMFC1_API_KEY was issued for — there is no event
// id in the URL. This is a separate key from the walk-in Viblock integration in
// viblock.ts (WALKIN_EPTIM_VIBLOCK_*), which points at a different event.
const BASE_URL   = (process.env.EPTIMFC1_BASE_URL ?? "").replace(/\/$/, "");
const API_KEY    = process.env.EPTIMFC1_API_KEY ?? "";
const TIMEOUT_MS = 10_000;

export function fc1Configured() {
  return !!BASE_URL && !!API_KEY;
}

export type Fc1Challenge = {
  id: string;
  name: string;
  description: string | null;
  challenge_mode: string;
  status: string;
  order_index: number;
  created_at: string;
};

async function req<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!BASE_URL) throw new Error("EPTIMFC1_BASE_URL not configured");
  if (!API_KEY)  throw new Error("EPTIMFC1_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-API-Key": API_KEY,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text().catch(() => "");
    let json: { error?: string } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw Object.assign(
        new Error(`Eptim FC-1 returned a non-JSON response (${res.status}) — check EPTIMFC1_BASE_URL`),
        { status: res.status, detail: text.slice(0, 500) },
      );
    }
    if (!res.ok)
      throw Object.assign(new Error(json?.error ?? `Eptim FC-1 API error (${res.status})`), {
        status: res.status, detail: text.slice(0, 500),
      });
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Challenges of the key's event, in `order_index` order. */
export async function fc1ListChallenges(): Promise<{ eventId: string; challenges: Fc1Challenge[] }> {
  const json = await req<{ event_id: string; challenges: Fc1Challenge[] }>("/challenges");
  return { eventId: json.event_id, challenges: json.challenges ?? [] };
}

// ── Player accounts ──────────────────────────────────────────────────────────
// Same shape as the Drone integration (eptim-drone.ts): one sector per
// contingent, one player per participant keyed by IC digits. /auth/token
// refuses players who are in no sector, so the membership is not optional.

/** `available: false` means the userid already exists in this FC-1 event. */
export function fc1CheckUser(userid: string) {
  return req<{ userid: string; available: boolean }>(`/users/check/${encodeURIComponent(userid)}`);
}

export function fc1CreateUser(input: { userid: string; password: string; full_name: string }) {
  return req<{ id: string; email: string; full_name: string; userid: string }>("/users", {
    method: "POST", body: input,
  });
}

export function fc1CheckSector(customId: string) {
  return req<{ custom_id: string; available: boolean }>(`/sectors/check/${encodeURIComponent(customId)}`);
}

export function fc1CreateSector(input: {
  sector_name: string; custom_id: string; region?: string; other_details?: Record<string, unknown>;
}) {
  return req("/sectors", { method: "POST", body: input });
}

export function fc1AssignMember(sectorCustomId: string, userid: string) {
  return req(`/sectors/${encodeURIComponent(sectorCustomId)}/members`, { method: "POST", body: { userid } });
}

// ── Challenge registrations (guide §4.5) ─────────────────────────────────────

export type Fc1Registration = {
  registration_id: string;
  challenge_id: string;
  user_id: string;
  userid: string | null;
  full_name: string;
  external_ref: string | null;
  registered_at: string;
};

/**
 * Register a player for one challenge. A 409 ("Already registered") carries the
 * existing registration and is returned as success, so retries are harmless —
 * which is what lets the local write happen after this call without a window
 * that could leave the two sides disagreeing for good.
 */
export async function fc1RegisterChallenge(input: {
  challengeId: string; userid: string; externalRef?: string;
}): Promise<{ registration: Fc1Registration; alreadyRegistered: boolean }> {
  try {
    const registration = await req<Fc1Registration>(
      `/challenges/${encodeURIComponent(input.challengeId)}/registrations`,
      { method: "POST", body: { userid: input.userid, ...(input.externalRef ? { external_ref: input.externalRef } : {}) } },
    );
    return { registration, alreadyRegistered: false };
  } catch (e: unknown) {
    const err = e as { status?: number; detail?: string };
    if (err.status === 409) {
      let existing: Fc1Registration | undefined;
      try { existing = (JSON.parse(err.detail ?? "") as { registration?: Fc1Registration }).registration; } catch {}
      if (existing) return { registration: existing, alreadyRegistered: true };
      // 409 without a parseable body is still "already registered" by contract.
      return {
        registration: {
          registration_id: "", challenge_id: input.challengeId, user_id: "", userid: input.userid,
          full_name: "", external_ref: input.externalRef ?? null, registered_at: new Date().toISOString(),
        },
        alreadyRegistered: true,
      };
    }
    throw e;
  }
}

/** One player's registrations in the key's event; 404 when the player doesn't exist. */
export function fc1UserRegistrations(userid: string) {
  return req<{ userid: string; user_id: string; registrations: Omit<Fc1Registration, "user_id" | "userid" | "full_name">[] }>(
    `/users/${encodeURIComponent(userid)}/registrations`,
  );
}

/** Stable reference MT sends as `external_ref`, so FC-1 rows trace back here. */
export function fc1ExternalRef(eventCompetitionId: string, participantId: string) {
  return `mt:${eventCompetitionId}:${participantId}`;
}

export function fc1ErrorMessage(err: { status?: number; message?: string }): string {
  if (err.status === 401) return "Kunci API Eptim FC-1 ditolak atau tamat tempoh (EPTIMFC1_API_KEY). Hubungi pentadbir.";
  return err.message ?? "Ralat API Eptim FC-1";
}
