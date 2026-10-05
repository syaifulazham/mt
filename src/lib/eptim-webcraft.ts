const BASE_URL = process.env.EPTIM_WEBCRAFT_BASE_URL ?? "";
const API_KEY  = process.env.EPTIM_WEBCRAFT_API_KEY ?? "";
const TIMEOUT_MS = 10_000;

export function webcraftConfigured() {
  return !!BASE_URL && !!API_KEY;
}

/** Build a valid WebCraft userId from an opaque id (lowercase alnum + hyphens, 3–30 chars, starts with letter/digit). */
export function toWebcraftUserId(id: string): string {
  const cleaned = id.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return cleaned.slice(0, 30);
}

export type WebcraftCreateUserResponse = { userId: string; name: string; accountId: string };
export type WebcraftLoginResponse = {
  userId: string; name: string; accountId: string;
  accessToken: string; refreshToken: string; expiresIn: number;
};
export type WebcraftProject = {
  id: string; name: string; status: string;
  published_url: string | null; published_at: string | null;
};

async function req<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  if (!BASE_URL) throw new Error("EPTIM_WEBCRAFT_BASE_URL not configured");
  if (!API_KEY)  throw new Error("EPTIM_WEBCRAFT_API_KEY not configured");

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
    let json: { error?: string; message?: string } | null = null;
    try {
      json = text ? (JSON.parse(text) as { error?: string; message?: string } | null) ?? null : null;
    } catch {
      // A misconfigured EPTIM_WEBCRAFT_BASE_URL (e.g. one that already ends in
      // /api/v1) hits a Next.js 404 page, and the HTML body used to surface as
      // "Unexpected token '<'" with no status attached.
      throw Object.assign(
        new Error(`WebCraft returned a non-JSON response (${res.status}) — check EPTIM_WEBCRAFT_BASE_URL`),
        { status: res.status, detail: text.slice(0, 500) },
      );
    }
    if (!res.ok)
      throw Object.assign(
        new Error(json?.error ?? json?.message ?? `WebCraft API error (${res.status})`),
        { status: res.status, detail: text.slice(0, 500) },
      );
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export function webcraftCreateUser(opts: {
  userId: string; name: string; password: string; otherDetails?: Record<string, unknown>;
}) {
  return req<WebcraftCreateUserResponse>("/api/v1/users", {
    method: "POST",
    body: JSON.stringify({
      userId:   opts.userId,
      name:     opts.name,
      password: opts.password,
      ...(opts.otherDetails ? { other_details: opts.otherDetails } : {}),
    }),
  });
}

export async function webcraftUserExists(userId: string): Promise<boolean | null> {
  // Listing projects returns 404 when the account doesn't exist
  try {
    await req(`/api/v1/projects?userId=${encodeURIComponent(userId)}`);
    return true;
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 404) return false;
    return null; // unknown (network/error)
  }
}

export type WebcraftPublishedProject = {
  id: string; name: string; description: string | null;
  published_url: string; published_at: string | null; updated_at: string | null;
};
export type WebcraftPublishedUser = { userId: string; exists: boolean; projects: WebcraftPublishedProject[] };

const PUBLISHED_BATCH = 500;   // WebCraft's per-request cap
const FALLBACK_CONCURRENCY = 8;

/**
 * Publicly viewable projects for many WebCraft accounts, keyed by userId.
 *
 * One `POST /api/v1/projects/published` per 500 accounts, in parallel — a
 * judging page for a whole competition is a single request. "Viewable" is
 * WebCraft's own rule (published *and* approved by moderation), so every URL
 * opens.
 *
 * Falls back to one `GET /api/v1/projects` per account when the batch endpoint
 * answers 404/405, so mt keeps working whichever app deploys first. That
 * older endpoint cannot see moderation, so until WebCraft is updated a project
 * held by moderation may be listed.
 */
export async function webcraftPublishedProjects(userIds: string[]): Promise<Map<string, WebcraftPublishedUser>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, WebcraftPublishedUser>();
  if (ids.length === 0) return out;

  try {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += PUBLISHED_BATCH) batches.push(ids.slice(i, i + PUBLISHED_BATCH));
    const results = await Promise.all(batches.map((part) =>
      req<{ users: WebcraftPublishedUser[] }>("/api/v1/projects/published", {
        method: "POST",
        body: JSON.stringify({ userIds: part }),
      }),
    ));
    for (const r of results) for (const u of r.users ?? []) out.set(u.userId, u);
    return out;
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status !== 404 && status !== 405) throw e;
  }

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(FALLBACK_CONCURRENCY, ids.length) }, async () => {
    while (next < ids.length) {
      const userId = ids[next++];
      try {
        const r = await req<{ projects: WebcraftProject[] }>(`/api/v1/projects?userId=${encodeURIComponent(userId)}`);
        out.set(userId, {
          userId, exists: true,
          projects: (r.projects ?? [])
            .filter((p) => p.status === "published" && p.published_url)
            .map((p) => ({
              id: p.id, name: p.name, description: null,
              published_url: p.published_url!, published_at: p.published_at, updated_at: null,
            })),
        });
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 404) out.set(userId, { userId, exists: false, projects: [] });
        // anything else: leave absent — the caller shows it as unknown, not as "no projects"
      }
    }
  }));
  return out;
}

export function webcraftLogin(userId: string, password: string) {
  return req<WebcraftLoginResponse>("/api/v1/login", {
    method: "POST",
    body: JSON.stringify({ userId, password }),
  });
}
