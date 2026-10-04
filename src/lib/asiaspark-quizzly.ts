import { normaliseEmail } from "@/lib/email";

// Asia Spark Quizzly API — see aspark-quiz/QUIZZLY-API_GUIDE.md.
// Read paths used here need the `sessions:read` scope on the key.
const BASE_URL = (process.env.ASIASPARK_QUIZZLY_URL ?? "").replace(/\/$/, "");
const API_KEY  = process.env.ASIASPARK_QUIZZLY_API_KEY ?? "";
const TIMEOUT_MS = 10_000;

export function quizzlyConfigured() {
  return !!BASE_URL && !!API_KEY;
}

export type QuizzlySession = {
  id: string; slug: string; title: string; description: string | null;
  session_type: "public" | "live_tournament" | "online_competition";
  is_active: boolean; opens_at: string | null; closes_at: string | null; quiz_count: number;
};

export type QuizzlySessionQuiz = {
  session_quiz_set_id: string;
  position: number;
  label: string | null;
  quiz_version_id: string;
  quiz: { id: string; slug: string; title: string };
  version: number;
  status: string;
  time_limit_seconds: number | null;
};

/**
 * Quizzly reports failures in an RFC 7807-style body (`title` / `detail`, plus a
 * per-field `errors[]` on 400s), so the message is assembled from those rather
 * than from a bare `error` string.
 */
