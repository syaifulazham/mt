// Small request helpers for the PAJSK routes.
import type { NextRequest } from "next/server";

/** Public origin for printed links: NEXT_PUBLIC_APP_URL, else the forwarded host (nginx). */
export function publicOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// In-process fixed-window limiter (the site runs as a single container).
const hits = new Map<string, { n: number; reset: number }>();

/** true = allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const cur = hits.get(key);
  if (!cur || cur.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
  cur.n += 1;
  return cur.n <= limit;
}
