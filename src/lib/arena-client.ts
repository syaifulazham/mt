// Client for the "arena" partner APIs — Eptim FC-1 (Viblock Arena, see
// VIBLOCK-ARENA-API-GUIDELINE.md) and Eptim Drone (EPTIM-DRONE-API-GUIDE.md).
// Both expose the same contract: X-API-Key scoped to ONE partner event,
// sectors + synthetic-userid players, GET /challenges, challenge registrations,
// attempt summaries, and single-use one-click launch codes. Only the base URL,
// key, web-app URL and naming differ, so one implementation serves both.

const TIMEOUT_MS = 10_000;

export type ArenaChallenge = {
  id: string;
  name: string;
  description: string | null;
  challenge_mode: string;
  status: string;
  order_index: number;
  max_attempts?: number | null;
  created_at: string;
};

export type ArenaRegistration = {
  registration_id: string;
  challenge_id: string;
  user_id: string;
  userid: string | null;
  full_name: string;
  external_ref: string | null;
  registered_at: string;
};

export type ArenaLaunchStatus = {
  status: "valid" | "used" | "expired";
  expires_at: string; used_at: string | null; seconds_remaining: number;
};

export type ArenaAttempts = {
  attempted: boolean;
  completed: boolean;
  attempt_count: number;
  max_attempts: number | null;
  attempts_remaining: number | null;
  best_attempt: { score: number; max_score: number; elapsed_seconds: number; completed_at: string } | null;
};

export type ArenaClientConfig = {
  label: string;      // "Eptim FC-1" — used in error messages
  baseUrl: string;
  apiKey: string;
  appUrl: string;     // the partner web app that redeems ?launch=<code>
  env: { baseUrl: string; apiKey: string; appUrl: string }; // env var names, for messages
};