async function req<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  if (!BASE_URL) throw new Error("ASIASPARK_QUIZZLY_URL not configured");
  if (!API_KEY)  throw new Error("ASIASPARK_QUIZZLY_API_KEY not configured");

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
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw Object.assign(
        new Error(`Quizzly returned a non-JSON response (${res.status}) — check ASIASPARK_QUIZZLY_URL`),
        { status: res.status, detail: text.slice(0, 500) },
      );
    }
    if (!res.ok) {
      const body = json as { title?: string; detail?: string; errors?: { field?: string; message?: string }[] } | null;
      const fields = (body?.errors ?? []).map((e) => `${e.field}: ${e.message}`).join("; ");
      const message = [body?.title, body?.detail, fields].filter(Boolean).join(" — ")
        || `Quizzly API error (${res.status})`;
      throw Object.assign(new Error(message), { status: res.status, detail: text.slice(0, 500) });
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Competition sessions in the org — the "event" a set of quizzes belongs to. */
export async function quizzlyListSessions(): Promise<QuizzlySession[]> {
  const json = await req<{ data: QuizzlySession[] }>("/api/v1/competition-sessions");
  return json.data ?? [];
}

/** One session by id, from the org's session list; null when it is not there. */
export async function quizzlyGetSession(sessionId: string): Promise<QuizzlySession | null> {
  return (await quizzlyListSessions()).find((s) => s.id === sessionId) ?? null;
}

/** Quizzes attached to one session, in display order. */
export async function quizzlySessionQuizzes(sessionId: string): Promise<{
  session: { id: string; title: string; slug: string } | null;
  data: QuizzlySessionQuiz[];
}> {
  const json = await req<{ session: { id: string; title: string; slug: string }; data: QuizzlySessionQuiz[] }>(
    `/api/v1/competition-sessions/${encodeURIComponent(sessionId)}/quizzes`,
  );
  return { session: json.session ?? null, data: json.data ?? [] };
}

export type QuizzlyParticipant = {
  id: string; personal_id: string; full_name: string;
  grade: string | null; school: string | null; nationality: string | null;
};



export type QuizzlyIssuedToken = {
  token: string; token_id: string;
  participant: { id: string; personal_id: string; full_name: string };
  quiz: { id: string; title: string; version: number; question_count?: number; time_limit_seconds?: number | null };
  competition_session_id: string | null;
  session_quiz_set_id?: string | null;
  start_url: string;
  expires_at: string;
  not_before?: string | null;
  single_use: boolean;
  /** e.g. `no_competition_session` — Quizzly's signal that the request was malformed. */
  warnings?: { code: string; detail?: string }[];
};

/**
 * Create or update the participant. `?upsert=true` makes this idempotent on
 * `personal_id`, so re-registering is safe and returns 200 instead of a 409.
 */
export function quizzlyUpsertParticipant(input: {
  personalId: string; fullName: string;
  grade?: string | null; school?: string | null; nationality?: string | null;
  email?: string | null; age?: number | null; gender?: "male" | "female" | null;
}) {
  const email = normaliseEmail(input.email);
  return req<QuizzlyParticipant>("/api/v1/participants?upsert=true", {
    method: "POST",
    body: JSON.stringify({
      personal_id: input.personalId,
      full_name:   input.fullName,
      ...(input.grade       ? { grade:       input.grade.trim().slice(0, 50) }   : {}),
      ...(input.school      ? { school:      input.school.trim().slice(0, 200) } : {}),
      ...(input.nationality ? { nationality: input.nationality }                 : {}),
      ...(email             ? { email }                                          : {}),
      ...(input.age != null ? { age:         input.age }                         : {}),
      ...(input.gender      ? { gender:      input.gender }                      : {}),
    }),
  });
}

/**
 * Mint a single-use login token, bound to exactly one session.
 *
 * `session_quiz_set_id` is Quizzly's identifier for "this quiz in this session"
 * and the recommended form: a quiz version can be shared by several sessions,
 * and the code must land in the student's own one. It implies the quiz, the
 * session and the version, so nothing else is sent alongside it — sending them
 * too would only add ways to get a 422 mismatch. `quiz_id` +
 * `competition_session_id` is the equivalent older form, kept as a fallback.
 */
export function quizzlyIssueToken(input: {
  personalId: string;
  sessionQuizSetId?: string | null;
  quizId?: string; competitionSessionId?: string | null;
  expiresInSeconds?: number;
  notBefore?: string | null;
}) {
  const target = input.sessionQuizSetId
    ? { session_quiz_set_id: input.sessionQuizSetId }
    : {
        quiz_id: input.quizId,
        ...(input.competitionSessionId ? { competition_session_id: input.competitionSessionId } : {}),
      };
  return req<QuizzlyIssuedToken>("/api/v1/sessions/tokens", {
    method: "POST",
    body: JSON.stringify({
      personal_id: input.personalId,
      ...target,
      expires_in:  input.expiresInSeconds ?? DEFAULT_TOKEN_LIFETIME_S,
      ...(input.notBefore ? { not_before: input.notBefore } : {}),
    }),
  });
}

/**
 * `session_quiz_set_id` of a quiz inside a session. For quiz maps saved before
 * the organizer screen started storing it. Throws a 409 when the quiz is no
 * longer in the session, which is an organizer configuration problem.
 */
export async function quizzlyResolveSessionQuizSetId(sessionId: string, quizId: string): Promise<string> {
  const { data } = await quizzlySessionQuizzes(sessionId);
  const hit = data.find((q) => q.quiz.id === quizId);
  if (!hit)
    throw Object.assign(new Error("Kuiz yang ditetapkan tiada lagi dalam sesi Asia Spark ini. Hubungi penganjur."), {
      status: 409, detail: `quiz ${quizId} not in session ${sessionId}`,
    });
  return hit.session_quiz_set_id;
}

const DEFAULT_TOKEN_LIFETIME_S = 172_800; // 48 h, when the session has no closing time
const MIN_TOKEN_LIFETIME_S     = 60;
const MAX_TOKEN_LIFETIME_S     = 2_592_000; // 30 days — Quizzly's cap

/**
 * How long a new code should live, from the session's window: valid until the
 * round closes (capped at 30 days), and not usable before it opens. A fixed
 * lifetime is what made codes issued days ahead expire before the round began.
 *
 * `closed` means the round is over — issuing would only hand out a dead code.
 */
export function quizzlyTokenWindow(
  session: { opens_at: string | null; closes_at: string | null },
  now: Date = new Date(),
): { closed: true } | { closed: false; expiresInSeconds: number; notBefore: string | null } {
  const opens  = session.opens_at  ? new Date(session.opens_at)  : null;
  const closes = session.closes_at ? new Date(session.closes_at) : null;
  if (closes && closes <= now) return { closed: true };

  const notBefore = opens && opens > now ? opens.toISOString() : null;
  const seconds = closes
    ? (closes.getTime() - now.getTime()) / 1000
    // No closing time: the default lifetime, counted from when the code becomes usable.
    : ((opens && opens > now ? opens.getTime() : now.getTime()) - now.getTime()) / 1000 + DEFAULT_TOKEN_LIFETIME_S;

  return {
    closed: false,
    expiresInSeconds: Math.min(MAX_TOKEN_LIFETIME_S, Math.max(MIN_TOKEN_LIFETIME_S, Math.floor(seconds))),
    notBefore,
  };
}

export type QuizzlyTokenState = "active" | "not_yet_valid" | "redeemed" | "expired" | "revoked";

export type QuizzlyTokenStatus = {
  token_id: string;
  status: QuizzlyTokenState;
  not_before?: string | null;
  expires_at: string | null; redeemed_at: string | null; revoked_at?: string | null;
  expired_unused?: boolean;
  session: { state: string; percentage: number | null; raw_score: number | null; max_score: number | null } | null;
};

export function quizzlyTokenStatus(tokenId: string) {
  return req<QuizzlyTokenStatus>(`/api/v1/sessions/tokens/${encodeURIComponent(tokenId)}`);
}

export type QuizzlyTokenLifecycle = {
  token_id: string; status: QuizzlyTokenState;
  /**
   * Lapsed without ever being redeemed — the one case where a replacement is
   * safe. Quizzly resolves revoked → redeemed → expired in that order, so a
   * token that was used never reports `expired`.
   */
  expired_unused: boolean;
  expires_at: string | null; redeemed_at: string | null; revoked_at: string | null;
};

/**
 * Lifecycle state for many tokens, keyed by token id; unknown ids are absent.
 *
 * Uses POST /sessions/tokens/status, and falls back to one GET per token when
 * that endpoint answers 404/405 — so mt keeps working whichever of the two apps
 * is deployed first. Tokens per participant are few, so the fallback is cheap.
 */
export async function quizzlyTokenStatuses(tokenIds: string[]): Promise<Map<string, QuizzlyTokenLifecycle>> {
  const out = new Map<string, QuizzlyTokenLifecycle>();
  const ids = [...new Set(tokenIds)];
  if (ids.length === 0) return out;

  try {
    const json = await req<{ data: QuizzlyTokenLifecycle[] }>("/api/v1/sessions/tokens/status", {
      method: "POST",
      body: JSON.stringify({ token_ids: ids }),
    });
    for (const t of json.data ?? []) out.set(t.token_id, t);
    return out;
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status !== 404 && status !== 405) throw e;
  }

  await Promise.all(ids.map(async (id) => {
    const t = await quizzlyTokenStatus(id).catch(() => null);
    if (!t) return;
    out.set(id, {
      token_id: t.token_id, status: t.status,
      expired_unused: t.expired_unused ?? t.status === "expired",
      expires_at: t.expires_at, redeemed_at: t.redeemed_at, revoked_at: t.revoked_at ?? null,
    });
  }));
  return out;
}

