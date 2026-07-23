"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Trophy, Loader2, Eye, EyeOff, Lock, Star, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type RankEntry = {
  rank: number; teamId: string; teamName: string;
  contingentName: string; contingentShortName: string | null;
  contingentLogo: string | null;
  stateId: string | null; stateName: string | null; stateFlag: string | null;
  totalScore: number; bestTime: number | null;
  members: { id: string; name: string }[];
};

type CompetitionResult = { id: string; name: string; code: string; targetGroups: { code: string; name: string }[]; rankings: RankEntry[] };

type BoardData = {
  endpoint: { id: string; label: string | null; status: string; isWalkIn?: boolean };
  event:    { id: string; name: string; scope: string; startDate: string | null; endDate: string | null };
  competitions: CompetitionResult[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(s: number) {
  const m = Math.floor(s / 60); const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}


function ContingentLogo({ logo, name, size = "md", style }: { logo: string | null; name: string; size?: "sm" | "md" | "lg" | "xl"; style?: React.CSSProperties }) {
  const [err, setErr] = useState(false);
  const sizeMap = { sm: "w-8 h-8", md: "w-12 h-12", lg: "w-16 h-16", xl: "w-24 h-24" };
  const cls = sizeMap[size];

  if (!logo || err) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt={name} onError={() => setErr(true)} style={style}
    className={cn(cls, "rounded-xl object-contain shadow-lg bg-white/10 p-1")} />;
}

// ── Rank label (Malay ordinal) ─────────────────────────────────────────────────

function tempatLabel(rank: number): string {
  const named: Record<number, string> = { 1: "Pertama", 2: "Kedua", 3: "Ketiga" };
  return `Tempat ${named[rank] ?? `Ke-${rank}`}`;
}


// ── Partner logos ──────────────────────────────────────────────────────────────

const PARTNER_LOGOS = [
  "madani-white.svg",
  "might-white.svg",
  "motto-white.svg",
  "my-book-of-record-white.svg",
  "rakan-muda-white.svg",
  "visit-my-white.svg",
];

// ── Sparkle celebration canvas ────────────────────────────────────────────────

type Sparkle = {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; alpha: number;
  decay: number; rotation: number; rotSpeed: number;
};

const SPARKLE_COLORS = [
  "#FFD700", "#FFA500", "#FF6B6B", "#FF69B4",
  "#00CED1", "#4ECDC4", "#45B7D1", "#7B68EE",
  "#96CEB4", "#FFEAA7", "#98FB98", "#DDA0DD",
];

function SparkleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Sparkle[]>([]);
  const animIdRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function spawnBurst() {
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;
      for (let b = 0; b < 6; b++) {
        const cx = Math.random() * W;
        const cy = Math.random() * H * 0.75;
        for (let i = 0; i < 18; i++) {
          const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
          const speed = 2.5 + Math.random() * 7;
          particlesRef.current.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.5,
            size: 4 + Math.random() * 7,
            color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
            alpha: 1,
            decay: 0.011 + Math.random() * 0.014,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.22,
          });
        }
      }
    }

    function drawStar(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a1 = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const a2 = a1 + Math.PI / 5;
        c.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
        c.lineTo(Math.cos(a2) * r * 0.42, Math.sin(a2) * r * 0.42);
      }
      c.closePath();
      c.restore();
    }

    function loop() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current = particlesRef.current.filter(p => p.alpha > 0.02);

      for (const p of particlesRef.current) {
        p.x       += p.vx;
        p.y       += p.vy;
        p.vy      += 0.13;
        p.vx      *= 0.98;
        p.alpha   -= p.decay;
        p.rotation += p.rotSpeed;

        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle   = p.color;
        ctx.shadowBlur  = 10;
        ctx.shadowColor = p.color;
        drawStar(ctx, p.x, p.y, p.size, p.rotation);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      animIdRef.current = requestAnimationFrame(loop);
    }

    loop();

    function onKeyDown() { spawnBurst(); }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(animIdRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 500, mixBlendMode: "screen" }}
    />
  );
}

// ── Animated wave background ──────────────────────────────────────────────────

