"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, ClipboardList, Users, BarChart3, Gavel, Trophy, UserPlus, ClipboardCheck,
  LayoutDashboard, Scale, Award,
} from "lucide-react";
import type { OrganizerRole } from "@/types";

const ONLINE_SCOPES = ["ONLINE_NATIONAL", "ONLINE_STATE", "ONLINE_ZONE", "ONLINE_OPEN"];

// Canvas geometry
const CARD_W   = 260;
const CARD_H   = 200; // generous estimate — only used for canvas height, not positioning
const COL      = [0, 320, 640] as const;
const ROW      = [0, 260, 520] as const; // extra row gap so diagonal arcs clear card bottoms
const CANVAS_W = COL[2] + CARD_W; // 900

type EventSummary = {
  id: string; name: string; slug: string; scope: string; status: string;
  startDate: Date | null; endDate: Date | null;
};

type Module = {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  href?: string;
  pos: { x: number; y: number };
};

type EdgeDef    = { from: string; to: string; color: string; dashed?: boolean; arcDir?: 1 | -1 };
type ArrowEntry = { d: string; color: string; dashed?: boolean; id: string };

// ─── Main flow ───────────────────────────────────────────────────────────────
//  Row 0: Pra-Pendaftaran  | Pendaftaran Disahkan | Log Kehadiran
//  Row 1: Laporan          | Dashboard Kehadiran  | Penghakiman   ← col-2 vertical spine
//  Row 2:                  |                      | Keputusan
const MAIN_MODULES: Module[] = [
  {
    icon: ClipboardList,
    title: "Pra-Pendaftaran",
    description: "Urus penyertaan dan pengesahan peserta sebelum acara bermula.",
    color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100",
    href: "preregistration",
    pos: { x: COL[0], y: ROW[0] },
  },
  {
    icon: ClipboardCheck,
    title: "Pendaftaran Telah Disahkan",
    description: "Senarai pasukan status ACCEPT beserta status kehadiran mereka.",
    color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-100",
    href: "attendance/confirmed",
    pos: { x: COL[1], y: ROW[0] },
  },
  {
    icon: Users,
    title: "Log Kehadiran Peserta",
    description: "Rekod kehadiran peserta semasa hari acara berlangsung.",
    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100",
    href: "attendance",
    pos: { x: COL[2], y: ROW[0] },
  },
  {
    icon: BarChart3,
    title: "Laporan",
    description: "Jana laporan statistik penyertaan dan prestasi peserta.",
    color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100",
    href: "reports",
    pos: { x: COL[0], y: ROW[1] },
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard Kehadiran",
    description: "Paparan statistik kehadiran peserta secara langsung.",
    color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-100",
    href: "attendance/dashboard",
    pos: { x: COL[1], y: ROW[1] },
  },
  {
    icon: Gavel,
    title: "Penghakiman",
    description: "Uruskan panel hakim, kriteria penilaian, dan markah.",
    color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100",
    href: "judging",
    pos: { x: COL[2], y: ROW[1] },
  },
  {
    icon: Trophy,
    title: "Keputusan",
    description: "Papar dan umumkan keputusan rasmi pertandingan.",
    color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-100",
    href: "results",
    pos: { x: COL[2], y: ROW[2] },
  },
];

const MAIN_CONNECTIONS: EdgeDef[] = [
  // Row-0 horizontal chain
  { from: "preregistration",      to: "attendance/confirmed", color: "#3b82f6" },
  { from: "attendance/confirmed", to: "attendance",           color: "#3b82f6" },
  // Col-2 vertical spine
  { from: "attendance",           to: "judging",              color: "#3b82f6" },
  { from: "judging",              to: "results",              color: "#3b82f6" },
  // Branch: Log → Dashboard (diagonal left-down)
  { from: "attendance",           to: "attendance/dashboard", color: "#0d9488" },
  // Feedback: Laporan → Pre-reg (dashed, same col up)
  { from: "reports",              to: "preregistration",      color: "#8b5cf6", dashed: true },
];

// ─── Walk-in section ─────────────────────────────────────────────────────────
//  Row 0: Walk-in → Penghakiman Walk-in → Keputusan Walk-in
const WALKIN_MODULES: Module[] = [
  {
    icon: UserPlus,
    title: "Walk-in Registration",
    description: "Daftar peserta walk-in di kaunter & sahkan kehadiran melalui QR kod.",
    color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100",
    href: "walkin",
    pos: { x: COL[0], y: 0 },
  },
  {
    icon: Scale,
    title: "Penghakiman Walk-in",
    description: "Uruskan penilaian khusus untuk peserta walk-in.",
    color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100",
    href: "walkin/judging",
    pos: { x: COL[1], y: 0 },
  },
  {
    icon: Award,
    title: "Keputusan Walk-in",
    description: "Keputusan dan pemenang daripada penyertaan walk-in.",
    color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-100",
    href: "walkin/results",
    pos: { x: COL[2], y: 0 },
  },
];

