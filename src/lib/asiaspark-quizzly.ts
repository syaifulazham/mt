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
  start_url: string;
  expires_at: string;
  single_use: boolean;
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
  return req<QuizzlyParticipant>("/api/v1/participants?upsert=true", {
    method: "POST",
    body: JSON.stringify({
      personal_id: input.personalId,
      full_name:   input.fullName,
      ...(input.grade       ? { grade:       input.grade.slice(0, 50) }   : {}),
      ...(input.school      ? { school:      input.school.slice(0, 200) } : {}),
      ...(input.nationality ? { nationality: input.nationality }          : {}),
      ...(input.email       ? { email:       input.email }                : {}),
      ...(input.age != null ? { age:         input.age }                  : {}),
      ...(input.gender      ? { gender:      input.gender }               : {}),
    }),
  });
}

/**
 * Mint a single-use login token. `competition_session_id` is passed on purpose:
 * without it the attempt does not show under that session in Quizzly's results,
 * and the quiz-in-session check (422) never runs.
 */
export function quizzlyIssueToken(input: {
  personalId: string; quizId: string; competitionSessionId?: string | null; expiresInSeconds?: number;
}) {
  return req<QuizzlyIssuedToken>("/api/v1/sessions/tokens", {
    method: "POST",
    body: JSON.stringify({
      personal_id: input.personalId,
      quiz_id:     input.quizId,
      ...(input.competitionSessionId ? { competition_session_id: input.competitionSessionId } : {}),
      expires_in:  input.expiresInSeconds ?? 172_800, // 48 h
    }),
  });
}

export type QuizzlyTokenStatus = {
  token_id: string;
  status: "active" | "not_yet_valid" | "redeemed" | "expired" | "revoked";
  expires_at: string | null; redeemed_at: string | null;
  session: { state: string; percentage: number | null; raw_score: number | null; max_score: number | null } | null;
};

export function quizzlyTokenStatus(tokenId: string) {
  return req<QuizzlyTokenStatus>(`/api/v1/sessions/tokens/${encodeURIComponent(tokenId)}`);
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
  return err.message ?? "Ralat API Asia Spark Quizzly";
}