const WAVES_DEFAULT = [
  { color: "rgba(30,  120, 255, 0.55)", glow: "rgba(30, 120, 255, 0.4)",  speed: 0.40, amp: 65, freq: 0.90, yOff: 0.42, width: 16 },
  { color: "rgba(0,   220, 200, 0.50)", glow: "rgba(0,  220, 200, 0.35)", speed: 0.28, amp: 85, freq: 0.65, yOff: 0.50, width: 13 },
  { color: "rgba(50,  200,  80, 0.48)", glow: "rgba(50, 200,  80, 0.30)", speed: 0.50, amp: 55, freq: 1.05, yOff: 0.56, width: 11 },
  { color: "rgba(255, 170,   0, 0.45)", glow: "rgba(255,170,   0, 0.30)", speed: 0.35, amp: 72, freq: 0.75, yOff: 0.53, width: 10 },
];

const WAVES_PURPLE = [
  { color: "rgba(168, 85, 247, 0.55)", glow: "rgba(168, 85, 247, 0.4)",  speed: 0.40, amp: 65, freq: 0.90, yOff: 0.42, width: 16 },
  { color: "rgba(139, 92, 246, 0.50)", glow: "rgba(139, 92, 246, 0.35)", speed: 0.28, amp: 85, freq: 0.65, yOff: 0.50, width: 13 },
  { color: "rgba(192, 132, 252, 0.48)", glow: "rgba(192, 132, 252, 0.30)", speed: 0.50, amp: 55, freq: 1.05, yOff: 0.56, width: 11 },
  { color: "rgba(236, 72, 153, 0.45)", glow: "rgba(236, 72, 153, 0.30)", speed: 0.35, amp: 72, freq: 0.75, yOff: 0.53, width: 10 },
];

function WaveCanvas({ isWalkIn = false }: { isWalkIn?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const waves = isWalkIn ? WAVES_PURPLE : WAVES_DEFAULT;
      for (const w of waves) {
        // Precompute wave points once, reused across passes
        const pts: [number, number][] = [];
        for (let x = 0; x <= W; x += 3) {
          const y = H * w.yOff + Math.sin((x / W) * Math.PI * 2 * w.freq + t * w.speed) * w.amp;
          pts.push([x, y]);
        }

        // Pass 1 — base wave with glow
        ctx.beginPath();
        pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.shadowBlur  = 28;
        ctx.shadowColor = w.glow;
        ctx.strokeStyle = w.color;
        ctx.lineWidth   = w.width;
        ctx.lineCap     = "round";
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // Pass 2 — shiny ridge (thinner white stroke offset above crest)
        ctx.beginPath();
        pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y - 5); else ctx.lineTo(x, y - 5); });
        ctx.strokeStyle = "rgba(255,255,255,0.20)";
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = "round";
        ctx.stroke();

        // Pass 3 — traveling shimmer sparkle along the crest
        const shimCx = ((t * w.speed * 200) % (W + 200)) - 100;
        const shimR  = 100;
        const sFrom  = Math.max(0, shimCx - shimR);
        const sTo    = Math.min(W, shimCx + shimR);
        if (sTo > sFrom) {
          ctx.beginPath();
          let first = true;
          for (const [x, y] of pts) {
            if (x < sFrom || x > sTo) continue;
            if (first) { ctx.moveTo(x, y - 5); first = false; }
            else ctx.lineTo(x, y - 5);
          }
          if (!first) {
            const grad = ctx.createLinearGradient(sFrom, 0, sTo, 0);
            grad.addColorStop(0,   "rgba(255,255,255,0)");
            grad.addColorStop(0.4, "rgba(255,255,255,0.80)");
            grad.addColorStop(0.6, "rgba(255,255,255,0.80)");
            grad.addColorStop(1,   "rgba(255,255,255,0)");
            ctx.strokeStyle = grad;
            ctx.lineWidth   = 4;
            ctx.shadowBlur  = 18;
            ctx.shadowColor = "rgba(255,255,255,0.95)";
            ctx.stroke();
            ctx.shadowBlur  = 0;
          }
        }
      }

      t += 0.018;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
    />
  );
}

// ── Team spotlight overlay ─────────────────────────────────────────────────────

