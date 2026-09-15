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

export function webcraftLogin(userId: string, password: string) {
  return req<WebcraftLoginResponse>("/api/v1/login", {
    method: "POST",
    body: JSON.stringify({ userId, password }),
  });
}
