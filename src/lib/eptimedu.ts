const BASE_URL      = process.env.EPTIMEDU_BASE_URL ?? "";
const API_KEY       = process.env.EPTIMEDU_API_KEY  ?? "";
const TIMEOUT_MS    = parseInt(process.env.EPTIMEDU_TIMEOUT_MS ?? "8000", 10);

export function eptimEduConfigured() {
  return !!API_KEY && !!BASE_URL;
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
    if (!res.ok) throw Object.assign(new Error(json?.error ?? "EptimEdu API error"), { status: res.status, body: json });
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export const eptimEdu = {
  courses: () => req("/api/v1/courses"),

  userExists: (username: string) => req(`/api/v1/users/${encodeURIComponent(username)}`),

  createUser: (data: { username: string; password: string; name?: string; email?: string }) =>
    req("/api/v1/users", { method: "POST", body: JSON.stringify(data) }),

  enrol: (username: string, courseId: string, opts?: { force?: boolean; password?: string; name?: string }) =>
    req("/api/v1/enrolments", {
      method: "POST",
      body: JSON.stringify({ username, courseId, ...(opts ?? {}) }),
    }),

  getUserEnrolments: (username: string) =>
    req(`/api/v1/users/${encodeURIComponent(username)}/enrolments`),

  getUserSubmissions: (username: string, courseId: string) =>
    req(`/api/v1/users/${encodeURIComponent(username)}/courses/${encodeURIComponent(courseId)}/submissions`),

  createSsoToken: (username: string) =>
    req("/api/v1/auth/sso-token", { method: "POST", body: JSON.stringify({ username }) }),

  health: () => req("/api/health"),
};
