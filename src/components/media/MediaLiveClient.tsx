"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronLeft, Download, Loader2, Radio, RefreshCw, SwitchCamera, Square, Video,
} from "lucide-react";
import { publishWhip, recorderMime, type WebRtcSession } from "@/lib/webrtc-stream";

/* Live video of a duel session from the media team's phone.
   The camera is broadcast to Cloudflare Stream over WebRTC (boards show it
   within a second) and recorded on the phone at the same time; on "Henti" the
   recording uploads straight to Cloudflare as the session's replay.
   API: /api/v2/media/<slug>/duel… */

type Session = {
  id: string; label: string; round: string; group: string | null; arena: number;
  scheduledAt: string | null; status: string; live: boolean; replayStatus: string | null;
  teams: { name: string; contingent: string }[];
};
type Comp = { id: string; code: string; name: string; sessions: Session[] };
type Call = (p: string, i?: RequestInit) => Promise<Response>;

const RED = "#dc2626";
const HEARTBEAT_MS = 10_000;
/** Recording cap: a basic Cloudflare upload takes up to 200 MB (~14 min at 1.8 Mbps). */
const RECORD_MAX_MS = 14 * 60_000;
const RECORD_BPS = 1_800_000;

const STATUS: Record<string, string> = {
  PENDING: "Menunggu", RUNNING: "Berjalan", PAUSED: "Dijeda", ENDED: "Tamat", DONE: "Selesai",
};
const hhmm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }) : "";
const mmss = (ms: number) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

