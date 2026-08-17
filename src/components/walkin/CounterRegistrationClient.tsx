"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search, Loader2, CheckCircle2, QrCode, X, ScanLine,
  ChevronRight, Camera, CameraOff, RefreshCcw, AlertCircle,
  UserCheck, MapPin,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

/* ─── Brand palette ─────────────────────────────────────────────────────── */
const B = {
  navy:   "#085782",
  navyDk: "#053d5e",
  purple: "#8573b0",
  pink:   "#d66ca5",
  red:    "#e75262",
  gold:   "#f2dc0c",
  slate:  "#4d5c7c",
};

/* ─── Types ─────────────────────────────────────────────────────────────── */
type WicSummary = {
  id: string; maxSlots: number;
  competition: { id: string; code: string; name: string; participationType: string };
  _count: { registrations: number };
};
type WicInfo =
  | { isGeneral: true;  endpointId: string; label: string | null;
      event: { id: string; name: string; slug: string; venue: string | null; startDate: string | null };
      walkInCompetitions: WicSummary[]; }
  | { isGeneral: false; endpointId: string; label: string | null;
      id: string; maxSlots: number;
      event: { id: string; name: string; slug: string; venue: string | null; startDate: string | null };
      competition: { id: string; code: string; name: string; participationType: string };
      _count: { registrations: number }; };

type ParticipantResult = {
  id: string; name: string; ic: string | null; gender: string;
  age: number | null; eduLevel: string; classGrade: string | null;
  contingentId: string; contingentName: string;
  alreadyRegistered: boolean; registrationStatus: string | null;
  registrationId: string | null;
};
type DroneTokenData = { userid: string; password: string; accessToken: string; competitionToken?: string | null };
type RegisteredResult = { id: string; status: string; viblockToken?: string | null; vibeBlocksToken?: string | null; droneToken?: DroneTokenData | null };
type ScanResult = {
  id: string; alreadyConfirmed: boolean;
  participantName: string; ic: string | null; gender: string;
  eduLevel: string; classGrade: string | null;
  contingentName: string; contingentLogo: string | null;
  competitionCode: string; competitionName: string; eventName: string;
  viblockToken?: string | null;
  vibeBlocksToken?: string | null;
  droneToken?: DroneTokenData | null;
};

const EDU_LABEL: Record<string, string> = {
  PRIMARY: "Sekolah Rendah", SECONDARY: "Sekolah Menengah", YOUTH: "Belia / Umum",
};

/* ─── Global styles ─────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @keyframes wk-float  { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-18px) rotate(6deg)} }
  @keyframes wk-pulse  { 0%,100%{opacity:.15} 50%{opacity:.35} }
  @keyframes wk-spin   { to{transform:rotate(360deg)} }
  @keyframes wk-orbit  { to{transform:rotate(360deg)} }
  @keyframes wk-spark  { 0%{transform:translateY(0) scale(1);opacity:.9} 100%{transform:translateY(-50px) scale(0);opacity:0} }
  @keyframes wk-card-in{ 0%{opacity:0;transform:translateY(24px) scale(.96)} 100%{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes wk-pop    { 0%{transform:scale(0) rotate(-20deg);opacity:0} 65%{transform:scale(1.2) rotate(4deg);opacity:1} 100%{transform:scale(1) rotate(0);opacity:1} }
  @keyframes wk-slide-r{ 0%{opacity:0;transform:translateX(-14px)} 100%{opacity:1;transform:translateX(0)} }
  @keyframes wk-scan   { 0%,100%{top:8%} 50%{top:83%} }
  @keyframes wk-glow   { 0%,100%{box-shadow:0 0 20px rgba(8,87,130,.4),0 0 40px rgba(8,87,130,.2)} 50%{box-shadow:0 0 30px rgba(8,87,130,.7),0 0 60px rgba(8,87,130,.35)} }
  .wk-float   { animation: wk-float  6s ease-in-out infinite }
  .wk-pulse   { animation: wk-pulse  3s ease-in-out infinite }
  .wk-card-in { animation: wk-card-in .45s cubic-bezier(.34,1.56,.64,1) both }
  .wk-pop     { animation: wk-pop    .5s cubic-bezier(.34,1.56,.64,1) .2s both }
  .wk-name-in { animation: wk-slide-r .4s ease .3s both }
  .wk-logo-in { animation: wk-card-in .4s ease .1s both }
  .wk-scan-ln { animation: wk-scan 2s ease-in-out infinite }
  .wk-spark   { position:absolute; border-radius:9999px; animation: wk-spark linear infinite }
  .wk-glow    { animation: wk-glow 3s ease-in-out infinite }
  #${/* SCANNER_DIV_ID placeholder */"walkin-qr-reader"} { line-height:0 }
  #walkin-qr-reader video  { width:100% !important; height:auto !important; display:block; max-height:320px; object-fit:cover }
  #walkin-qr-reader canvas { display:none !important }
