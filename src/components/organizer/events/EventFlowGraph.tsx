"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Loader2, Users, UserCheck, ArrowRight, Calendar, MapPin } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type GraphNode = {
  id: string;
  name: string;
  slug: string;
  scope: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  locationName: string | null;
  totalTeams: number;
  totalParticipants: number;
  selectedTeams: number;
  selectedParticipants: number;
  prerequisiteIds: string[];
  successorIds: string[];
};

type GraphEdge = {
  from: string;
  to: string;
  selectedTeams: number;
  transferredTeams: number;
  transferredParticipants: number;
};

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type NodePos = {
  x: number;
  y: number;
  w: number;
  h: number;
};

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W    = 268;
const NODE_H    = 158;
const COL_GAP   = 180;
const ROW_GAP   = 28;
const CANVAS_PAD = 60;

// ── Status / scope colours ────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, { border: string; badge: string; dot: string }> = {
  DRAFT:     { border: "border-zinc-300",   badge: "bg-zinc-100 text-zinc-500",      dot: "bg-zinc-400" },
  PUBLISHED: { border: "border-green-300",  badge: "bg-green-50 text-green-700",     dot: "bg-green-500" },
  ACTIVE:    { border: "border-blue-400",   badge: "bg-blue-50 text-blue-700",       dot: "bg-blue-500" },
  COMPLETED: { border: "border-purple-400", badge: "bg-purple-50 text-purple-700",   dot: "bg-purple-500" },
  CANCELLED: { border: "border-red-300",    badge: "bg-red-50 text-red-600",         dot: "bg-red-400" },
  ARCHIVE:   { border: "border-zinc-200",   badge: "bg-zinc-50 text-zinc-400",       dot: "bg-zinc-300" },
};

const SCOPE_LABEL: Record<string, string> = {
  NATIONAL: "Kebangsaan", STATE: "Negeri", ZONE: "Zon", OPEN: "Terbuka",
  ONLINE_NATIONAL: "Online — Keb.", ONLINE_STATE: "Online — Negeri",
  ONLINE_ZONE: "Online — Zon", ONLINE_OPEN: "Online — Terbuka",
};

// ── Topological layout ────────────────────────────────────────────────────────

function computeLayout(nodes: GraphNode[]): Map<string, NodePos> {
  // Kahn's algorithm — assign a column (level) to each node
  const inDeg = new Map<string, number>();
  const adj   = new Map<string, string[]>();
  for (const n of nodes) { inDeg.set(n.id, 0); adj.set(n.id, []); }
  for (const n of nodes) {
    for (const sid of n.successorIds) {
      adj.get(n.id)!.push(sid);
      inDeg.set(sid, (inDeg.get(sid) ?? 0) + 1);
    }
  }

  const level = new Map<string, number>();
  const queue = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of queue) level.set(id, 0);

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    for (const nid of adj.get(id) ?? []) {
      const newLevel = (level.get(id) ?? 0) + 1;
      if (!level.has(nid) || level.get(nid)! < newLevel) {
        level.set(nid, newLevel);
      }
      inDeg.set(nid, (inDeg.get(nid) ?? 1) - 1);
      if (inDeg.get(nid) === 0) queue.push(nid);
    }
  }
  // Fallback: any unleveled node goes to column 0
  for (const n of nodes) { if (!level.has(n.id)) level.set(n.id, 0); }

  // Group nodes by column
  const cols = new Map<number, string[]>();
  for (const [id, col] of level) {
    if (!cols.has(col)) cols.set(col, []);
    cols.get(col)!.push(id);
  }

  // Sort columns
  const sortedCols = [...cols.keys()].sort((a, b) => a - b);

  // Assign x/y positions
  const positions = new Map<string, NodePos>();
  sortedCols.forEach((col, colIdx) => {
    const idsInCol = cols.get(col)!;
    idsInCol.forEach((id, rowIdx) => {
      positions.set(id, {
        x: CANVAS_PAD + colIdx * (NODE_W + COL_GAP),
        y: CANVAS_PAD + rowIdx * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
      });
    });
  });

  return positions;
}

