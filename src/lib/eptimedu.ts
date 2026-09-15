const BASE_URL      = process.env.EPTIMEDU_BASE_URL ?? "";
const API_KEY       = process.env.EPTIMEDU_API_KEY  ?? "";
const TIMEOUT_MS    = parseInt(process.env.EPTIMEDU_TIMEOUT_MS ?? "15000", 10);

export function eptimEduConfigured() {
  return !!API_KEY && !!BASE_URL;
}

type ZodFlattened = { formErrors?: string[]; fieldErrors?: Record<string, string[]> };

/**
 * EptimEdu returns `{ error: <string> }` for most failures but `{ error: <zod
 * flatten> }` for 400s. Passing the object straight to `new Error()` produced
 * "[object Object]" in the logs and in the error shown to the user.
 */
function errorMessage(json: unknown, status: number): string {
  const raw = (json as { error?: unknown; message?: unknown } | null)?.error
           ?? (json as { message?: unknown } | null)?.message;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const { formErrors, fieldErrors } = raw as ZodFlattened;
    const parts = [
      ...(formErrors ?? []),
      ...Object.entries(fieldErrors ?? {}).map(([field, msgs]) => `${field}: ${msgs.join(", ")}`),
    ];
    if (parts.length) return parts.join("; ");
    return JSON.stringify(raw).slice(0, 300);
  }
  return `EptimEdu API error (${status})`;
}

async function req(path: string, options?: RequestInit) {
  if (!API_KEY)  throw new Error("EPTIMEDU_API_KEY not configured");
  if (!BASE_URL) throw new Error("EPTIMEDU_BASE_URL not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(errorMessage(json, res.status)), { status: res.status, body: json });
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export const eptimEdu = {
  courses: () => req("/api/v1/courses"),

  userExists: async (username: string) => {
    try {
      return await req(`/api/v1/users/${encodeURIComponent(username)}`);
    } catch (e: unknown) {
      if ((e as { status?: number })?.status === 404) return null;
      throw e;
    }
  },

  findUserByEmail: async (email: string) => {
    try {
      return await req(`/api/v1/users?email=${encodeURIComponent(email)}`);
    } catch (e: unknown) {
      if ((e as { status?: number })?.status === 404) return null;
      throw e;
    }
  },

  createUser: (data: { username: string; password: string; name?: string; email?: string }) =>
    req("/api/v1/users", { method: "POST", body: JSON.stringify(data) }),

  updateUser: (username: string, data: { email?: string; name?: string }) =>
    req(`/api/v1/users/${encodeURIComponent(username)}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteUser: (username: string) =>
    req(`/api/v1/users/${encodeURIComponent(username)}`, { method: "DELETE" }),

  enrol: (username: string, courseId: string, opts?: { force?: boolean; password?: string; name?: string; email?: string }) =>
    req("/api/v1/enrolments", {
      method: "POST",
      body: JSON.stringify({ username, courseId, ...(opts ?? {}) }),
    }),

  getUserEnrolments: async (username: string) => {
    try {
      return await req(`/api/v1/users/${encodeURIComponent(username)}/enrolments`);
    } catch (e: unknown) {
      if ((e as { status?: number })?.status === 404) return [];
      throw e;
    }
  },

  getUserSubmissions: (username: string, courseId: string) =>
    req(`/api/v1/users/${encodeURIComponent(username)}/courses/${encodeURIComponent(courseId)}/submissions`),

  getUserCourseProgress: (username: string, courseId: string) =>
    req(`/api/v1/users/${encodeURIComponent(username)}/courses/${encodeURIComponent(courseId)}/progress`),

  getLessonProgress: (username: string, courseId: string) =>
    req(`/api/v1/users/${encodeURIComponent(username)}/courses/${encodeURIComponent(courseId)}/lesson-progress`),

  createSsoToken: (username: string) =>
    req("/api/v1/auth/sso-token", { method: "POST", body: JSON.stringify({ username }) }),

  health: () => req("/api/health"),
};
