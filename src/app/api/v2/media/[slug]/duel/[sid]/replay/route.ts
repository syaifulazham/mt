import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia, ownDuelSession } from "@/lib/media-endpoint";
import { createDirectUpload, deleteVideo, streamConfigured, StreamError, videoWatchUrl } from "@/lib/cf-stream";

type Params = { params: Promise<{ slug: string; sid: string }> };

// POST { action: "create" | "done" | "failed" } — the replay recorded on the
// phone. create: a one-time Cloudflare upload URL (the phone uploads the file
// straight to it); done: the upload finished; failed: it did not.
// A new recording replaces the session's previous replay.
export async function POST(req: NextRequest, { params }: Params) {
  const { slug, sid } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  const s = await ownDuelSession(a.ep.eventId, sid);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { action, uid } = await req.json().catch(() => ({}));

  if (action === "create") {
    if (!streamConfigured()) return NextResponse.json({ error: "STREAM_NOT_CONFIGURED", message: "Cloudflare Stream belum dikonfigurasi." }, { status: 503 });
    try {
      const name = `${s.round.eventCompetition.competition.code} ${s.round.isFinal ? "Akhir" : `P${s.round.number} ${s.label}`} (ulangan)`;
      const up = await createDirectUpload(name);
      return NextResponse.json(up);
    } catch (e) {
      return NextResponse.json({ error: "STREAM_ERROR", message: e instanceof StreamError ? e.message : "Gagal menyediakan muat naik." }, { status: 502 });
    }
  }

  if (action === "done") {
    if (typeof uid !== "string" || !/^[a-f0-9]{32}$/.test(uid)) return NextResponse.json({ error: "BAD_UID" }, { status: 400 });
    const watch = await videoWatchUrl(uid).catch(() => null);
    const old = s.replayVideoId && s.replayVideoId !== uid ? s.replayVideoId : null;
    await db.duelSession.update({ where: { id: s.id }, data: { replayVideoId: uid, replayStatus: "READY", replayUrl: watch } });
    if (old) await deleteVideo(old);
    return NextResponse.json({ ok: true, replayUrl: watch });
  }

  if (action === "failed") {
    if (s.replayStatus !== "READY") await db.duelSession.update({ where: { id: s.id }, data: { replayStatus: "FAILED" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