`;

/* ─── STEM decorative SVGs ──────────────────────────────────────────────── */
function AtomIcon({ size = 48, color = "rgba(255,255,255,0.18)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ display: "block" }}>
      <ellipse cx="24" cy="24" rx="20" ry="8" stroke={color} strokeWidth="1.5"
        style={{ animation: "wk-orbit 4s linear infinite", transformOrigin: "24px 24px" }} />
      <ellipse cx="24" cy="24" rx="20" ry="8" stroke={color} strokeWidth="1.5"
        style={{ animation: "wk-orbit 4s linear infinite", transformOrigin: "24px 24px", transform: "rotate(60deg)" }} />
      <ellipse cx="24" cy="24" rx="20" ry="8" stroke={color} strokeWidth="1.5"
        style={{ animation: "wk-orbit 4s linear infinite", transformOrigin: "24px 24px", transform: "rotate(120deg)" }} />
      <circle cx="24" cy="24" r="3.5" fill={color} />
    </svg>
  );
}

function HexIcon({ size = 40, color = "rgba(255,255,255,0.12)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function CircuitDots({ color = "rgba(242,220,12,0.25)" }: { color?: string }) {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" style={{ position: "absolute", pointerEvents: "none" }}>
      <circle cx="10" cy="10" r="3" fill={color} />
      <circle cx="40" cy="10" r="3" fill={color} />
      <circle cx="80" cy="10" r="3" fill={color} />
      <circle cx="110" cy="10" r="3" fill={color} />
      <circle cx="10" cy="40" r="3" fill={color} />
      <circle cx="10" cy="70" r="3" fill={color} />
      <line x1="13" y1="10" x2="37" y2="10" stroke={color} strokeWidth="1" />
      <line x1="43" y1="10" x2="77" y2="10" stroke={color} strokeWidth="1" />
      <line x1="83" y1="10" x2="107" y2="10" stroke={color} strokeWidth="1" />
      <line x1="10" y1="13" x2="10" y2="37" stroke={color} strokeWidth="1" />
      <line x1="10" y1="43" x2="10" y2="67" stroke={color} strokeWidth="1" />
      <line x1="40" y1="13" x2="40" y2="37" stroke={color} strokeWidth="1" />
      <circle cx="40" cy="40" r="3" fill={color} />
    </svg>
  );
}

/* ─── Background for dark screens ──────────────────────────────────────── */
function StemBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      {/* grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle, rgba(242,220,12,.06) 1px, transparent 1px)`,
        backgroundSize: "32px 32px",
      }} />
      {/* floating shapes */}
      <div className="wk-float absolute top-[8%]  left-[6%]"  style={{ animationDelay: "0s"   }}><AtomIcon size={56} /></div>
      <div className="wk-float absolute top-[12%] right-[8%]" style={{ animationDelay: "1.2s" }}><HexIcon  size={48} /></div>
      <div className="wk-float absolute top-[55%] left-[4%]"  style={{ animationDelay: "2.1s" }}><HexIcon  size={36} color="rgba(213,108,165,.18)" /></div>
      <div className="wk-float absolute top-[65%] right-[5%]" style={{ animationDelay: "0.7s" }}><AtomIcon size={44} color="rgba(133,115,176,.2)" /></div>
      <div className="wk-float absolute top-[35%] right-[3%]" style={{ animationDelay: "3s"   }}><HexIcon  size={28} color="rgba(242,220,12,.15)" /></div>
      {/* circuit dot clusters */}
      <div className="absolute top-[18%] right-[12%] wk-pulse"><CircuitDots /></div>
      <div className="absolute bottom-[15%] left-[8%] wk-pulse" style={{ animationDelay: "1.5s" }}><CircuitDots color="rgba(133,115,176,.25)" /></div>
      {/* binary text */}
      {["10110001", "01001101", "11010010", "00110101"].map((bin, i) => (
        <div key={i} className="absolute font-mono text-[10px] wk-pulse select-none"
          style={{
            color: "rgba(242,220,12,.12)",
            top: `${20 + i * 18}%`, left: i % 2 === 0 ? "2%" : "88%",
            animationDelay: `${i * 0.8}s`, letterSpacing: "0.1em",
          }}>
          {bin}
        </div>
      ))}
    </div>
  );
}

