const BASE_URL = process.env.EPTIMEDU_BASE_URL ?? "";
const API_KEY  = process.env.EPTIMEDU_API_KEY  ?? "";

export function eptimEduConfigured() {
  return !!API_KEY && !!BASE_URL;
}

async function req(path: string, options?: RequestInit) {
  if (!API_KEY)  throw new Error("EPTIMEDU_API_KEY not configured");
  if (!BASE_URL) throw new Error("EPTIMEDU_BASE_URL not configured");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(json?.error ?? "EptimEdu API error"), { status: res.status, body: json });
  return json;
}

export const eptimEdu = {
  courses: () => req("/api/v1/courses"),

  userExists: (username: string) => req(`/api/v1/users/${encodeURIComponent(username)}`),

  createUser: (data: { username: string; password: string; name?: string; email?: string }) =>
    req("/api/v1/users", { method: "POST", body: JSON.stringify(data) }),

  enrol: (username: string, courseId: string) =>
    req("/api/v1/enrolments", { method: "POST", body: JSON.stringify({ username, courseId }) }),
};