/** Confirms the key and reports its effective scopes — useful for diagnosis. */
export function quizzlyPing() {
  return req<{ status: string; org_id: string; scopes: string[]; quiz_ids: string[] | null }>("/api/v1/ping");
}

/** One row of `EventCompetition.quizzlyQuizMap`; `grade` is null in target-group mode. */
export type QuizzlyQuizAssignment = {
  targetGroupId: string;
  targetGroupName: string;
  grade: string | null;
  quizId: string;
  quizTitle: string;
  /** This quiz in the configured session; absent on maps saved before it was stored. */
  sessionQuizSetId?: string;
};

/**
 * Which quiz a participant sits for one event-competition, given the target
 * groups they fall into.
 *
 * In grade mode the match is on the participant's class grade. Age-range target
 * groups have no class grades, so the organizer's table holds a single row
 * labelled with the age range instead — those fall back to a per-group match,
 * otherwise a BELIA participant would be silently quizless.
 */
export function resolveQuizzlyAssignment(
  map: QuizzlyQuizAssignment[],
  assignBy: string | null,
  matchedGroups: { id: string; classGrades: string[] }[],
  classGrade: string | null,
): QuizzlyQuizAssignment | null {
  const ids = new Set(matchedGroups.map((g) => g.id));
  const gradeless = new Set(matchedGroups.filter((g) => g.classGrades.length === 0).map((g) => g.id));

  if (assignBy === "grade") {
    return map.find((m) => ids.has(m.targetGroupId) && m.grade === classGrade)
        ?? map.find((m) => gradeless.has(m.targetGroupId))
        ?? null;
  }
  return map.find((m) => ids.has(m.targetGroupId) && m.grade === null)
      ?? map.find((m) => ids.has(m.targetGroupId))
      ?? null;
}

export function quizzlyErrorMessage(err: { status?: number; message?: string }): string {
  if (err.status === 401) return "Kunci API Asia Spark Quizzly ditolak (ASIASPARK_QUIZZLY_API_KEY). Hubungi pentadbir.";
  if (err.status === 403) return "Kunci API tiada skop `sessions:read` untuk Asia Spark Quizzly.";
  // A 400 is upstream schema validation on the profile we sent; name the field
  // so the participant knows what to correct instead of seeing raw English.
  if (err.status === 400)
    return `Maklumat profil ditolak oleh Asia Spark Quizzly — sila betulkan di Profil. (${err.message ?? "tidak sah"})`;
  return err.message ?? "Ralat API Asia Spark Quizzly";
}