export function createArenaClient(config: ArenaClientConfig) {
  const BASE_URL = config.baseUrl.replace(/\/$/, "");
  const API_KEY  = config.apiKey;
  const APP_URL  = config.appUrl.replace(/\/$/, "");
  const { label, env } = config;

  async function req<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    if (!BASE_URL) throw new Error(`${env.baseUrl} not configured`);
    if (!API_KEY)  throw new Error(`${env.apiKey} not configured`);

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
          new Error(`${label} returned a non-JSON response (${res.status}) — check ${env.baseUrl}`),
          { status: res.status, detail: text.slice(0, 500) },
        );
      }
      if (!res.ok)
        throw Object.assign(new Error(json?.error ?? `${label} API error (${res.status})`), {
          status: res.status, detail: text.slice(0, 500),
        });
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  const tolerate409 = (e: { status?: number }) => { if (e.status !== 409) throw e; };

  return {
    configured: () => !!BASE_URL && !!API_KEY,

    /** Challenges of the key's event, in `order_index` order. */
    async listChallenges(): Promise<{ eventId: string; challenges: ArenaChallenge[] }> {
      const json = await req<{ event_id: string; challenges: ArenaChallenge[] }>("/challenges");
      return { eventId: json.event_id, challenges: json.challenges ?? [] };
    },

    // ── Players & sectors ── one sector per contingent; a player must be in a
    // sector of the event or the partner refuses sign-in, registration and launch.

    /** `available: false` means the userid already exists in this event. */
    checkUser: (userid: string) =>
      req<{ userid: string; available: boolean }>(`/users/check/${encodeURIComponent(userid)}`),

    createUser: (input: { userid: string; password: string; full_name: string }) =>
      req<{ id: string; email: string; full_name: string; userid: string }>("/users", { method: "POST", body: input }),

    checkSector: (customId: string) =>
      req<{ custom_id: string; available: boolean }>(`/sectors/check/${encodeURIComponent(customId)}`),

    createSector: (input: { sector_name: string; custom_id: string; region?: string; other_details?: Record<string, unknown> }) =>
      req("/sectors", { method: "POST", body: input }),

    assignMember: (sectorCustomId: string, userid: string) =>
      req(`/sectors/${encodeURIComponent(sectorCustomId)}/members`, { method: "POST", body: { userid } }),

    /**
     * Runs a call that needs sector membership. On a 403 (player in no sector of
     * the event) the membership is restored and the call retried once.
     */
    async withSectorRepair<T>(userid: string, sectorCustomId: string, call: () => Promise<T>): Promise<T> {
      try {
        return await call();
      } catch (e: unknown) {
        if ((e as { status?: number }).status !== 403) throw e;
        await req(`/sectors/${encodeURIComponent(sectorCustomId)}/members`, { method: "POST", body: { userid } })
          .catch(tolerate409);
        return call();
      }
    },

    // ── One-click launch ──

    /**
     * Single-use, 5-minute launch code that signs the player into the partner
     * web app without a password. Server-only: it needs the API key.
     */
    async launchUrl(userid: string): Promise<{ code: string; url: string; expiresAt: string }> {
      if (!APP_URL) throw Object.assign(new Error(`${env.appUrl} not configured`), { status: 503 });
      const json = await req<{ user_id: string; launch_code: string; launch_path: string; expires_at: string }>(
        "/auth/launch", { method: "POST", body: { userid } },
      );
      const path = json.launch_path || `/?launch=${encodeURIComponent(json.launch_code)}`;
      return { code: json.launch_code, url: `${APP_URL}${path.startsWith("/") ? "" : "/"}${path}`, expiresAt: json.expires_at };
    },

    /**
     * A stored launch link re-pointed at the current app URL. Only the path +
     * query (`/?launch=<code>`) identifies the launch; the host is config, so a
     * link stored before the app URL changed must not keep the old host.
     */
    rehostLaunchUrl(stored: string): string {
      if (!APP_URL) return stored;
      try {
        const u = new URL(stored);
        return `${APP_URL}${u.pathname}${u.search}`;
      } catch {
        return stored;
      }
    },

    /** State of a launch code from this event; 404 when the partner doesn't know it. */
    launchStatus: (code: string) => req<ArenaLaunchStatus>(`/auth/launch/${encodeURIComponent(code)}`),

    /** Has the player taken / completed the challenge? 404 if challenge or player unknown. */
    attempts: (challengeId: string, userid: string) =>
      req<ArenaAttempts>(`/challenges/${encodeURIComponent(challengeId)}/attempts/${encodeURIComponent(userid)}`),

    // ── Challenge registrations ──

    /**
     * Register a player for one challenge. A 409 ("Already registered") carries
     * the existing registration and is returned as success, so retries are
     * harmless — which is what lets the local write happen after this call
     * without a window that could leave the two sides disagreeing for good.
     */
    async registerChallenge(input: { challengeId: string; userid: string; externalRef?: string }):
      Promise<{ registration: ArenaRegistration; alreadyRegistered: boolean }> {
      try {
        const registration = await req<ArenaRegistration>(
          `/challenges/${encodeURIComponent(input.challengeId)}/registrations`,
          { method: "POST", body: { userid: input.userid, ...(input.externalRef ? { external_ref: input.externalRef } : {}) } },
        );
        return { registration, alreadyRegistered: false };
      } catch (e: unknown) {
        const err = e as { status?: number; detail?: string };
        if (err.status === 409) {
          let existing: ArenaRegistration | undefined;
          try { existing = (JSON.parse(err.detail ?? "") as { registration?: ArenaRegistration }).registration; } catch {}
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
    },

    /** One player's registrations in the key's event; 404 when the player doesn't exist. */
    userRegistrations: (userid: string) =>
      req<{ userid: string; user_id: string; registrations: Omit<ArenaRegistration, "user_id" | "userid" | "full_name">[] }>(
        `/users/${encodeURIComponent(userid)}/registrations`,
      ),

    errorMessage(err: { status?: number; message?: string }): string {
      if (err.status === 401) return `Kunci API ${label} ditolak atau tamat tempoh (${env.apiKey}). Hubungi pentadbir.`;
      return err.message ?? `Ralat API ${label}`;
    },
  };
}

export type ArenaClient = ReturnType<typeof createArenaClient>;

/** One challenge row as the participant dashboard renders it (FC-1 and Drone alike). */
export type ArenaChallengeView = {
  id: string; name: string; status: string; challengeMode: string;
  registered: boolean;
  completed: boolean;
  attemptsRemaining: number | null;
  best: { score: number; maxScore: number } | null;
  link: { url: string; expiresAt: string } | null;
};

/**
 * Per-challenge dashboard rows for one player: completion and attempts from the
 * partner, plus the stored launch link while the partner reports it valid.
 * Without a player yet (`userid` null) nothing is asked upstream. Every call
 * degrades to "unknown" on failure so the section still renders.
 */
export async function arenaChallengeViews(
  client: ArenaClient,
  userid: string | null,
  challenges: { id: string; name: string; status: string; challenge_mode: string }[],
  registrations: Map<string, { launchCode: string | null; launchUrl: string | null }>, // by challengeId
): Promise<ArenaChallengeView[]> {
  return Promise.all(challenges.map(async (c) => {
    const reg = registrations.get(c.id);
    const [attempts, st] = userid && client.configured()
      ? await Promise.all([
          client.attempts(c.id, userid).catch(() => null),
          reg?.launchCode && reg.launchUrl ? client.launchStatus(reg.launchCode).catch(() => null) : null,
        ])
      : [null, null];
    return {
      id: c.id, name: c.name, status: c.status, challengeMode: c.challenge_mode,
      registered:        !!reg,
      completed:         attempts?.completed ?? false,
      attemptsRemaining: attempts?.attempts_remaining ?? null,
      best: attempts?.best_attempt
        ? { score: attempts.best_attempt.score, maxScore: attempts.best_attempt.max_score }
        : null,
      link: st?.status === "valid" && reg?.launchUrl
        ? { url: client.rehostLaunchUrl(reg.launchUrl), expiresAt: st.expires_at }
        : null,
    };
  }));
}

/**
 * The launch link for one registration: the stored one while the partner still
 * reports it `valid`, otherwise a fresh one handed to `persist` for next time.
 * Codes are single-use, so a `used` or `expired` code is always replaced.
 */
export async function resolveLaunchLink(
  client: ArenaClient,
  stored: { launchCode: string | null; launchUrl: string | null },
  userid: string,
  sectorCustomId: string,
  persist: (fresh: { code: string; url: string; expiresAt: Date }) => Promise<unknown>,
): Promise<{ url: string; expiresAt: string }> {
  if (stored.launchCode && stored.launchUrl) {
    const st = await client.launchStatus(stored.launchCode).catch(() => null);
    if (st?.status === "valid") return { url: client.rehostLaunchUrl(stored.launchUrl), expiresAt: st.expires_at };
  }
  const fresh = await client.withSectorRepair(userid, sectorCustomId, () => client.launchUrl(userid));
  await persist({ code: fresh.code, url: fresh.url, expiresAt: new Date(fresh.expiresAt) });
  return { url: fresh.url, expiresAt: fresh.expiresAt };
}
