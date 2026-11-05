"use client";

import { useEffect, useRef, useState } from "react";
import { playWhep, type WebRtcSession } from "@/lib/webrtc-stream";
import { cn } from "@/lib/utils";

/**
 * Live video of a duel session (Cloudflare Stream WHEP). Reconnects when the
 * stream drops or is not up yet; muted so browsers allow autoplay.
 */
export function WhepVideo({ url, className, muted = true }: { url: string; className?: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"connecting" | "playing">("connecting");

  useEffect(() => {
    let alive = true, session: WebRtcSession | null = null, retry: ReturnType<typeof setTimeout>;
    const connect = async () => {
      if (!alive) return;
      setState("connecting");
      try {
        session = await playWhep(url, stream => {
          if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
        });
        session.pc.onconnectionstatechange = () => {
          const st = session?.pc.connectionState;
          if (st === "connected") setState("playing");
          if (st === "failed" || st === "disconnected" || st === "closed") {
            session?.stop(); session = null;
            if (alive) retry = setTimeout(connect, 3000);
          }
        };
      } catch {
        if (alive) retry = setTimeout(connect, 4000);
      }
    };
    connect();
    return () => { alive = false; clearTimeout(retry); session?.stop(); };
  }, [url]);

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-contain" />
      {state === "connecting" && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-widest text-white/60">Menyambung video…</span>
      )}
      {state === "playing" && (
        <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">● LIVE</span>
      )}
    </div>
  );
}
