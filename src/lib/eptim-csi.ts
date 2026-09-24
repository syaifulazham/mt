// Eptim CSI (csi.eptim.ai) organization API — see EPTIM-CSI-API_GUIDELINE.md.
// One origin serves both the API (/api/v1) and the player-facing pages, so
// EPTIMCSI_APP_URL doubles as the API base.
const BASE_URL = (process.env.EPTIMCSI_APP_URL ?? "").replace(/\/$/, "");
const API_KEY  = process.env.EPTIMCSI_API_KEY ?? "";
const TIMEOUT_MS = 10_000;

export function csiConfigured() {
  return !!BASE_URL && !!API_KEY;
}

/** Build a valid CSI user_id from an opaque id (letters, digits, dot, underscore, hyphen; 3–64 chars). */
export function toCsiUserId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return cleaned.slice(0, 64);
}

export type CsiUser = {
  id: string; user_id: string; alias: string;
  other_details: Record<string, unknown>; created_at: string;
};
export type CsiLoginResponse = {
  user: { id: string; user_id: string; alias: string; other_details: Record<string, unknown> };
  login_url: string;
  login_url_expires_at: string;
  session: { access_token: string; refresh_token: string; expires_at: number; token_type: string };
};
export type CsiCase = {
  id: string; slug: string; title: string; summary: string | null;
  difficulty: number | null; status: string; max_score: number | null;
  cover_url: string | null; briefing_path: string; published_at: string | null;
};
export type CsiCompetition = {
  id: string; name: string; description: string | null;
  time_limit_minutes: number | null; case_count: number;
  competition_path: string; created_at: string;
};

async function req<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  if (!BASE_URL) throw new Error("EPTIMCSI_APP_URL not configured");
  if (!API_KEY)  throw new Error("EPTIMCSI_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${API_KEY}`,
        ...(options?.headers ?? {}),
      },
    });
    const text = await res.text().catch(() => "");
    const json = text ? (JSON.parse(text) as { error?: string } | null) ?? null : null;
    if (!res.ok)
      throw Object.assign(
        new Error(json?.error ?? `Eptim CSI API error (${res.status})`),
        { status: res.status, detail: text.slice(0, 500) },
      );
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export function csiCreateUser(opts: {
  userId: string; name: string; password: string; otherDetails?: Record<string, unknown>;
}) {
  return req<CsiUser & { name: string }>("/api/v1/users", {
    method: "POST",
    body: JSON.stringify({
      user_id:  opts.userId,
      name:     opts.name,
      password: opts.password,
      ...(opts.otherDetails ? { other_details: opts.otherDetails } : {}),
    }),
  });
}

/**
 * Rotate the password of an already-provisioned player. CSI has no password
 * recovery, so this is how a team whose local credentials were lost regains
 * remote login. `name` is deliberately omitted: sending it re-derives the
 * public alias.
 */
export function csiSetPassword(userId: string, password: string) {
  return req<{ id: string; user_id: string; alias: string; password_changed: boolean }>("/api/v1/users", {
    method: "PATCH",
    body: JSON.stringify({ user_id: userId, password }),
  });
}

/** Look up a player. Returns null when CSI does not know the user_id. */
export async function csiGetUser(userId: string): Promise<CsiUser | null> {
  try {
    return await req<CsiUser>(`/api/v1/users?user_id=${encodeURIComponent(userId)}`);
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function csiListCases(status = "published"): Promise<CsiCase[]> {
  const json = await req<{ cases?: CsiCase[] }>(`/api/v1/cases?status=${encodeURIComponent(status)}`);
  return json.cases ?? [];
}

/** The organization's CSI competitions, newest first. */
export async function csiListCompetitions(): Promise<CsiCompetition[]> {
  const json = await req<{ competitions?: CsiCompetition[] }>("/api/v1/competitions");
  return json.competitions ?? [];
}

/** The cases attached to one CSI competition, in the order CSI lists them. */
export async function csiListCompetitionCases(competitionId: string) {
  return req<{
    competition: { id: string; name: string; time_limit_minutes: number | null };
    cases: CsiCase[];
  }>(`/api/v1/competitions/${encodeURIComponent(competitionId)}/cases`);
}

/**
 * Mint a one-time browser login link. It is single-use and expires in 120
 * seconds, so it must be requested at the moment of the click and followed
 * straight away.
 */
export function csiLogin(userId: string, password: string, next?: string) {
  return req<CsiLoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, password, ...(next ? { next } : {}) }),
  });
}

/** Map an upstream failure onto a message that is safe to show a participant. */
export function csiErrorMessage(e: unknown): string {
  const err = e as { message?: string; status?: number };
  if (err.status === 401)
    return "Kunci API Eptim CSI ditolak (EPTIMCSI_API_KEY). Hubungi pentadbir.";
  if (err.status === 429)
    return "Terlalu banyak percubaan. Cuba sebentar lagi.";
  return err.message ?? "Sambungan ke Eptim CSI gagal.";
}