function TeamSpotlight({
  entry,
  eventName,
  competitionCode,
  competitionName,
  onClose,
  isWalkIn = false,
  scale = 1,
}: {
  entry: RankEntry;
  eventName: string;
  competitionCode?: string;
  competitionName?: string;
  onClose: () => void;
  isWalkIn?: boolean;
  scale?: number;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className={cn("fixed inset-0 z-[100] flex flex-col overflow-y-auto", isWalkIn ? "bg-gradient-to-br from-purple-950 via-violet-900 to-indigo-900" : "bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800")}
      onClick={onClose}
    >
      {/* Geometric isometric cube wireframe texture */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.15]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='173.2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 0 L100 28.87 L100 86.6 L50 115.47 L0 86.6 L0 28.87 Z' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='0.5'/%3E%3Cpath d='M50 0 L50 57.74' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='0.5'/%3E%3Cpath d='M0 28.87 L50 57.74' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='0.5'/%3E%3Cpath d='M100 28.87 L50 57.74' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='0.5'/%3E%3Cpath d='M50 57.74 L50 115.47' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='0.5'/%3E%3Cpath d='M50 57.74 L0 86.6' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='0.5'/%3E%3Cpath d='M50 57.74 L100 86.6' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='0.5'/%3E%3Cpath d='M50 115.47 L100 144.34 L100 173.2' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='0.5'/%3E%3Cpath d='M50 115.47 L0 144.34 L0 173.2' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='0.5'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "100px 173.2px" }} />
      <style>{`
        @keyframes spotlightSweep1 {
          0%   { transform: rotate(-15deg); opacity: 0.4; }
          50%  { transform: rotate(15deg); opacity: 0.7; }
          100% { transform: rotate(-15deg); opacity: 0.4; }
        }
        @keyframes spotlightSweep2 {
          0%   { transform: rotate(10deg); opacity: 0.3; }
          50%  { transform: rotate(-20deg); opacity: 0.6; }
          100% { transform: rotate(10deg); opacity: 0.3; }
        }
        @keyframes spotlightSweep3 {
          0%   { transform: rotate(-5deg); opacity: 0.35; }
          50%  { transform: rotate(25deg); opacity: 0.55; }
          100% { transform: rotate(-5deg); opacity: 0.35; }
        }
      `}</style>

      {/* Spotlight shower effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
        <div className="absolute -top-20 left-[15%] w-[200px] h-[800px] origin-top"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 70%)", clipPath: "polygon(40% 0%, 60% 0%, 100% 100%, 0% 100%)", animation: "spotlightSweep1 6s ease-in-out infinite" }} />
        <div className="absolute -top-20 left-[50%] w-[180px] h-[750px] origin-top"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 65%)", clipPath: "polygon(35% 0%, 65% 0%, 100% 100%, 0% 100%)", animation: "spotlightSweep2 8s ease-in-out infinite" }} />
        <div className="absolute -top-20 right-[15%] w-[160px] h-[700px] origin-top"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 60%)", clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)", animation: "spotlightSweep3 7s ease-in-out infinite" }} />
      </div>

      <WaveCanvas isWalkIn={isWalkIn} />

      {/* Winner figures — bottom-left: 5 (back), 2 + 1 (front) */}
      <div className="absolute bottom-0 left-0 z-10 pointer-events-none opacity-30" style={{ width: "420px", height: "500px" }}>
        {/* 5 — back layer, largest */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/5.png" alt="" className="absolute bottom-0 select-none" style={{ width: "460px", left: "20px", zIndex: 0 }} />
        {/* 2 — front left */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/2.png" alt="" className="absolute bottom-0 left-0 select-none" style={{ width: "130px", zIndex: 1 }} />
        {/* 1 — front right */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/1.png" alt="" className="absolute bottom-0 select-none" style={{ width: "160px", left: "240px", zIndex: 1, filter: "drop-shadow(0 4px 40px rgba(0,0,0,0.5)) drop-shadow(0 12px 60px rgba(0,0,0,0.35)) drop-shadow(0 0 80px rgba(0,0,0,0.25))" }} />
      </div>

      {/* Close button */}
      <button
        className="absolute top-4 right-4 z-[200] text-white/50 hover:text-white transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <X className="h-7 w-7" />
      </button>

      {/* Content — stop propagation so clicks inside don't close */}
      <div
        className="relative z-10 flex flex-col min-h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top center: Jata Negara */}
        <div className="flex justify-center pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos-white/Jata-01-white.png" alt="Jata Negara" className="w-auto" style={{ height: `${scale * 10}rem`, filter: "drop-shadow(0 0 4px rgba(255,255,255,0.3)) drop-shadow(0 0 12px rgba(255,255,255,0.2)) drop-shadow(0 0 30px rgba(255,255,255,0.1))" }} />
        </div>

        {/* Main two-column area */}
        <div className="flex flex-1 items-center">

          {/* Left: logo + event name + competition name */}
          <div className="flex flex-col items-center justify-center gap-5 flex-1 px-8 py-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos-white/mt-logo-white.svg" alt="Techlympics" className="w-auto" style={{ height: `${scale * 16}rem` }} />
            <p className="text-white font-black tracking-widest uppercase whitespace-nowrap drop-shadow-lg" style={{ fontSize: `${scale * 2.25}rem`, fontFamily: "var(--font-poppins)", WebkitTextStroke: "0.5px rgba(0,0,0,0.6)" }}>{eventName}</p>
            {competitionName && (
              <p className="text-white font-bold tracking-wide uppercase drop-shadow-lg" style={{ fontSize: `${scale * 2.25}rem`, fontFamily: "var(--font-poppins)", WebkitTextStroke: "0.5px rgba(0,0,0,0.6)" }}>{competitionCode} {competitionName}</p>
            )}
          </div>

          {/* Divider */}
          <div className="w-px self-stretch bg-white/10 my-10" />

          {/* Right: rank (top) + contingent logo + state flag + contingent name + team name + members */}
          <div className="flex flex-col items-center justify-start gap-5 flex-1 px-8 py-10 text-center">
            {/* Rank label — top of right column */}
            <div className="flex items-center gap-3">
              <div className="h-px w-16 bg-white/20" />
              <p className="font-black tracking-wide uppercase drop-shadow-lg text-amber-400" style={{ fontSize: `${scale * 1.875}rem`, fontFamily: "var(--font-poppins)" }}>
                {tempatLabel(entry.rank)}
              </p>
              <div className="h-px w-16 bg-white/20" />
            </div>
            {/* Contingent logo + state flag */}
            <div className="flex items-center gap-6">
              <ContingentLogo logo={entry.contingentLogo} name={entry.contingentName} size="xl" style={{ width: `${scale * 6}rem`, height: `${scale * 6}rem` }} />
              {entry.stateFlag && (
                <div className="rounded-lg overflow-hidden border-2 border-white/40 shadow-lg shrink-0" style={{ width: `${scale * 8}rem`, height: `${scale * 5}rem` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.stateFlag} alt={entry.stateName ?? "State"} className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            {/* Contingent name */}
            <p className="text-amber-400 font-black tracking-wide uppercase drop-shadow-lg" style={{ fontSize: `${scale * 1.875}rem`, fontFamily: "var(--font-poppins)", WebkitTextStroke: "1px rgba(0,0,0,0.6)" }}>
              {entry.contingentName}
            </p>
            {/* Team name */}
            <p className="text-white font-black drop-shadow-lg" style={{ fontSize: `${scale * 2.25}rem`, fontFamily: "var(--font-poppins)", WebkitTextStroke: "0.5px rgba(0,0,0,0.6)" }}>{entry.teamName}</p>
            {/* Members */}
            {!isWalkIn && entry.members.length > 0 && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-white/30 text-xs font-bold uppercase tracking-widest mb-1">Ahli Pasukan</p>
                {entry.members.map((m) => (
                  <p key={m.id} className="text-white font-bold uppercase whitespace-nowrap drop-shadow-lg" style={{ fontSize: `${scale * 1.25}rem`, WebkitTextStroke: "0.3px rgba(0,0,0,0.5)" }}>{m.name}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom: partner logos */}
        <div className="w-screen px-6 py-3 bg-black/40 flex flex-wrap justify-center items-center gap-5">
          {PARTNER_LOGOS.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f} src={`/logos-white/${f}`} alt={f.replace("-white.svg", "")} className="w-auto opacity-60" style={{ height: `${scale * 2}rem` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Podium ─────────────────────────────────────────────────────────────────────

const PODIUM_CONFIG = [
  { pos: 2, height: "h-24", bg: "from-slate-400/30 to-slate-500/20", border: "border-slate-300/30", label: "text-slate-200", icon: "🥈" },
  { pos: 1, height: "h-36", bg: "from-amber-400/30 to-amber-600/20", border: "border-amber-300/40", label: "text-amber-200", icon: "🥇" },
  { pos: 3, height: "h-16", bg: "from-orange-400/30 to-orange-600/20", border: "border-orange-300/30", label: "text-orange-200", icon: "🥉" },
];

function Podium({ rankings, onSelect }: { rankings: RankEntry[]; onSelect: (e: RankEntry) => void }) {
  const top3 = [rankings[1], rankings[0], rankings[2]]; // silver, gold, bronze order

  return (
    <div className="flex items-end justify-center gap-3 mb-8 px-4">
      {PODIUM_CONFIG.map(({ pos, height, bg, border, label, icon }, i) => {
        const team = top3[i];
        if (!team) return <div key={pos} className="w-36" />;
        return (
          <div
            key={pos}
            className="flex flex-col items-center gap-2 flex-1 max-w-[200px] cursor-pointer group"
            onClick={() => onSelect(team)}
          >
            {/* Team info above podium */}
            <div className="text-center space-y-1.5 transition-transform group-hover:scale-105 duration-200">
              <ContingentLogo logo={team.contingentLogo} name={team.contingentName} size={pos === 1 ? "xl" : "lg"} />
              <p className={cn("font-black leading-tight drop-shadow", pos === 1 ? "text-base text-white" : "text-sm text-white/80")}>
                {team.teamName}
              </p>
              <p className={cn("text-xs truncate max-w-[150px]", label)}>
                {team.contingentShortName ?? team.contingentName}
              </p>
              <p className={cn("font-black text-2xl drop-shadow", pos === 1 ? "text-amber-300" : pos === 2 ? "text-slate-200" : "text-orange-300")}>
                {team.totalScore.toFixed(1)}
              </p>
              {team.bestTime != null && (
                <p className="text-[11px] text-sky-300 font-mono">{fmtTime(team.bestTime)}</p>
              )}
            </div>
            {/* Podium block */}
            <div className={cn(
              "w-full rounded-t-xl border backdrop-blur-sm flex items-center justify-center",
              height, `bg-gradient-to-b ${bg}`, border
            )}>
              <span className="text-3xl">{icon}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rankings table (rank 4+) ───────────────────────────────────────────────────

function RankingsTable({ rankings, onSelect }: { rankings: RankEntry[]; onSelect: (e: RankEntry) => void }) {
  const rest = rankings.slice(3);
  if (!rest.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm bg-white/5 mx-4 mb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider w-12">#</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider">Pasukan</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider">Kontinjen</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-white/40 uppercase tracking-wider w-20">Markah</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-white/40 uppercase tracking-wider w-20">Masa</th>
          </tr>
        </thead>
        <tbody>
          {rest.map(r => (
            <tr
              key={r.teamId}
              className="border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              onClick={() => onSelect(r)}
            >
              <td className="px-4 py-3 text-white/50 font-bold text-sm">{r.rank}</td>
              <td className="px-4 py-3 text-white font-medium">{r.teamName}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <ContingentLogo logo={r.contingentLogo} name={r.contingentName} size="sm" />
                  <span className="text-white/70 text-sm truncate max-w-[180px]">{r.contingentName}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-bold text-rose-300">{r.totalScore.toFixed(1)}</td>
              <td className="px-4 py-3 text-right font-mono text-sky-300 text-xs">
                {r.bestTime != null ? fmtTime(r.bestTime) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function ResultsBoardClient({ slug }: { slug: string }) {
  const [passcode, setPasscode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<BoardData | null>(null);
  const [activeComp, setActiveComp] = useState("");
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [spotlight, setSpotlight] = useState<RankEntry | null>(null);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selectedTargetGroup, setSelectedTargetGroup] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"national" | "state">("national");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [showStateModal, setShowStateModal] = useState(false);
  const [scale, setScale] = useState(1);
  const [showScalePanel, setShowScalePanel] = useState(false);
  const scalePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showScalePanel) return;
    function handleClick(e: MouseEvent) {
      if (scalePanelRef.current && !scalePanelRef.current.contains(e.target as Node)) {
        setShowScalePanel(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showScalePanel]);
  const openSpotlight = useCallback((e: RankEntry) => setSpotlight(e), []);


  // Try public access first (no passcode), or restore stored passcode
  useEffect(() => {
    const stored = sessionStorage.getItem(`results_pc_${slug}`);

    fetch(`/api/results/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: stored ?? "" }),
    })
      .then(r => r.json())
      .then(j => {
        if (j.error === "PASSCODE_REQUIRED") {
          setNeedsPasscode(true);
        } else if (j.error === "INVALID_PASSCODE") {
          sessionStorage.removeItem(`results_pc_${slug}`);
          setNeedsPasscode(true);
          setError("Passcode salah. Cuba semula.");
        } else if (!j.error) {
          setData(j);
          setActiveComp(j.competitions[0]?.id ?? "");
          if (stored) sessionStorage.setItem(`results_pc_${slug}`, stored);
        } else if (j.error === "ENDPOINT_CLOSED") {
          setError("Paparan keputusan ini telah ditutup.");
        } else {
          setError(j.error ?? "Ralat tidak diketahui.");
        }
      })
      .catch(() => { if (!stored) setNeedsPasscode(true); })
      .finally(() => setRestoring(false));
  }, [slug]);

  async function handleVerify() {
    if (!passcode.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/results/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim().toUpperCase() }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.error === "INVALID_PASSCODE") { setError("Passcode salah. Cuba semula."); return; }
        if (j.error === "ENDPOINT_CLOSED") { setError("Paparan keputusan ini telah ditutup."); return; }
        if (j.error === "NOT_FOUND")      { setError("Paparan keputusan tidak dijumpai."); return; }
        setError(j.error ?? "Ralat tidak diketahui."); return;
      }
      sessionStorage.setItem(`results_pc_${slug}`, passcode.trim().toUpperCase());
      setData(j);
      setActiveComp(j.competitions[0]?.id ?? "");
    } finally { setLoading(false); }
  }

  // ── Loading ──
  if (restoring) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-white/30" />
      </div>
    );
  }

  // ── Passcode screen ──
  if (needsPasscode && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-rose-500/20 border border-rose-400/20 flex items-center justify-center">
              <Trophy className="h-10 w-10 text-rose-400" />
            </div>
            <h1 className="text-2xl font-black text-white">Keputusan</h1>
            <p className="text-sm text-white/50">Masukkan passcode untuk melihat keputusan.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 backdrop-blur-sm">
            <div className="relative">
              <Input value={passcode} onChange={e => setPasscode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleVerify()}
                type={showPass ? "text" : "password"}
                placeholder="Passcode" maxLength={6}
                className="text-center tracking-[0.3em] font-mono text-lg h-12 pr-10 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                autoComplete="off" />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-3.5 text-white/40">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-400 text-center flex items-center justify-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />{error}
              </p>
            )}
            <Button onClick={handleVerify} disabled={loading || passcode.length < 6}
              className="w-full h-11 bg-rose-600 hover:bg-rose-500 text-white font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Masuk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error screen ──
  if (error && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <p className="text-white/50 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const isWalkIn = data.endpoint.isWalkIn ?? false;
  const activeResult = data.competitions.find(c => c.id === activeComp) ?? data.competitions[0];

  // Unique states present in this competition's rankings
  const availableStates = activeResult
    ? Array.from(
        new Map(
          activeResult.rankings
            .filter(r => r.stateId && r.stateName)
            .map(r => [r.stateId!, r.stateName!])
        ).entries()
      ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // Rankings after applying view filter, re-ranked from 1 within the filtered set
  const filteredRankings: RankEntry[] = (() => {
    if (!activeResult) return [];
    if (viewMode === "national") return activeResult.rankings;
    const stateId = selectedState ?? availableStates[0]?.id ?? null;
    if (!stateId) return activeResult.rankings;
    return activeResult.rankings
      .filter(r => r.stateId === stateId)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  })();

  return (
    <div className={cn("min-h-screen text-white", isWalkIn ? "bg-gradient-to-br from-purple-950 via-violet-900 to-indigo-950" : "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950")}>
      <SparkleCanvas />

      {/* Header */}
      <div className="relative border-b border-white/10 backdrop-blur-sm bg-black/20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/20 flex items-center justify-center shrink-0">
            <Trophy className="h-5 w-5 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-lg leading-tight truncate">{data.event.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {data.endpoint.label && (
                <span className="text-xs font-semibold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full">
                  {data.endpoint.label}
                </span>
              )}
              <span className="text-[10px] text-white/30 font-mono">{data.event.scope}</span>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-amber-300">
            <Star className="h-4 w-4 fill-amber-300" />
            <span className="text-xs font-bold">KEPUTUSAN RASMI</span>
          </div>
        </div>
      </div>

      {/* Competition name / picker trigger */}
      {activeResult && (
        <div className="max-w-4xl mx-auto px-6 pt-8 pb-4 text-center">
          {data.competitions.length > 1 ? (
            <button
              onClick={() => setShowCompModal(true)}
              className="group inline-flex flex-col items-center gap-1 cursor-pointer"
            >
              <p className="text-xs font-semibold text-white/30 uppercase tracking-[0.2em]">{activeResult.code}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <h2 className="text-2xl font-black text-white group-hover:text-white/80 transition-colors">{activeResult.name}</h2>
                <ChevronDown className="h-5 w-5 text-white/40 group-hover:text-white/60 transition-colors mt-0.5" />
              </div>
            </button>
          ) : (
            <>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-[0.2em] mb-1">{activeResult.code}</p>
              <h2 className="text-2xl font-black text-white">{activeResult.name}</h2>
            </>
          )}
        </div>
      )}

      {/* Competition picker modal */}
      {showCompModal && (() => {
        // All unique target groups across all competitions, sorted by code
        const allTGs = Array.from(
          new Map(
            data.competitions.flatMap(c => c.targetGroups).map(tg => [tg.code, tg])
          ).values()
        ).sort((a, b) => a.code.localeCompare(b.code));

        // Competitions filtered by selected target group, sorted by code
        const visibleComps = data.competitions
          .filter(c => !selectedTargetGroup || c.targetGroups.some(tg => tg.code === selectedTargetGroup))
          .sort((a, b) => a.code.localeCompare(b.code));

        return (
          <div
            className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowCompModal(false)}
          >
            <div
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
                <p className="text-sm font-bold text-white/60 uppercase tracking-widest">Pilih Pertandingan</p>
                <button onClick={() => setShowCompModal(false)} className="text-white/30 hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Target group filter chips */}
              {allTGs.length > 0 && (
                <div className="px-4 py-3 flex gap-2 flex-wrap border-b border-white/5 shrink-0">
                  <button
                    onClick={() => setSelectedTargetGroup(null)}
                    className={cn(
                      "text-[10px] font-bold px-3 py-1 rounded-full border transition-colors",
                      !selectedTargetGroup
                        ? "bg-rose-500/30 border-rose-400/40 text-rose-300"
                        : "border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5"
                    )}
                  >
                    Semua
                  </button>
                  {allTGs.map(tg => (
                    <button
                      key={tg.code}
                      onClick={() => setSelectedTargetGroup(tg.code === selectedTargetGroup ? null : tg.code)}
                      className={cn(
                        "text-[10px] font-bold px-3 py-1 rounded-full border transition-colors",
                        selectedTargetGroup === tg.code
                          ? "bg-rose-500/30 border-rose-400/40 text-rose-300"
                          : "border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5"
                      )}
                    >
                      {tg.code} — {tg.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Competition list */}
              <div className="divide-y divide-white/5 overflow-y-auto">
                {visibleComps.map(c => (
                  <button
                    key={c.id}
                    className={cn(
                      "w-full text-left px-5 py-4 flex items-center gap-4 transition-colors",
                      c.id === activeComp ? "bg-rose-600/20 hover:bg-rose-600/30" : "hover:bg-white/5"
                    )}
                    onClick={() => { setActiveComp(c.id); setShowCompModal(false); }}
                  >
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded font-mono border shrink-0",
                      c.id === activeComp
                        ? "text-rose-300 border-rose-400/30 bg-rose-500/20"
                        : "text-white/40 border-white/10 bg-white/5"
                    )}>{c.code}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-semibold truncate", c.id === activeComp ? "text-white" : "text-white/60")}>
                        {c.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-white/30">{c.rankings.length} pasukan</p>
                        {c.targetGroups.map(tg => (
                          <span key={tg.code} className="text-[9px] text-white/25 border border-white/10 px-1.5 py-px rounded font-mono">{tg.code}</span>
                        ))}
                      </div>
                    </div>
                    {c.id === activeComp && <div className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />}
                  </button>
                ))}
                {visibleComps.length === 0 && (
                  <p className="px-5 py-8 text-center text-white/30 text-sm">Tiada pertandingan.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* National / State toggle */}
      {activeResult && availableStates.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 pb-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setViewMode("national")}
            className={cn(
              "px-5 py-1.5 rounded-full text-xs font-bold transition-all",
              viewMode === "national"
                ? "bg-amber-500 text-black shadow-lg"
                : "text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10"
            )}
          >
            Kebangsaan
          </button>
          <button
            onClick={() => { setViewMode("state"); setShowStateModal(true); }}
            className={cn(
              "px-5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
              viewMode === "state"
                ? "bg-sky-500 text-white shadow-lg"
                : "text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10"
            )}
          >
            Negeri
            {viewMode === "state" && (
              <span className="font-normal opacity-80">
                — {selectedState
                  ? availableStates.find(s => s.id === selectedState)?.name
                  : availableStates[0]?.name}
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </div>
      )}

      {/* State picker modal */}
      {showStateModal && (
        <div
          className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setShowStateModal(false)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <p className="text-sm font-bold text-white/60 uppercase tracking-widest">Pilih Negeri</p>
              <button onClick={() => setShowStateModal(false)} className="text-white/30 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
              {availableStates.map(s => {
                const active = (selectedState ?? availableStates[0]?.id) === s.id;
                return (
                  <button
                    key={s.id}
                    className={cn(
                      "w-full text-left px-5 py-4 flex items-center gap-4 transition-colors",
                      active ? "bg-sky-600/20 hover:bg-sky-600/30" : "hover:bg-white/5"
                    )}
                    onClick={() => { setSelectedState(s.id); setViewMode("state"); setShowStateModal(false); }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-semibold truncate", active ? "text-white" : "text-white/60")}>{s.name}</p>
                      <p className="text-xs text-white/30 mt-0.5">
                        {activeResult?.rankings.filter(r => r.stateId === s.id).length} pasukan
                      </p>
                    </div>
                    {active && <div className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!activeResult || filteredRankings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-white/30">
          <Trophy className="h-12 w-12" />
          <p className="text-sm">Tiada keputusan direkodkan lagi.</p>
        </div>
      ) : (
        <div className={spotlight ? "hidden" : "max-w-4xl mx-auto pb-12"}>
          {/* Top 3 podium */}
          {filteredRankings.length >= 2 && (
            <Podium rankings={filteredRankings} onSelect={openSpotlight} />
          )}

          {/* Rank 1 only */}
          {filteredRankings.length === 1 && (
            <div
              className="flex flex-col items-center gap-4 py-8 cursor-pointer group"
              onClick={() => openSpotlight(filteredRankings[0])}
            >
              <ContingentLogo logo={filteredRankings[0].contingentLogo} name={filteredRankings[0].contingentName} size="xl" />
              <div className="text-center transition-transform group-hover:scale-105 duration-200">
                <p className="text-4xl font-black">{filteredRankings[0].teamName}</p>
                <p className="text-white/60 mt-1">{filteredRankings[0].contingentName}</p>
              </div>
            </div>
          )}

          {/* Rest of rankings */}
          <RankingsTable rankings={filteredRankings} onSelect={openSpotlight} />
        </div>
      )}

      {/* Team spotlight overlay */}
      {spotlight && (
        <TeamSpotlight
          entry={spotlight}
          eventName={data.event.name}
          competitionCode={activeResult?.code}
          competitionName={activeResult?.name}
          onClose={() => setSpotlight(null)}
          isWalkIn={isWalkIn}
          scale={scale}
        />
      )}

      {/* Scale FAB */}
      <div ref={scalePanelRef} className="fixed bottom-6 left-6 z-[150] flex flex-col items-start gap-2">
        {showScalePanel && (
          <div
            className="bg-black/70 backdrop-blur-sm rounded-2xl px-4 py-3 flex flex-col gap-3 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-4">
              <span className="text-white/60 text-xs font-semibold">Saiz</span>
              <span className="text-white text-xs font-mono">{Math.round(scale * 100)}%</span>
              {scale !== 1 && (
                <button onClick={() => setScale(1)} className="text-white/40 hover:text-white text-[10px]">
                  Set semula
                </button>
              )}
            </div>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              className="w-36 accent-violet-400"
            />
          </div>
        )}
        <button
          onClick={() => setShowScalePanel(v => !v)}
          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm text-white/50 hover:text-white flex items-center justify-center shadow-lg transition-colors"
          title="Laraskan saiz"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
