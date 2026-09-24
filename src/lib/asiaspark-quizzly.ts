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

/** Confirms the key and reports its effective scopes — useful for diagnosis. */
export function quizzlyPing() {
  return req<{ status: string; org_id: string; scopes: string[]; quiz_ids: string[] | null }>("/api/v1/ping");
}

export function quizzlyErrorMessage(err: { status?: number; message?: string }): string {
  if (err.status === 401) return "Kunci API Asia Spark Quizzly ditolak (ASIASPARK_QUIZZLY_API_KEY). Hubungi pentadbir.";
  if (err.status === 403) return "Kunci API tiada skop `sessions:read` untuk Asia Spark Quizzly.";
  return err.message ?? "Ralat API Asia Spark Quizzly";
}