const WALKIN_CONNECTIONS: EdgeDef[] = [
  { from: "walkin",         to: "walkin/judging", color: "#f59e0b" },
  { from: "walkin/judging", to: "walkin/results", color: "#f59e0b" },
];

const LEGEND = [
  { color: "#3b82f6", label: "Aliran utama",        dashed: false },
  { color: "#0d9488", label: "Dashboard kehadiran", dashed: false },
  { color: "#8b5cf6", label: "Laporan",             dashed: true  },
  { color: "#f59e0b", label: "Aliran walk-in",      dashed: false },
];

const STATUS_STYLES: Record<string, string> = {
  DRAFT:     "bg-zinc-100 text-zinc-600",
  PUBLISHED: "bg-blue-50 text-blue-700",
  ACTIVE:    "bg-green-50 text-green-700",
  COMPLETED: "bg-purple-50 text-purple-700",
  CANCELLED: "bg-red-50 text-red-500",
  ARCHIVE:   "bg-zinc-100 text-zinc-400",
};

function fmtDate(d: Date | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

function buildPath(
  fromEl: Element,
  toEl: Element,
  containerRect: DOMRect,
  arcDir?: 1 | -1,
): string {
  function rel(el: Element) {
    const r = el.getBoundingClientRect();
    return {
      l:  r.left   - containerRect.left,
      r:  r.right  - containerRect.left,
      t:  r.top    - containerRect.top,
      b:  r.bottom - containerRect.top,
      cx: r.left   - containerRect.left + r.width  / 2,
      cy: r.top    - containerRect.top  + r.height / 2,
    };
  }

  const f = rel(fromEl);
  const t = rel(toEl);

  const THRESHOLD = 50;
  const goingLeft  = t.cx < f.cx - THRESHOLD;
  const goingRight = t.cx > f.cx + THRESHOLD;
  const goingDown  = t.cy > f.cy + THRESHOLD;
  const goingUp    = t.cy < f.cy - THRESHOLD;

  let x1: number, y1: number, x2: number, y2: number;

  if (goingLeft && goingDown) {
    x1 = f.cx; y1 = f.b; x2 = t.cx; y2 = t.t;
  } else if (goingRight && goingUp) {
    x1 = f.r; y1 = f.cy; x2 = t.l; y2 = t.cy;
  } else {
    const candidates = [
      { x1: f.r,  y1: f.cy, x2: t.l,  y2: t.cy, d: Math.hypot(f.r  - t.l,  f.cy - t.cy) },
      { x1: f.l,  y1: f.cy, x2: t.r,  y2: t.cy, d: Math.hypot(f.l  - t.r,  f.cy - t.cy) },
      { x1: f.cx, y1: f.b,  x2: t.cx, y2: t.t,  d: Math.hypot(f.cx - t.cx, f.b  - t.t ) },
      { x1: f.cx, y1: f.t,  x2: t.cx, y2: t.b,  d: Math.hypot(f.cx - t.cx, f.t  - t.b ) },
    ];
    ({ x1, y1, x2, y2 } = candidates.reduce((a, b) => (a.d < b.d ? a : b)));
  }

  if (arcDir !== undefined) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * 50 * arcDir;
    const py = (dx  / len) * 50 * arcDir;
    return `M ${x1} ${y1} Q ${mx + px} ${my + py}, ${x2} ${y2}`;
  }

  const EPS = 4;
  if (Math.abs(y2 - y1) < EPS) return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (Math.abs(x2 - x1) < EPS) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function ArrowSvg({ arrows, height, colors }: { arrows: ArrowEntry[]; height: number; colors: string[] }) {
  if (height === 0) return null;
  return (
    <svg
      aria-hidden
      width={CANVAS_W}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: "visible" }}
    >
      <defs>
        {colors.map(c => {
          const cid = c.replace("#", "");
          return (
            <g key={cid}>
              {/* arrowhead at end */}
              <marker id={`ah-${cid}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={c} fillOpacity="0.9" />
              </marker>
              {/* filled circle at start */}
              <marker id={`dot-${cid}`} markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                <circle cx="5" cy="5" r="4.5" fill={c} fillOpacity="0.9" />
              </marker>
            </g>
          );
        })}
      </defs>
      {arrows.map(a => {
        const cid = a.color.replace("#", "");
        return (
          <path
            key={a.id}
            d={a.d}
            stroke={a.color}
            strokeWidth="2"
            strokeOpacity="0.7"
            strokeDasharray={a.dashed ? "5 3" : undefined}
            fill="none"
            markerStart={`url(#dot-${cid})`}
            markerEnd={`url(#ah-${cid})`}
          />
        );
      })}
    </svg>
  );
}

function ModuleCard({ mod, eventSlug }: { mod: Module; eventSlug: string }) {
  const Icon = mod.icon;
  const posStyle = {
    position: "absolute" as const,
    left: mod.pos.x,
    top:  mod.pos.y,
    width: CARD_W,
  };
  const inner = (
    <>
      <div className={`w-10 h-10 rounded-lg ${mod.bg} flex items-center justify-center`}>
        <Icon className={`h-5 w-5 ${mod.color}`} />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-zinc-800">{mod.title}</h3>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{mod.description}</p>
      </div>
      <div className="absolute top-3 right-3">
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
          mod.href ? "bg-blue-100 text-blue-600" : "bg-zinc-100 text-zinc-400"
        }`}>
          {mod.href ? "Buka" : "Akan Datang"}
        </span>
      </div>
    </>
  );
  return mod.href ? (
    <Link
      href={`/organizer/events/${eventSlug}/manage/${mod.href}`}
      data-module={mod.href}
      style={posStyle}
      className={`relative rounded-xl border ${mod.border} bg-white p-5 flex flex-col gap-3 hover:shadow-md transition-shadow`}
    >
      {inner}
    </Link>
  ) : (
    <div
      data-module={mod.href}
      style={posStyle}
      className={`relative rounded-xl border ${mod.border} bg-white p-5 flex flex-col gap-3 opacity-75`}
    >
      {inner}
    </div>
  );
}

function useArrows(connections: EdgeDef[]) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<ArrowEntry[]>([]);
  const [svgH, setSvgH] = useState(0);

  const draw = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cr = wrap.getBoundingClientRect();
    setSvgH(cr.height);
    const next: ArrowEntry[] = [];
    for (const conn of connections) {
      const fromEl = wrap.querySelector(`[data-module="${conn.from}"]`);
      const toEl   = wrap.querySelector(`[data-module="${conn.to}"]`);
      if (!fromEl || !toEl) continue;
      next.push({
        d: buildPath(fromEl, toEl, cr, conn.arcDir),
        color: conn.color,
        dashed: conn.dashed,
        id: `${conn.from}--${conn.to}`,
      });
    }
    setArrows(next);
  }, [connections]);

  useEffect(() => {
    const t = setTimeout(draw, 50);
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [draw]);

  return { wrapRef, arrows, svgH };
}

export function EventManageClient({
  event,
}: {
  event: EventSummary;
  role: OrganizerRole;
}) {
  const start = fmtDate(event.startDate);
  const end   = fmtDate(event.endDate);
  const isOnline = ONLINE_SCOPES.includes(event.scope);

  const mainModules = MAIN_MODULES.filter(m =>
    !(isOnline && (
      m.href === "attendance" ||
      m.href === "attendance/confirmed" ||
      m.href === "attendance/dashboard"
    )),
  );

  const mainColors   = [...new Set(MAIN_CONNECTIONS.map(c => c.color))];
  const walkinColors = [...new Set(WALKIN_CONNECTIONS.map(c => c.color))];

  const main   = useArrows(MAIN_CONNECTIONS);
  const walkin = useArrows(WALKIN_CONNECTIONS);

  const mainH   = ROW[2] + CARD_H + 24;
  const walkinH = CARD_H + 24;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/organizer/events"
          className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-900 truncate">{event.name}</h1>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[event.status] ?? "bg-zinc-100 text-zinc-500"}`}>
              {event.status}
            </span>
          </div>
          {(start || end) && (
            <p className="text-sm text-zinc-400 mt-0.5">
              {start && end ? `${start} – ${end}` : start ?? end}
            </p>
          )}
        </div>
      </div>

      {/* ── Main flow ── */}
      <div className="overflow-x-auto">
        <div
          ref={main.wrapRef}
          style={{ position: "relative", width: CANVAS_W, height: mainH }}
        >
          <ArrowSvg arrows={main.arrows} height={main.svgH} colors={mainColors} />
          {mainModules.map(mod => (
            <ModuleCard key={mod.title} mod={mod} eventSlug={event.slug} />
          ))}
        </div>
      </div>

      {/* ── Walk-in section ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <UserPlus className="h-3.5 w-3.5" /> Walk-in
          </span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>
        <div className="overflow-x-auto">
          <div
            ref={walkin.wrapRef}
            style={{ position: "relative", width: CANVAS_W, height: walkinH }}
          >
            <ArrowSvg arrows={walkin.arrows} height={walkin.svgH} colors={walkinColors} />
            {WALKIN_MODULES.map(mod => (
              <ModuleCard key={mod.title} mod={mod} eventSlug={event.slug} />
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-2 text-xs text-zinc-500">
            <svg width="28" height="10" aria-hidden>
              <line x1="0" y1="5" x2="21" y2="5"
                stroke={l.color} strokeWidth="2"
                strokeDasharray={l.dashed ? "4 2" : undefined} />
              <polygon points="18,2 18,8 28,5" fill={l.color} />
            </svg>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