/* ─── Techlympics logo header ───────────────────────────────────────────── */
function TechHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mt.svg" alt="Malaysia Techlympics"
        className={compact ? "h-7 w-auto brightness-0 invert" : "h-10 w-auto brightness-0 invert"} />
      {!compact && (
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase">Malaysia</p>
          <p className="text-sm font-extrabold tracking-[0.12em] text-white leading-tight uppercase"
            style={{ textShadow: `0 0 20px ${B.gold}60` }}>
            Techlympics
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── DefaultShield ─────────────────────────────────────────────────────── */
function DefaultShield({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 5L56 15V32C56 46.5 45.5 58.5 32 62C18.5 58.5 8 46.5 8 32V15L32 5Z"
        fill="rgba(8,87,130,0.15)" stroke={B.navy} strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 16L46 22V32C46 40.5 40 47.5 32 50C24 47.5 18 40.5 18 32V22L32 16Z"
        fill="rgba(8,87,130,0.3)" />
      <path d="M26 32L30.5 36.5L38 27.5" stroke={B.navy} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── ConfirmCard sparkles ──────────────────────────────────────────────── */
function CardSparkles() {
  const sparks = [
    { w:6, h:6, bg:B.gold,   l:"10%", t:"18%", dur:"1.4s", del:"0s"   },
    { w:4, h:4, bg:B.pink,   l:"82%", t:"25%", dur:"1.8s", del:".3s"  },
    { w:5, h:5, bg:B.purple, l:"62%", t:"12%", dur:"1.6s", del:".6s"  },
    { w:3, h:3, bg:B.navy,   l:"28%", t:"72%", dur:"2.0s", del:".2s"  },
    { w:4, h:4, bg:B.gold,   l:"72%", t:"68%", dur:"1.5s", del:".9s"  },
    { w:6, h:6, bg:B.red,    l:"46%", t:"82%", dur:"1.7s", del:".4s"  },
    { w:3, h:3, bg:B.purple, l:"18%", t:"44%", dur:"1.9s", del:".7s"  },
  ];
  return (
    <>
      {sparks.map((s, i) => (
        <div key={i} className="wk-spark"
          style={{ width:s.w, height:s.h, background:s.bg,
                   left:s.l, top:s.t, animationDuration:s.dur, animationDelay:s.del }} />
      ))}
    </>
  );
}

/* ─── ConfirmCard ───────────────────────────────────────────────────────── */
const CONFIRM_TIMEOUT = 5;

function ConfirmCard({ result, onReset }: { result: ScanResult; onReset: () => void }) {
  const [logoFailed,  setLogoFailed]  = useState(false);
  const [countdown,   setCountdown]   = useState(CONFIRM_TIMEOUT);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timerRef.current!); onReset(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // onReset is stable (defined inline in parent render) — intentionally omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAccept() {
    if (timerRef.current) clearInterval(timerRef.current);
    onReset();
  }

  const showLogo = result.contingentLogo && !logoFailed;
  const edu      = EDU_LABEL[result.eduLevel] ?? result.eduLevel;
  const pct      = (countdown / CONFIRM_TIMEOUT) * 100;

  return (
    <div className="wk-card-in relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
      style={{ background: `linear-gradient(160deg, #0d2744 0%, #0a1f38 60%, #1a1040 100%)` }}>
      <CardSparkles />

      {/* Rainbow top bar */}
      <div className="h-1.5 w-full"
        style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.purple}, ${B.pink}, ${B.red}, ${B.gold})` }} />

      <div className="px-5 pt-5 pb-5 space-y-5">

        {/* Logo + check */}
        <div className="flex flex-col items-center gap-3">
          <div className="wk-logo-in relative">
            <div className="h-20 w-20 rounded-2xl flex items-center justify-center border border-white/20"
              style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(4px)" }}>
              {showLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.contingentLogo!} alt={result.contingentName}
                  onError={() => setLogoFailed(true)}
                  className="h-14 w-14 object-contain rounded-xl" />
              ) : (
                <DefaultShield size={56} />
              )}
            </div>
            {/* check badge */}
            <div className="wk-pop absolute -bottom-1 -right-1 h-7 w-7 rounded-full flex items-center justify-center border-2"
              style={{ background: result.alreadyConfirmed ? B.purple : "#16a34a", borderColor: "#0a1f38" }}>
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
          </div>

          <div className="wk-name-in text-center space-y-1.5">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase"
              style={{ color: result.alreadyConfirmed ? B.purple : B.gold }}>
              {result.alreadyConfirmed ? "✓ Sudah Disahkan" : "✓ Selamat Datang!"}
            </p>
            <p className="text-[22px] font-extrabold text-white leading-tight tracking-tight px-2">
              {result.participantName}
            </p>
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,.55)" }}>
              {result.contingentName}
            </p>
            <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)" }}>
                {edu}
              </span>
              {result.classGrade && (
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: `${B.navy}50`, color: "#7dd3fc" }}>
                  {result.classGrade}
                </span>
              )}
              {result.ic && (
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.4)" }}>
                  {result.ic}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Competition block */}
        <div className="rounded-xl px-4 py-3.5 border space-y-1"
          style={{ background: `rgba(8,87,130,.25)`, borderColor: `${B.navy}80` }}>
          <p className="text-[9px] font-bold tracking-[0.25em] uppercase" style={{ color: B.gold }}>
            Pertandingan
          </p>
          <p className="text-sm font-bold text-white leading-snug">
            <span className="font-mono text-xs mr-1.5" style={{ color: "rgba(255,255,255,.4)" }}>
              {result.competitionCode}
            </span>
            {result.competitionName}
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,.45)" }}>{result.eventName}</p>
        </div>

        {/* Viblock Arena token */}
        {result.viblockToken && (
          <div className="rounded-xl px-4 py-3.5 border space-y-1.5"
            style={{ background: "rgba(124,58,237,.15)", borderColor: "rgba(139,92,246,.4)" }}>
            <p className="text-[9px] font-bold tracking-[0.25em] uppercase" style={{ color: "#a78bfa" }}>
              Viblock Arena Token
            </p>
            <p className="text-center text-2xl font-extrabold font-mono tracking-[0.3em] text-white">
              {result.viblockToken}
            </p>
          </div>
        )}

        {/* VibeBlocks token */}
        {result.vibeBlocksToken && (
          <div className="rounded-xl px-4 py-3.5 border space-y-1.5"
            style={{ background: "rgba(5,150,105,.15)", borderColor: "rgba(16,185,129,.4)" }}>
            <p className="text-[9px] font-bold tracking-[0.25em] uppercase" style={{ color: "#6ee7b7" }}>
              VibeBlocks Token
            </p>
            <p className="text-center text-2xl font-extrabold font-mono tracking-[0.35em] text-white">
              {result.vibeBlocksToken}
            </p>
          </div>
        )}

        {/* Drone Simulator token */}
        {result.droneToken && (
          <div className="w-full rounded-xl px-4 py-3 border space-y-2"
            style={{ background: "rgba(14,165,233,.12)", borderColor: "rgba(56,189,248,.4)" }}>
            <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-center" style={{ color: "#7dd3fc" }}>
              Drone Simulator
            </p>
            {result.droneToken.competitionToken && (
              <div className="rounded-lg px-3 py-2 text-center" style={{ background: "rgba(56,189,248,.15)" }}>
                <p className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(125,211,252,.7)" }}>Terminal Token</p>
                <p className="text-2xl font-extrabold font-mono tracking-[0.35em] text-white">{result.droneToken.competitionToken}</p>
              </div>
            )}
            <div className="space-y-1">
              {([["User ID", result.droneToken.userid], ["Password", result.droneToken.password]] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex justify-between items-center gap-2">
                  <span className="text-[9px] text-white/50 uppercase">{label}</span>
                  <span className="text-xs font-mono font-bold text-white">{val}</span>
                </div>
              ))}
            </div>
            <p className="text-[8px] text-center" style={{ color: "rgba(125,211,252,.6)" }}>Token disediakan — log masuk ke simulator drone</p>
          </div>
        )}

        {/* Accept + countdown */}
        <div className="space-y-2">
          <button type="button" onClick={handleAccept}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[.98]"
            style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.purple})`, color: "white" }}>
            <CheckCircle2 className="h-4 w-4" />
            Terima ({countdown})
          </button>
          {/* countdown progress bar */}
          <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.1)" }}>
            <div className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${B.navy}, ${B.gold})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Camera QR scanner ─────────────────────────────────────────────────── */