export function MediaLiveClient({ call, onBack }: { call: Call; onBack: () => void }) {
  const [comps, setComps] = useState<Comp[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [picked, setPicked] = useState<Session | null>(null);

  const load = useCallback(async () => {
    const r = await call("/duel", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setConfigured(j.configured);
    setComps(j.competitions);
  }, [call]);

  useEffect(() => {
    if (picked) return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const tick = async () => { await load(); if (!stop) t = setTimeout(tick, 5000); };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [load, picked]);

  if (picked) return <Camera call={call} session={picked} onBack={() => { setPicked(null); }} />;

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-zinc-50/90 backdrop-blur flex items-center gap-3 border-b">
        <button onClick={onBack} className="p-1 -ml-1 text-zinc-500" aria-label="Kembali"><ChevronLeft className="h-6 w-6" /></button>
        <Radio className="h-5 w-5 shrink-0" style={{ color: RED }} />
        <p className="flex-1 text-sm font-bold">Siaran langsung duel</p>
      </header>

      {!configured && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Siaran langsung belum dikonfigurasi oleh pentadbir (Cloudflare Stream).</p>
      )}
      {comps === null ? (
        <p className="py-10 text-center text-sm text-zinc-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</p>
      ) : comps.every(c => c.sessions.length === 0) ? (
        <p className="py-10 text-center text-sm text-zinc-400">Tiada sesi duel yang telah dijadualkan.</p>
      ) : (
        <div className="space-y-5 pt-4">
          <p className="text-xs text-zinc-500">Pilih sesi yang anda rakam. Video disiarkan terus ke skrin duel dan dirakam untuk tontonan semula.</p>
          {comps.filter(c => c.sessions.length).map(c => (
            <section key={c.id} className="space-y-2">
              <p className="text-sm font-bold text-zinc-800"><span className="font-mono text-zinc-400">{c.code}</span> {c.name}</p>
              {c.sessions.map(s => (
                <button key={s.id} onClick={() => setPicked(s)} disabled={!configured}
                  className="w-full rounded-2xl border bg-white p-3 text-left active:scale-[.99] disabled:opacity-50">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-bold text-white">{s.label}</span>
                    {s.group && <span className="text-xs font-semibold text-zinc-600">{s.group}</span>}
                    <span className="text-xs text-zinc-400">· Arena {s.arena}{s.scheduledAt ? ` · ${hhmm(s.scheduledAt)}` : ""}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      {s.live && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">● LIVE</span>}
                      {s.replayStatus === "READY" && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Rakaman tersedia" />}
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">{STATUS[s.status] ?? s.status}</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500 line-clamp-2">{s.teams.map(t => t.name).join(" · ")}</p>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

type Phase = "preview" | "starting" | "live" | "uploading" | "uploaded" | "failed";

function Camera({ call, session, onBack }: { call: Call; session: Session; onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rtcRef = useRef<WebRtcSession | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [phase, setPhase] = useState<Phase>("preview");
  const [err, setErr] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [progress, setProgress] = useState(0);
  const [sessionStatus, setSessionStatus] = useState(session.status);
  const [connection, setConnection] = useState("");
  const base = `/duel/${session.id}`;
  const post = useCallback((path: string, body: object) => call(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), [call, base]);

  // Camera preview (re-opened when the camera is switched before going live).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: { echoCancellation: false, noiseSuppression: true },
        });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setErr("");
      } catch {
        setErr("Kamera tidak dapat dibuka. Benarkan akses kamera dan mikrofon untuk laman ini.");
      }
    })();
    return () => { cancelled = true; };
  }, [facing]);

  // Release everything on leave.
  useEffect(() => () => {
    rtcRef.current?.stop();
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    wakeRef.current?.release().catch(() => null);
  }, []);

  // While live: clock, heartbeat (keeps the boards showing the video), leave warning.
  useEffect(() => {
    if (phase !== "live") return;
    const clock = setInterval(() => setNow(Date.now()), 500);
    const beat = setInterval(async () => {
      const r = await post("/stream", { action: "heartbeat" }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      if (j?.status) setSessionStatus(j.status);
    }, HEARTBEAT_MS);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { clearInterval(clock); clearInterval(beat); window.removeEventListener("beforeunload", warn); };
  }, [phase, post]);

  async function start() {
    const stream = streamRef.current;
    if (!stream) return;
    setPhase("starting"); setErr("");
    try {
      const r = await post("/stream", { action: "start" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Gagal memulakan siaran.");
      const rtc = await publishWhip(j.publishUrl, stream);
      rtc.pc.onconnectionstatechange = () => setConnection(rtc.pc.connectionState);
      rtcRef.current = rtc;

      // Record the same camera on the phone for the replay.
      const mime = recorderMime();
      if (mime !== null) {
        chunks.current = []; blobRef.current = null;
        const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: RECORD_BPS });
        rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
        rec.start(1000);
        recRef.current = rec;
        setTimeout(() => { if (rec.state === "recording") rec.stop(); }, RECORD_MAX_MS);
      }
      try { wakeRef.current = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* not supported */ }
      setStartedAt(Date.now()); setNow(Date.now());
      setPhase("live");
    } catch (e) {
      await post("/stream", { action: "stop" }).catch(() => null);
      setErr(e instanceof Error ? e.message : "Gagal memulakan siaran.");
      setPhase("preview");
    }
  }

  function finishRecording(): Promise<Blob | null> {
    const rec = recRef.current;
    recRef.current = null;
    const make = () => chunks.current.length ? new Blob(chunks.current, { type: rec?.mimeType || chunks.current[0].type || "video/webm" }) : null;
    if (!rec || rec.state === "inactive") return Promise.resolve(make());
    return new Promise(resolve => { rec.onstop = () => resolve(make()); rec.stop(); });
  }

  async function stop() {
    await rtcRef.current?.stop();
    rtcRef.current = null;
    wakeRef.current?.release().catch(() => null);
    await post("/stream", { action: "stop" }).catch(() => null);
    const blob = await finishRecording();
    blobRef.current = blob;
    if (blob) await upload(blob);
    else setPhase("preview");
  }

  async function upload(blob: Blob) {
    setPhase("uploading"); setProgress(0); setErr("");
    try {
      const r = await post("/replay", { action: "create" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Gagal menyediakan muat naik.");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", j.uploadUrl);
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(e.loaded / e.total); };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Muat naik gagal (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Sambungan terputus semasa muat naik."));
        const fd = new FormData();
        fd.append("file", blob, `sesi.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
        xhr.send(fd);
      });
      await post("/replay", { action: "done", uid: j.uid });
      setPhase("uploaded");
    } catch (e) {
      await post("/replay", { action: "failed" }).catch(() => null);
      setErr(e instanceof Error ? e.message : "Muat naik gagal.");
      setPhase("failed");
    }
  }

  function saveToPhone() {
    const blob = blobRef.current;
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${session.label}${session.group ? `-${session.group}` : ""}.${blob.type.includes("mp4") ? "mp4" : "webm"}`.replace(/\s+/g, "_");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  const live = phase === "live";
  const elapsed = live ? now - startedAt : 0;
  const recording = live && recRef.current?.state === "recording";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onBack} disabled={live || phase === "starting" || phase === "uploading"} className="p-1 text-white/80 disabled:opacity-30" aria-label="Kembali">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{session.label}{session.group ? ` · ${session.group}` : ""} · Arena {session.arena}</p>
          <p className="truncate text-[11px] text-white/60">{session.round} · {session.teams.map(t => t.name).join(" · ")}</p>
        </div>
        {live && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold tabular-nums">● LIVE {mmss(elapsed)}</span>}
      </div>

      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
        {live && connection && connection !== "connected" && (
          <p className="absolute left-3 top-3 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-black">Sambungan: {connection}</p>
        )}
        {live && (sessionStatus === "ENDED" || sessionStatus === "DONE") && (
          <p className="absolute inset-x-3 top-3 rounded-xl bg-white/90 px-3 py-2 text-center text-sm font-semibold text-zinc-900">Sesi telah tamat — tekan Henti untuk menamatkan siaran.</p>
        )}
        {(phase === "uploading" || phase === "uploaded" || phase === "failed") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            {phase === "uploading" && <>
              <Loader2 className="h-10 w-10 animate-spin text-white/70" />
              <p className="text-lg font-semibold">Memuat naik rakaman… {Math.round(progress * 100)}%</p>
              <div className="h-2 w-64 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-white" style={{ width: `${progress * 100}%` }} /></div>
              <p className="text-xs text-white/60">Jangan tutup halaman ini.</p>
            </>}
            {phase === "uploaded" && <>
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <p className="text-lg font-semibold">Rakaman dimuat naik</p>
              <p className="text-sm text-white/60">Tontonan semula tersedia selepas Cloudflare selesai memprosesnya.</p>
              <button onClick={onBack} className="h-12 rounded-xl bg-white px-6 font-semibold text-black">Pilih sesi lain</button>
            </>}
            {phase === "failed" && <>
              <AlertCircle className="h-12 w-12 text-red-400" />
              <p className="text-lg font-semibold">Muat naik gagal</p>
              <p className="text-sm text-white/60">{err}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => blobRef.current && upload(blobRef.current)} className="flex h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-black"><RefreshCw className="h-4 w-4" /> Cuba semula</button>
                <button onClick={saveToPhone} className="flex h-12 items-center gap-2 rounded-xl border border-white/40 px-5 font-semibold"><Download className="h-4 w-4" /> Simpan ke telefon</button>
              </div>
            </>}
          </div>
        )}
      </div>

      <div className="space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {err && phase !== "failed" && <p className="text-center text-sm text-red-300">{err}</p>}
        {live && (
          <p className="text-center text-[11px] text-white/50">
            {recording ? "Dirakam untuk tontonan semula" : "Siaran sahaja (rakaman tidak disokong / had 14 minit dicapai)"}
          </p>
        )}
        <div className="flex items-center gap-3">
          {(phase === "preview" || phase === "starting") && (
            <button onClick={() => setFacing(f => (f === "environment" ? "user" : "environment"))} disabled={phase === "starting"}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15" aria-label="Tukar kamera">
              <SwitchCamera className="h-6 w-6" />
            </button>
          )}
          {(phase === "preview" || phase === "starting") && (
            <button onClick={start} disabled={phase === "starting" || !!err && !streamRef.current}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-bold disabled:opacity-50" style={{ background: RED }}>
              {phase === "starting" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />} Mula siaran
            </button>
          )}
          {live && (
            <button onClick={stop} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-black">
              <Square className="h-5 w-5 fill-current" /> Henti siaran
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
