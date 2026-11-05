import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia, ownDuelSession } from "@/lib/media-endpoint";
import { createLiveInput, deleteLiveInput, streamConfigured, StreamError } from "@/lib/cf-stream";

type Params = { params: Promise<{ slug: string; sid: string }> };

// POST { action: "start" | "heartbeat" | "stop" } — the media team's camera.
// start: a Cloudflare live input for the session (made on first use) and its
// WHIP publish URL; heartbeat: keeps the session marked live; stop: ends it
// and removes the input.
export async function POST(req: NextRequest, { params }: Params) {
  const { slug, sid } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  const s = await ownDuelSession(a.ep.eventId, sid);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { action } = await req.json().catch(() => ({}));

  if (action === "start") {
    if (!streamConfigured()) return NextResponse.json({ error: "STREAM_NOT_CONFIGURED", message: "Siaran langsung belum dikonfigurasi (Cloudflare Stream)." }, { status: 503 });
    let { streamInputId, streamPublishUrl, streamPlaybackUrl } = s;
    if (!streamInputId || !streamPublishUrl) {
      try {
        const name = `${s.round.eventCompetition.competition.code} ${s.round.isFinal ? "Akhir" : `P${s.round.number} ${s.label}`}`;
        const input = await createLiveInput(name);
        ({ uid: streamInputId, publishUrl: streamPublishUrl, playbackUrl: streamPlaybackUrl } = input);
      } catch (e) {
        return NextResponse.json({ error: "STREAM_ERROR", message: e instanceof StreamError ? e.message : "Gagal mencipta siaran." }, { status: 502 });
      }
    }
    await db.duelSession.update({
      where: { id: s.id },
      data: { streamInputId, streamPublishUrl, streamPlaybackUrl, streamHeartbeatAt: new Date() },
    });
    return NextResponse.json({ publishUrl: streamPublishUrl, playbackUrl: streamPlaybackUrl });
  }

  if (action === "heartbeat") {
    if (!s.streamInputId) return NextResponse.json({ error: "NOT_STREAMING" }, { status: 409 });
    await db.duelSession.update({ where: { id: s.id }, data: { streamHeartbeatAt: new Date() } });
    return NextResponse.json({ ok: true, status: s.status });
  }

  if (action === "stop") {
    if (s.streamInputId) await deleteLiveInput(s.streamInputId);
    await db.duelSession.update({
      where: { id: s.id },
      data: { streamInputId: null, streamPublishUrl: null, streamPlaybackUrl: null, streamHeartbeatAt: null },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
