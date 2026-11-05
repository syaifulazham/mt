/**
 * Cloudflare Stream: live inputs for duel sessions (the media team's phone
 * broadcasts over WebRTC/WHIP, boards watch over WHEP) and direct uploads for
 * the replay the phone records alongside. WebRTC inputs cannot be recorded by
 * Stream, hence the phone-side recording.
 *
 * Account: R2_ACCOUNT_ID (the same Cloudflare account). Token:
 * CLOUDFLARE_STREAM_API_TOKEN with the "Stream: Edit" permission.
 */

const API = "https://api.cloudflare.com/client/v4/accounts";

export function streamConfigured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_API_TOKEN);
}

export class StreamError extends Error {}

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/${process.env.R2_ACCOUNT_ID}/stream${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({})) as { success?: boolean; result?: T; errors?: { message: string }[] };
  if (!res.ok || j.success === false)
    throw new StreamError(j.errors?.map(e => e.message).join("; ") || `Cloudflare Stream ${res.status}`);
  return j.result as T;
}

/** A WebRTC live input: `publishUrl` (WHIP, secret) and `playbackUrl` (WHEP, public). */
export async function createLiveInput(name: string) {
  const r = await cf<{ uid: string; webRTC?: { url: string }; webRTCPlayback?: { url: string } }>("/live_inputs", {
    method: "POST",
    body: JSON.stringify({ meta: { name }, recording: { mode: "off" } }),
  });
  if (!r.webRTC?.url || !r.webRTCPlayback?.url) throw new StreamError("Live input has no WebRTC URLs.");
  return { uid: r.uid, publishUrl: r.webRTC.url, playbackUrl: r.webRTCPlayback.url };
}

/** Best effort — a leftover input costs nothing while idle. */
export async function deleteLiveInput(uid: string) {
  try { await cf(`/live_inputs/${uid}`, { method: "DELETE" }); }
  catch (e) { console.error("[stream] delete live input failed:", e); }
}

/** A one-time upload URL (basic POST, under 200 MB) for a replay. */
export async function createDirectUpload(name: string, maxDurationSeconds = 3600) {
  const r = await cf<{ uploadURL: string; uid: string }>("/direct_upload", {
    method: "POST",
    body: JSON.stringify({ maxDurationSeconds, meta: { name } }),
  });
  return { uploadUrl: r.uploadURL, uid: r.uid };
}

/** The video's watch page (Stream player), once it exists. */
export async function videoWatchUrl(uid: string): Promise<string | null> {
  const r = await cf<{ preview?: string }>(`/${uid}`);
  return r.preview ?? null;
}

export async function deleteVideo(uid: string) {
  try { await cf(`/${uid}`, { method: "DELETE" }); }
  catch (e) { console.error("[stream] delete video failed:", e); }
}

/** A camera counts as live while it pinged within this window. */
export const STREAM_LIVE_MS = 25_000;
export const isStreamLive = (s: { streamPlaybackUrl: string | null; streamHeartbeatAt: Date | null }, now = Date.now()) =>
  !!s.streamPlaybackUrl && !!s.streamHeartbeatAt && now - s.streamHeartbeatAt.getTime() < STREAM_LIVE_MS;
