import { createArenaClient } from "@/lib/arena-client";

const BASE_URL = (process.env.EPTIMDRONE_BASE_URL ?? "").replace(/\/$/, "");
const API_KEY  = process.env.EPTIMDRONE_API_KEY  ?? "";

/**
 * Challenge registrations, attempt summaries and one-click launch for Eptim
 * Drone — the same contract as Eptim FC-1 (EPTIM-DRONE-API-GUIDE.md §18–25),
 * so the shared arena client serves both. `eptimdrone` below remains the
 * account/sign-in client used by the Pasukan page's Drone panel.
 */
export const droneArena = createArenaClient({
  label:   "Eptim Drone",
  baseUrl: process.env.EPTIMDRONE_BASE_URL ?? "",
  apiKey:  process.env.EPTIMDRONE_API_KEY ?? "",
  appUrl:  process.env.EPTIMDRONE_APP_URL ?? "",
  env:     { baseUrl: "EPTIMDRONE_BASE_URL", apiKey: "EPTIMDRONE_API_KEY", appUrl: "EPTIMDRONE_APP_URL" },
});

function headers(withBody = false) {
  return {
    "X-API-Key": API_KEY,
    "Accept": "application/json",
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE_URL || !API_KEY) {
    throw Object.assign(new Error("EPTIMDRONE_BASE_URL or EPTIMDRONE_API_KEY not configured"), { status: 503 });
  }

  const url = `${BASE_URL}${path}`;
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    method,
    headers: headers(hasBody),
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });

  // Read body as text first so we can include it in error messages
  const text = await res.text().catch(() => "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ");
    console.error(`[eptimdrone] non-JSON from ${method} ${url} (${res.status}): ${preview}`);
    if (!res.ok) {
      throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    }
    throw Object.assign(new Error(`Drone API returned non-JSON (${res.status}): ${preview}`), { status: 422 });
  }

  if (!res.ok) {
    const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }

  return json as T;
}

export const eptimdrone = {
  checkSector: (customId: string) =>
    req<{ custom_id: string; available: boolean }>("GET", `/sectors/check/${encodeURIComponent(customId)}`),

  checkUser: (userid: string) =>
    req<{ userid: string; available: boolean }>("GET", `/users/check/${encodeURIComponent(userid)}`),

  createSector: (payload: { sector_name: string; region?: string; custom_id: string; other_details?: Record<string, unknown> }) =>
    req<{ id: string; sector_name: string; custom_id: string }>("POST", "/sectors", payload),

  createUser: (payload: { userid: string; password: string; full_name: string }) =>
    req<{ id: string; email: string; userid: string | null }>("POST", "/users", payload),

  assignMember: (sectorCustomId: string, userid: string) =>
    req<{ sector_id: string; user_id: string }>("POST", `/sectors/${encodeURIComponent(sectorCustomId)}/members`, { userid }),

  /** Challenges of the event EPTIMDRONE_API_KEY belongs to, in `order_index` order. */
  listChallenges: () =>
    req<{
      event_id: string;
      challenges: {
        id: string; name: string; description: string | null; challenge_mode: string;
        status: string; order_index: number; max_attempts?: number | null; created_at: string;
      }[];
    }>("GET", "/challenges"),

  getToken: (userid: string, password: string) =>
    req<{ access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string; full_name: string } }>(
      "POST", "/auth/token", { userid, password }
    ),
};