const SCANNER_DIV_ID = "walkin-qr-reader";

function CameraQrScanner({ onScan, onError }: {
  onScan: (text: string) => void; onError?: (msg: string) => void;
}) {
  const [active,      setActive]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [manuallyOff, setManuallyOff] = useState(false);
  const scannerRef  = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const startingRef = useRef(false); // guard against double-start in StrictMode

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      if (scannerRef.current.getState() === 2) await scannerRef.current.stop();
      document.getElementById(SCANNER_DIV_ID)?.querySelectorAll("video").forEach(v => {
        if (v.srcObject) { (v.srcObject as MediaStream).getTracks().forEach(t => t.stop()); v.srcObject = null; }
      });
    } catch { /* ignore */ }
    scannerRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  async function startScanner() {
    if (startingRef.current || active) return;
    startingRef.current = true;
    setLoading(true);
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(SCANNER_DIV_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" }, { fps: 10 },
        (text) => { onScan(text); stopScanner(); },
        undefined,
      );
      setActive(true);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Kamera tidak dapat diakses.");
      scannerRef.current = null;
    }
    setLoading(false);
    startingRef.current = false;
  }

  // Auto-start on mount unless the user previously closed it manually.
  // Component remounts after each ConfirmCard dismissal, resetting manuallyOff to false.
  // Deferred via setTimeout so setState calls inside startScanner don't run
  // synchronously within the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    const id = setTimeout(() => { startScanner(); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualStop() {
    setManuallyOff(true);
    await stopScanner();
  }

  return (
    <div className="space-y-3">
      {/* Camera viewport */}
      <div className={`relative rounded-2xl overflow-hidden bg-black border border-white/10 ${active ? "" : "hidden"}`}>
        <div id={SCANNER_DIV_ID} />
        {/* Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center gap-4">
          <div className="relative w-52 h-52" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}>
            {/* corner brackets — gold */}
            <span className="absolute top-0 left-0 block w-9 h-9 border-t-[3px] border-l-[3px] rounded-tl-sm"
              style={{ borderColor: B.gold }} />
            <span className="absolute top-0 right-0 block w-9 h-9 border-t-[3px] border-r-[3px] rounded-tr-sm"
              style={{ borderColor: B.gold }} />
            <span className="absolute bottom-0 left-0 block w-9 h-9 border-b-[3px] border-l-[3px] rounded-bl-sm"
              style={{ borderColor: B.gold }} />
            <span className="absolute bottom-0 right-0 block w-9 h-9 border-b-[3px] border-r-[3px] rounded-br-sm"
              style={{ borderColor: B.gold }} />
            {/* scan line — gold */}
            <div className="wk-scan-ln absolute left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${B.gold}, transparent)`, opacity: 0.9 }} />
          </div>
          <p className="text-white/70 text-xs font-semibold tracking-widest uppercase drop-shadow">
            Letakkan QR kod dalam kotak
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-3 text-sm"
          style={{ color: "rgba(255,255,255,.45)" }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: B.gold }} />
          Menyambung kamera…
        </div>
      ) : active ? (
        <button type="button" onClick={handleManualStop}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
          style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.12)" }}>
          <CameraOff className="h-4 w-4" />
          Hentikan kamera
        </button>
      ) : (
        <button type="button" onClick={() => { setManuallyOff(false); startScanner(); }}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[.98]"
          style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.purple})`, color: "white" }}>
          <Camera className="h-4 w-4" />
          Imbas dengan kamera
        </button>
      )}
    </div>
  );
}

/* ─── QR modal (after successful register) ──────────────────────────────── */
function QrModal({ regId, name, viblockToken, vibeBlocksToken, droneToken, onClose }: {
  regId: string; name: string;
  viblockToken?: string | null; vibeBlocksToken?: string | null;
  droneToken?: DroneTokenData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full border border-white/10"
        style={{ background: "linear-gradient(160deg, #0d2744, #1a1040)" }}
        onClick={e => e.stopPropagation()}>
        <div className="w-full flex items-center justify-between">
          <p className="text-sm font-bold text-white truncate">{name}</p>
          <button onClick={onClose}><X className="h-4 w-4 text-white/40" /></button>
        </div>
        <CheckCircle2 className="h-8 w-8" style={{ color: B.gold }} />
        <p className="text-sm font-bold" style={{ color: B.gold }}>Pendaftaran berjaya!</p>
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={regId} size={180} level="M" />
        </div>
        <p className="text-[10px] text-white/30 font-mono break-all text-center">{regId}</p>
        {viblockToken && (
          <div className="w-full rounded-xl px-4 py-3 border space-y-1"
            style={{ background: "rgba(124,58,237,.15)", borderColor: "rgba(139,92,246,.4)" }}>
            <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-center" style={{ color: "#a78bfa" }}>
              Viblock Arena Token
            </p>
            <p className="text-center text-xl font-extrabold font-mono tracking-[0.3em] text-white">
              {viblockToken}
            </p>
          </div>
        )}
        {vibeBlocksToken && (
          <div className="w-full rounded-xl px-4 py-3 border space-y-1"
            style={{ background: "rgba(5,150,105,.15)", borderColor: "rgba(16,185,129,.4)" }}>
            <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-center" style={{ color: "#6ee7b7" }}>
              VibeBlocks Token
            </p>
            <p className="text-center text-2xl font-extrabold font-mono tracking-[0.35em] text-white">
              {vibeBlocksToken}
            </p>
          </div>
        )}
        {droneToken && (
          <div className="w-full rounded-xl px-4 py-3 border space-y-2"
            style={{ background: "rgba(14,165,233,.12)", borderColor: "rgba(56,189,248,.4)" }}>
            <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-center" style={{ color: "#7dd3fc" }}>
              Drone Simulator
            </p>
            {droneToken.competitionToken && (
              <div className="rounded-lg px-3 py-2 text-center" style={{ background: "rgba(56,189,248,.15)" }}>
                <p className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(125,211,252,.7)" }}>Terminal Token</p>
                <p className="text-2xl font-extrabold font-mono tracking-[0.35em] text-white">{droneToken.competitionToken}</p>
              </div>
            )}
            <div className="space-y-1">
              {([["User ID", droneToken.userid], ["Password", droneToken.password]] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex justify-between items-center gap-2">
                  <span className="text-[9px] text-white/50 uppercase">{label}</span>
                  <span className="text-xs font-mono font-bold text-white">{val}</span>
                </div>
              ))}
            </div>
            <p className="text-[8px] text-center" style={{ color: "rgba(125,211,252,.6)" }}>Token disediakan — log masuk ke simulator drone</p>
          </div>
        )}
        <button type="button" onClick={onClose}
          className="w-full rounded-xl py-2.5 text-sm font-bold"
          style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.purple})`, color: "white" }}>
          Tutup
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export function CounterRegistrationClient({ slug }: { slug: string }) {
  const [wic,       setWic]       = useState<WicInfo | null>(null);
  const [loadErr,   setLoadErr]   = useState("");
  const [passcode,  setPasscode]  = useState("");
  const [gateErr,   setGateErr]   = useState("");
  const [authed,    setAuthed]    = useState(false);
  const [selectedWic, setSelectedWic] = useState<WicSummary | null>(null);
  const [q,           setQ]           = useState("");
  const [searching,   setSearching]   = useState(false);
  const [results,     setResults]     = useState<ParticipantResult[]>([]);
  const [selected,    setSelected]    = useState<ParticipantResult | null>(null);
  const [registeredBy, setRegisteredBy] = useState("");
  const [registering,  setRegistering]  = useState(false);
  const [regResult,    setRegResult]    = useState<RegisteredResult | null>(null);
  const [regErr,       setRegErr]       = useState("");
  const [tab,        setTab]        = useState<"register" | "scan">("register");
  const [scanPhase,  setScanPhase]  = useState<"idle" | "confirming" | "result" | "error">("idle");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanErr,    setScanErr]    = useState("");
  const [confirmingRegId,    setConfirmingRegId]    = useState<string | null>(null);
  const [manualConfirmedIds, setManualConfirmedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/v2/walkin/${slug}`).then(r => r.json()).then(j => {
      if (j.error) { setLoadErr("Endpoint tidak dijumpai atau tidak aktif."); return; }
      setWic(j.data);
    }).catch(() => setLoadErr("Ralat memuatkan maklumat endpoint."));
  }, [slug]);

  async function handleGate() {
    if (!passcode.trim()) return;
    const res = await fetch(`/api/v2/walkin/${slug}/participants?q=test&passcode=${encodeURIComponent(passcode)}`);
    if (res.status === 403) { setGateErr("Passcode tidak sah."); return; }
    setAuthed(true); setGateErr("");
  }

  const activeWicId = wic && !wic.isGeneral ? wic.id : selectedWic?.id ?? null;

  async function handleSearch(value: string) {
    setQ(value); setSelected(null);
    if (value.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const sp = new URLSearchParams({ q: value, passcode });
    if (activeWicId) sp.set("competitionId", activeWicId);
    const j = await fetch(`/api/v2/walkin/${slug}/participants?${sp}`).then(r => r.json());
    setResults(j.data ?? []);
    setSearching(false);
  }

  async function handleRegister() {
    if (!selected) return;
    setRegistering(true); setRegErr("");
    const res = await fetch(`/api/v2/walkin/${slug}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: selected.id, passcode, registeredBy: registeredBy.trim() || null, competitionId: activeWicId }),
    });
    const j = await res.json();
    if (!res.ok) setRegErr(j.error === "ALREADY_REGISTERED" ? "Peserta sudah berdaftar." : (j.message ?? j.error ?? "Gagal mendaftar."));
    else { setRegResult(j.data); setSelected(null); setQ(""); setResults([]); }
    setRegistering(false);
  }

  async function handleManualConfirm(regId: string, participantId: string) {
    setConfirmingRegId(regId);
    const res = await fetch(`/api/v2/walkin/${slug}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: regId, passcode }),
    });
    const j = await res.json();
    if (res.ok) {
      setScanResult(j.data);
      setScanPhase("result");
      setTab("scan");
      setManualConfirmedIds(prev => new Set([...prev, participantId]));
    }
    setConfirmingRegId(null);
  }

  async function handleConfirmScan(rid: string) {
    if (!rid.trim()) return;
    setScanPhase("confirming"); setScanErr(""); setScanResult(null);
    const res = await fetch(`/api/v2/walkin/${slug}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: rid.trim(), passcode }),
    });
    const j = await res.json();
    if (!res.ok) {
      const msgs: Record<string, string> = {
        REGISTRATION_NOT_FOUND: "Pendaftaran tidak dijumpai.",
        REGISTRATION_MISMATCH:  "QR kod ini bukan untuk kaunter ini.",
        CANNOT_CONFIRM:         `Status tidak sah: ${j.message ?? ""}`,
        INVALID_PASSCODE:       "Passcode tidak sah.",
      };
      setScanErr(msgs[j.error] ?? j.message ?? "Gagal mengesahkan."); setScanPhase("error");
    } else { setScanResult(j.data); setScanPhase("result"); }
  }

  /* page bg style */
  const pageBg = {
    minHeight: "100vh",
    background: `linear-gradient(150deg, #071a2e 0%, #0d2540 55%, #160d35 100%)`,
    position: "relative" as const,
    overflow: "hidden" as const,
  };

  if (loadErr) return (
    <div style={pageBg} className="flex items-center justify-center p-6">
      <StemBg />
      <div className="relative z-10 rounded-2xl border border-white/10 p-8 max-w-sm w-full text-center"
        style={{ background: "rgba(255,255,255,.06)", backdropFilter: "blur(16px)" }}>
        <p className="text-sm font-medium text-red-400">{loadErr}</p>
      </div>
    </div>
  );

  if (!wic) return (
    <div style={pageBg} className="flex items-center justify-center">
      <StemBg />
      <Loader2 className="h-7 w-7 animate-spin relative z-10" style={{ color: B.gold }} />
    </div>
  );

  /* ── Gate screen ───────────────────────────────────────────────────── */
  if (!authed) {
    const titleLabel = wic.isGeneral ? (wic.label ?? "Semua Pertandingan") : wic.competition.name;
    const regCount   = wic.isGeneral ? wic.walkInCompetitions.reduce((s, w) => s + w._count.registrations, 0) : wic._count.registrations;
    const maxSlots   = wic.isGeneral ? 0 : wic.maxSlots;

    return (
      <div style={pageBg} className="flex flex-col items-center justify-center p-6 gap-8">
        <style>{GLOBAL_CSS}</style>
        <StemBg />

        <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <TechHeader />
            <div className="h-px w-24 opacity-20" style={{ background: B.gold }} />
          </div>

          {/* Card */}
          <div className="w-full rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: "rgba(255,255,255,.06)", backdropFilter: "blur(20px)" }}>
            {/* Card top bar */}
            <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.gold}, ${B.pink})` }} />
            <div className="p-7 space-y-6">
              <div className="text-center space-y-1.5">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2"
                  style={{ background: `${B.navy}60`, border: `1px solid ${B.navy}` }}>
                  <UserCheck className="h-6 w-6" style={{ color: "#7dd3fc" }} />
                </div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: B.gold }}>
                  Walk-in Registration
                </p>
                <p className="text-base font-bold text-white leading-snug">{titleLabel}</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,.45)" }}>{wic.event.name}</p>
                {wic.event.venue && (
                  <p className="text-xs flex items-center justify-center gap-1" style={{ color: "rgba(255,255,255,.35)" }}>
                    <MapPin className="h-3 w-3" />{wic.event.venue}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold tracking-wide" style={{ color: "rgba(255,255,255,.5)" }}>
                  PASSCODE KAUNTER
                </label>
                <input type="password" value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleGate()}
                  placeholder="••••••"
                  className="w-full h-11 rounded-xl px-4 text-sm text-white placeholder-white/20 focus:outline-none"
                  style={{ background: "rgba(255,255,255,.08)", border: `1px solid rgba(255,255,255,.15)` }}
                />
                {gateErr && <p className="text-xs text-red-400">{gateErr}</p>}
                <button type="button" onClick={handleGate}
                  className="w-full h-11 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-[.98]"
                  style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.purple})`, color: "white" }}>
                  Masuk
                </button>
              </div>

              <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,.25)" }}>
                {regCount} pendaftaran{maxSlots > 0 ? ` / ${maxSlots} slot` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Competition picker (general endpoint) ─────────────────────────── */
  if (wic.isGeneral && !selectedWic) return (
    <div style={pageBg}>
      <style>{GLOBAL_CSS}</style>
      <StemBg />
      {/* Header */}
      <div className="relative z-10 border-b border-white/10 px-5 py-4 flex items-center gap-3"
        style={{ background: "rgba(0,0,0,.3)", backdropFilter: "blur(12px)" }}>
        <TechHeader compact />
        <div className="w-px h-5 bg-white/20" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{wic.label ?? "Walk-in"}</p>
          <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,.4)" }}>{wic.event.name}</p>
        </div>
      </div>
      <div className="relative z-10 max-w-lg mx-auto p-5 space-y-3">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: B.gold }}>
          Pilih pertandingan
        </p>
        {wic.walkInCompetitions.map(w => (
          <button key={w.id} type="button" onClick={() => setSelectedWic(w)}
            className="w-full text-left rounded-2xl border border-white/10 px-4 py-3.5 flex items-center gap-3 transition-all hover:border-white/25"
            style={{ background: "rgba(255,255,255,.05)", backdropFilter: "blur(8px)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">
                <span className="font-mono text-xs mr-1.5" style={{ color: "rgba(255,255,255,.35)" }}>{w.competition.code}</span>
                {w.competition.name}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,.4)" }}>
                {w._count.registrations} daftar{w.maxSlots > 0 ? ` / ${w.maxSlots}` : ""}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,.3)" }} />
          </button>
        ))}
      </div>
    </div>
  );

  const activeCompetition = wic.isGeneral ? selectedWic!.competition : wic.competition;

  /* ── Main registration screen ──────────────────────────────────────── */
  return (
    <div style={pageBg}>
      <style>{GLOBAL_CSS}</style>
      <StemBg />

      {/* Header */}
      <div className="relative z-10 border-b border-white/10 px-5 py-3.5 flex items-center gap-3"
        style={{ background: "rgba(0,0,0,.35)", backdropFilter: "blur(12px)" }}>
        <TechHeader compact />
        <div className="w-px h-5 bg-white/20" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">
            <span className="font-mono text-xs mr-1.5" style={{ color: "rgba(255,255,255,.35)" }}>
              {activeCompetition.code}
            </span>
            {activeCompetition.name}
          </p>
          <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,.4)" }}>{wic.event.name}</p>
        </div>
        {wic.isGeneral && (
          <button type="button"
            onClick={() => { setSelectedWic(null); setQ(""); setResults([]); setSelected(null); }}
            className="shrink-0 text-xs font-semibold rounded-lg px-2.5 py-1 transition-colors"
            style={{ background: `${B.navy}50`, color: "#7dd3fc", border: `1px solid ${B.navy}70` }}>
            Tukar
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="relative z-10 flex border-b border-white/10"
        style={{ background: "rgba(0,0,0,.25)", backdropFilter: "blur(8px)" }}>
        {([["register", "Daftar Peserta", Search], ["scan", "Imbas QR", ScanLine]] as const).map(([t, label, Icon]) => (
          <button key={t} type="button"
            onClick={() => { setTab(t); setScanPhase("idle"); setScanResult(null); setScanErr(""); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors border-b-2"
            style={tab === t
              ? { borderBottomColor: B.gold, color: B.gold }
              : { borderBottomColor: "transparent", color: "rgba(255,255,255,.4)" }
            }>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-lg mx-auto p-5 space-y-4">
        {tab === "register" && (
          <>
            <input value={registeredBy} onChange={e => setRegisteredBy(e.target.value)}
              placeholder="Nama kakitangan (pilihan)"
              className="w-full h-10 rounded-xl px-4 text-sm text-white placeholder-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }} />

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                style={{ color: "rgba(255,255,255,.3)" }} />
              <input value={q} onChange={e => handleSearch(e.target.value)}
                placeholder="Cari peserta (nama atau IC)…"
                className="w-full h-11 rounded-xl pl-10 pr-10 text-sm text-white placeholder-white/25 focus:outline-none"
                style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }} />
              {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin"
                style={{ color: "rgba(255,255,255,.4)" }} />}
            </div>

            {results.length > 0 && (
              <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/10"
                style={{ background: "rgba(255,255,255,.05)", backdropFilter: "blur(12px)" }}>
                {results.map(p => {
                  const isPending  = p.alreadyRegistered && p.registrationStatus === "PENDING"
                                     && !manualConfirmedIds.has(p.id);
                  const isDone     = p.alreadyRegistered && !isPending;

                  if (isDone) return (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3 opacity-40">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,.4)" }}>
                          {p.contingentName} · {p.eduLevel}{p.classGrade ? ` ${p.classGrade}` : ""}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(22,163,74,.2)", color: "#4ade80", border: "1px solid rgba(22,163,74,.3)" }}>
                        Terdaftar
                      </span>
                    </div>
                  );

                  if (isPending) return (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,.4)" }}>
                          {p.contingentName} · {p.eduLevel}{p.classGrade ? ` ${p.classGrade}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(245,158,11,.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,.3)" }}>
                          Pre-daftar
                        </span>
                        <button type="button"
                          onClick={() => p.registrationId && handleManualConfirm(p.registrationId, p.id)}
                          disabled={confirmingRegId === p.registrationId}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                          style={{ background: B.gold, color: "#000" }}>
                          {confirmingRegId === p.registrationId
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <CheckCircle2 className="h-3 w-3" />}
                          Sahkan
                        </button>
                      </div>
                    </div>
                  );

                  return (
                    <button key={p.id} type="button" onClick={() => setSelected(p)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                      style={selected?.id === p.id ? { background: `${B.navy}40` } : {}}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,.4)" }}>
                          {p.contingentName} · {p.eduLevel}{p.classGrade ? ` ${p.classGrade}` : ""}
                        </p>
                      </div>
                      {selected?.id === p.id && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: `${B.navy}60`, color: "#7dd3fc", border: `1px solid ${B.navy}` }}>
                          Dipilih
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {selected && (
              <div className="rounded-2xl p-4 space-y-3 border"
                style={{ background: `rgba(8,87,130,.2)`, borderColor: `${B.navy}60` }}>
                <p className="text-sm font-bold text-white">{selected.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: "rgba(255,255,255,.5)" }}>
                  <span>Kontinjen: <strong className="text-white/80">{selected.contingentName}</strong></span>
                  <span>Tahap: <strong className="text-white/80">{selected.eduLevel}{selected.classGrade ? ` ${selected.classGrade}` : ""}</strong></span>
                  {selected.ic && <span>IC: <strong className="text-white/80 font-mono">{selected.ic}</strong></span>}
                  {selected.age && <span>Umur: <strong className="text-white/80">{selected.age}</strong></span>}
                </div>
                {regErr && <p className="text-xs text-red-400">{regErr}</p>}
                <button type="button" onClick={handleRegister} disabled={registering}
                  className="w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-60"
                  style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.purple})`, color: "white" }}>
                  {registering && <Loader2 className="h-4 w-4 animate-spin" />}
                  Daftar Sekarang
                </button>
              </div>
            )}
          </>
        )}

        {tab === "scan" && (
          <div className="space-y-4">
            {scanPhase === "result" && scanResult
              ? <ConfirmCard result={scanResult}
                  onReset={() => { setScanPhase("idle"); setScanResult(null); setScanErr(""); }} />
              : <>
                  <CameraQrScanner
                    onScan={text => handleConfirmScan(text)}
                    onError={msg => { setScanErr(msg); setScanPhase("error"); }}
                  />
                  {scanPhase === "confirming" && (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm font-medium"
                      style={{ color: B.gold }}>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Mengesahkan pendaftaran…
                    </div>
                  )}
                  {scanPhase === "error" && scanErr && (
                    <div className="rounded-xl px-4 py-3 flex items-start gap-3 border"
                      style={{ background: "rgba(231,82,98,.1)", borderColor: "rgba(231,82,98,.3)" }}>
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-300">{scanErr}</p>
                        <button type="button" onClick={() => { setScanPhase("idle"); setScanErr(""); }}
                          className="text-xs text-red-400 hover:text-red-200 mt-1 underline">
                          Cuba lagi
                        </button>
                      </div>
                    </div>
                  )}
                  {scanPhase === "idle" && (
                    <p className="text-center text-xs" style={{ color: "rgba(255,255,255,.3)" }}>
                      QR kod peserta akan disahkan secara automatik apabila diimbas.
                    </p>
                  )}
                </>
            }
          </div>
        )}
      </div>

      {regResult && (
        <QrModal regId={regResult.id} name={selected?.name ?? "Peserta"} viblockToken={regResult.viblockToken} vibeBlocksToken={regResult.vibeBlocksToken} droneToken={regResult.droneToken} onClose={() => setRegResult(null)} />
      )}
    </div>
  );
}