function canvasSize(positions: Map<string, NodePos>) {
  let maxX = 0; let maxY = 0;
  for (const p of positions.values()) {
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return { w: maxX + CANVAS_PAD, h: maxY + CANVAS_PAD };
}

// ── Edge bezier ───────────────────────────────────────────────────────────────

function edgePath(from: NodePos, to: NodePos) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`;
}

function edgeMidPoint(from: NodePos, to: NodePos) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

// ── Node card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node, pos, dragging, onMouseDown,
}: {
  node: GraphNode;
  pos: NodePos;
  dragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const colours = STATUS_COLOURS[node.status] ?? STATUS_COLOURS.DRAFT;
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" }) : null;
  const start = fmtDate(node.startDate);
  const end   = fmtDate(node.endDate);
  const transferRate = node.selectedTeams > 0
    ? Math.round((node.selectedTeams / Math.max(node.totalTeams, 1)) * 100)
    : null;

  return (
    <div
      onMouseDown={onMouseDown}
      style={{ left: pos.x, top: pos.y, width: pos.w, cursor: dragging ? "grabbing" : "grab", zIndex: dragging ? 10 : 1 }}
      className={`absolute select-none rounded-xl border-2 bg-white shadow-md ${colours.border} overflow-hidden`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-100">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[11px] font-bold text-zinc-800 leading-tight line-clamp-2">{node.name}</p>
          <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${colours.badge}`}>
            {node.status}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[9px] text-zinc-400 font-mono">{SCOPE_LABEL[node.scope] ?? node.scope}</span>
          {node.locationName && (
            <>
              <span className="text-zinc-300">·</span>
              <MapPin className="h-2.5 w-2.5 text-zinc-400 shrink-0" />
              <span className="text-[9px] text-zinc-400 truncate">{node.locationName}</span>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Date */}
        {start && (
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Calendar className="h-3 w-3 shrink-0 text-zinc-400" />
            <span>{start}{end && end !== start ? ` — ${end}` : ""}</span>
          </div>
        )}

        {/* Teams + Participants */}
        <div className="grid grid-cols-2 gap-1">
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 text-center">
            <p className="text-[9px] text-zinc-400 uppercase font-semibold">Pasukan</p>
            <p className="text-sm font-bold text-zinc-800">{node.totalTeams.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 text-center">
            <p className="text-[9px] text-zinc-400 uppercase font-semibold">Peserta</p>
            <p className="text-sm font-bold text-zinc-800">{node.totalParticipants.toLocaleString()}</p>
          </div>
        </div>

        {/* Selected / transfer */}
        {node.selectedTeams > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-100 px-2 py-1">
            <UserCheck className="h-3 w-3 text-green-600 shrink-0" />
            <span className="text-[10px] text-green-700 font-medium">
              {node.selectedTeams} dipilih
              {transferRate !== null && <span className="text-green-500 font-normal"> ({transferRate}%)</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function EventFlowGraph({ onClose }: { onClose: () => void }) {
  const [data, setData]       = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map());
  const [canvas, setCanvas]   = useState({ w: 800, h: 600 });
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // dragState holds coordinates — only read in event handlers, never during render
  const dragState = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  // draggingId is state so NodeCard can re-render with the right cursor
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Fetch
  useEffect(() => {
    fetch("/api/v2/organizer/events/flow-graph")
      .then((r) => r.json())
      .then((d: GraphData) => {
        setData(d);
        const pos = computeLayout(d.nodes);
        setPositions(pos);
        setCanvas(canvasSize(pos));
      })
      .catch(() => setError("Gagal memuatkan data graf."))
      .finally(() => setLoading(false));
  }, []);

  // Drag handlers
  const onMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const pos = positions.get(id);
    if (!pos) return;
    dragState.current = { id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    setDraggingId(id);
  }, [positions]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragState.current) return;
      const { id, startX, startY, origX, origY } = dragState.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newPos = { ...positions.get(id)!, x: origX + dx, y: origY + dy };
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(id, newPos);
        return next;
      });
      setCanvas(canvasSize(new Map([...positions, [id, newPos]])));
    }
    function onMouseUp() { dragState.current = null; setDraggingId(null); }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [positions]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div>
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">Graf Aliran Acara</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {data ? `${data.nodes.length} acara · ${data.edges.length} hubungan prasyarat` : "Memuatkan…"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0 flex-wrap">
        {Object.entries(STATUS_COLOURS).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
            <span className="text-[10px] text-zinc-500 uppercase font-medium">{s}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-400">
          <ArrowRight className="h-3 w-3" />
          <span>Arah pindahan peserta</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{
          backgroundImage: "radial-gradient(circle, #d4d4d8 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundColor: "#fafafa",
        }}
      >
        {loading && (
          <div className="flex items-center justify-center h-full gap-2 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Memuatkan graf…
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full text-sm text-red-500">{error}</div>
        )}
        {data && !loading && (
          <div style={{ position: "relative", width: canvas.w, height: canvas.h, minWidth: "100%", minHeight: "100%" }}>
            {/* SVG edges layer */}
            <svg
              style={{ position: "absolute", top: 0, left: 0, width: canvas.w, height: canvas.h, pointerEvents: "none", zIndex: 2 }}
            >
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
                </marker>
                <marker id="arrow-hover" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#4338ca" />
                </marker>
              </defs>

              {data.edges.map((edge) => {
                const fromPos = positions.get(edge.from);
                const toPos   = positions.get(edge.to);
                if (!fromPos || !toPos) return null;
                const edgeId  = `${edge.from}→${edge.to}`;
                const isHover = hoveredEdge === edgeId;
                const mid     = edgeMidPoint(fromPos, toPos);
                const pct     = edge.selectedTeams > 0
                  ? Math.round((edge.transferredTeams / edge.selectedTeams) * 100)
                  : 0;

                return (
                  <g key={edgeId} style={{ pointerEvents: "all" }}
                    onMouseEnter={() => setHoveredEdge(edgeId)}
                    onMouseLeave={() => setHoveredEdge(null)}
                  >
                    {/* Hit area (wider invisible stroke) */}
                    <path
                      d={edgePath(fromPos, toPos)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                    />
                    {/* Visible edge */}
                    <path
                      d={edgePath(fromPos, toPos)}
                      fill="none"
                      stroke={isHover ? "#4338ca" : "#6366f1"}
                      strokeWidth={isHover ? 2.5 : 1.5}
                      strokeDasharray={edge.transferredTeams === 0 ? "6 4" : undefined}
                      markerEnd={`url(#${isHover ? "arrow-hover" : "arrow"})`}
                      opacity={isHover ? 1 : 0.65}
                    />
                    {/* Edge label */}
                    <g transform={`translate(${mid.x}, ${mid.y})`}>
                      <rect
                        x={-60} y={-26} width={120} height={isHover ? 50 : 34}
                        rx={6} fill="white"
                        stroke={isHover ? "#6366f1" : "#e4e4e7"}
                        strokeWidth={isHover ? 1.5 : 1}
                      />
                      <text x={0} y={-11} textAnchor="middle" fontSize={9} fontWeight="600" fill="#3f3f46">
                        {edge.transferredTeams}/{edge.selectedTeams} pasukan ({pct}%)
                      </text>
                      <text x={0} y={2} textAnchor="middle" fontSize={9} fill="#6366f1">
                        {edge.transferredParticipants.toLocaleString()} peserta dipindah
                      </text>
                      {isHover && (
                        <text x={0} y={17} textAnchor="middle" fontSize={8} fill="#a1a1aa">
                          {edge.selectedTeams - edge.transferredTeams} belum dipindah
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Node cards layer */}
            {data.nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              return (
                <NodeCard
                  key={node.id}
                  node={node}
                  pos={pos}
                  dragging={draggingId === node.id}
                  onMouseDown={(e) => onMouseDown(node.id, e)}
                />
              );
            })}

            {/* Isolated events note */}
            {data.nodes.filter((n) => n.prerequisiteIds.length === 0 && n.successorIds.length === 0).length > 0 && (
              <div
                style={{ position: "absolute", top: CANVAS_PAD - 22, right: CANVAS_PAD }}
                className="text-[10px] text-zinc-400 italic"
              >
                Acara tanpa prasyarat ditunjukkan secara berasingan
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer summary */}
      {data && (
        <div className="flex items-center gap-6 px-5 py-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0 text-xs text-zinc-500 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-zinc-400" />
            <span>Jumlah pasukan berdaftar: <strong className="text-zinc-700">{data.nodes.reduce((s, n) => s + n.totalTeams, 0).toLocaleString()}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 text-zinc-400" />
            <span>Jumlah pindahan merentasi acara: <strong className="text-zinc-700">{data.edges.reduce((s, e) => s + e.transferredTeams, 0).toLocaleString()} pasukan · {data.edges.reduce((s, e) => s + e.transferredParticipants, 0).toLocaleString()} peserta</strong></span>
          </div>
          <span className="ml-auto text-zinc-400 italic">Tahan dan seret untuk mengalihkan nod · Hover tepi untuk butiran</span>
        </div>
      )}
    </div>
  );
}
