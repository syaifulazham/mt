"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Loader2, Network } from "lucide-react";

// ── Layout constants (must match rendered card CSS) ───────────────────────────
const CARD_W       = 248;
const HEADER_H     = 76;   // fixed CSS height on card header
const MEMBER_ROW_H = 26;
const CARD_PAD_B   = 14;
const CANVAS_PAD   = 64;
const H_GAP        = 120;
const V_GAP        = 80;
const COLS         = 3;

// ── Types ─────────────────────────────────────────────────────────────────────
type GraphTeam = {
  id: string;
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  members: { id: string; name: string }[];
};

type SharedMember = {
  memberId: string;
  memberName: string;
  teamIds: string[];
};

type GraphData = {
  teams: GraphTeam[];
  sharedMembers: SharedMember[];
};

type Pos = { x: number; y: number };

// ── Helpers ───────────────────────────────────────────────────────────────────
function cardHeight(team: GraphTeam) {
  return HEADER_H + team.members.length * MEMBER_ROW_H + CARD_PAD_B;
}

function memberCenterY(idx: number) {
  return HEADER_H + idx * MEMBER_ROW_H + MEMBER_ROW_H / 2;
}

function memberColor(i: number) {
  const hue = (i * 137.5) % 360;
  return `hsl(${hue}, 60%, 42%)`;
}

function computeInitialPositions(teams: GraphTeam[]): Record<string, Pos> {
  const cols = Math.min(COLS, teams.length);
  const rowCount = Math.ceil(teams.length / cols);

  // row heights: max card height in each row
  const rowH: number[] = Array.from({ length: rowCount }, (_, r) => {
    let max = 0;
    for (let c = 0; c < cols; c++) {
      const t = teams[r * cols + c];
      if (t) max = Math.max(max, cardHeight(t));
    }
    return max;
  });

  const positions: Record<string, Pos> = {};
  let cumY = CANVAS_PAD;
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < cols; c++) {
      const t = teams[r * cols + c];
      if (!t) break;
      positions[t.id] = { x: CANVAS_PAD + c * (CARD_W + H_GAP), y: cumY };
    }
    cumY += rowH[r] + V_GAP;
  }
  return positions;
}

function canvasSize(teams: GraphTeam[], pos: Record<string, Pos>) {
  let w = 0, h = 0;
  for (const t of teams) {
    const p = pos[t.id];
    if (!p) continue;
    w = Math.max(w, p.x + CARD_W + CANVAS_PAD);
    h = Math.max(h, p.y + cardHeight(t) + CANVAS_PAD);
  }
  return { w: Math.max(w, 400), h: Math.max(h, 300) };
}

// ── Edge computation ─────────────────────────────────────────────────────────
type Edge = {
  key: string;
  memberId: string;
  color: string;
  d: string;
  fromX: number; fromY: number;
  toX: number;   toY: number;
};

function buildEdges(
  sharedMembers: SharedMember[],
  teams: GraphTeam[],
  positions: Record<string, Pos>,
  colorMap: Record<string, string>,
): Edge[] {
  const teamById = new Map(teams.map(t => [t.id, t]));
  const edges: Edge[] = [];

  for (const sm of sharedMembers) {
    const color = colorMap[sm.memberId];
    for (let i = 0; i < sm.teamIds.length; i++) {
      for (let j = i + 1; j < sm.teamIds.length; j++) {
        const tA = teamById.get(sm.teamIds[i]);
        const tB = teamById.get(sm.teamIds[j]);
        if (!tA || !tB) continue;
        const pA = positions[tA.id];
        const pB = positions[tB.id];
        if (!pA || !pB) continue;

        const mIdxA = tA.members.findIndex(m => m.id === sm.memberId);
        const mIdxB = tB.members.findIndex(m => m.id === sm.memberId);
        if (mIdxA < 0 || mIdxB < 0) continue;

        const yA = pA.y + memberCenterY(mIdxA);
        const yB = pB.y + memberCenterY(mIdxB);

        let fromX: number, toX: number, cp1x: number, cp2x: number;

        if (pA.x + CARD_W / 2 < pB.x + CARD_W / 2) {
          // A is left
          fromX = pA.x + CARD_W;
          toX   = pB.x;
          const dx = Math.max(60, (toX - fromX) / 2);
          cp1x = fromX + dx;
          cp2x = toX - dx;
        } else if (pA.x + CARD_W / 2 > pB.x + CARD_W / 2) {
          // A is right
          fromX = pA.x;
          toX   = pB.x + CARD_W;
          const dx = Math.max(60, (fromX - toX) / 2);
          cp1x = fromX - dx;
          cp2x = toX + dx;
        } else {
          // Same column — curve out to the right
          fromX = pA.x + CARD_W;
          toX   = pB.x + CARD_W;
          cp1x  = fromX + 80;
          cp2x  = toX + 80;
        }

        edges.push({
          key: `${sm.memberId}-${tA.id}-${tB.id}`,
          memberId: sm.memberId,
          color,
          d: `M ${fromX} ${yA} C ${cp1x} ${yA} ${cp2x} ${yB} ${toX} ${yB}`,
          fromX, fromY: yA,
          toX,   toY:   yB,
        });
      }
    }
  }
  return edges;
}

// ── Main component ────────────────────────────────────────────────────────────
export function SharedMembersGraph({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const [data,      setData]      = useState<GraphData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [errMsg,    setErrMsg]    = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [dragging,  setDragging]  = useState<{ teamId: string; offX: number; offY: number } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);   // memberId
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/v2/organizer/events/${eventId}/preregistration/shared-members-graph`)
      .then(r => r.json())
      .then((d: GraphData) => { setData(d); setPositions(computeInitialPositions(d.teams)); })
      .catch(() => setErrMsg("Gagal memuatkan data"))
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPositions(prev => ({
      ...prev,
      [dragging.teamId]: {
        x: Math.max(0, e.clientX - rect.left + containerRef.current!.scrollLeft - dragging.offX),
        y: Math.max(0, e.clientY - rect.top  + containerRef.current!.scrollTop  - dragging.offY),
      },
    }));
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  // ── Early returns ───────────────────────────────────────────────────────────
  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl px-8 py-6 flex items-center gap-3 shadow-2xl">
        <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
        <span className="text-sm text-zinc-600">Memuatkan graf perkongsian ahli…</span>
      </div>
    </div>
  );

  if (errMsg) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl p-8 shadow-2xl text-center space-y-4">
        <p className="text-sm text-red-600">{errMsg}</p>
        <button onClick={onClose} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm">Tutup</button>
      </div>
    </div>
  );

  if (!data || data.teams.length === 0) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl p-8 shadow-2xl text-center max-w-sm space-y-3">
        <Network className="h-10 w-10 mx-auto text-zinc-300" />
        <p className="text-sm font-semibold text-zinc-700">Tiada perkongsian ahli ditemui</p>
        <p className="text-xs text-zinc-400">Semua ahli hanya didaftarkan dalam satu pasukan sahaja.</p>
        <button onClick={onClose} className="mt-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm">Tutup</button>
      </div>
    </div>
  );

  // ── Build render data ───────────────────────────────────────────────────────
  const colorMap: Record<string, string> = {};
  data.sharedMembers.forEach((sm, i) => { colorMap[sm.memberId] = memberColor(i); });

  const sharedMemberIds = new Set(data.sharedMembers.map(sm => sm.memberId));
  const edges = buildEdges(data.sharedMembers, data.teams, positions, colorMap);
  const { w: cvW, h: cvH } = canvasSize(data.teams, positions);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-none bg-white border-b border-zinc-200 px-5 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <Network className="h-4 w-4 text-violet-600 flex-none" />
            Graf Perkongsian Ahli Pasukan
          </h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {data.teams.length} pasukan · {data.sharedMembers.length} ahli dikongsi · Seret kad untuk susun semula
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-lg">
          {data.sharedMembers.map((sm, i) => (
            <button
              key={sm.memberId}
              className="flex items-center gap-1.5 text-[11px] rounded px-1.5 py-0.5 transition-colors"
              style={{
                background: highlight === sm.memberId ? `${memberColor(i)}18` : "transparent",
                fontWeight: highlight === sm.memberId ? 600 : 400,
                color: highlight === sm.memberId ? memberColor(i) : "#71717a",
              }}
              onMouseEnter={() => setHighlight(sm.memberId)}
              onMouseLeave={() => setHighlight(null)}
            >
              <span className="inline-block w-2.5 h-2.5 rounded-full flex-none" style={{ background: memberColor(i) }} />
              {sm.memberName}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="flex-none p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto select-none"
        style={{
          background: "#f8f8fb",
          backgroundImage: "radial-gradient(circle, #d4d4d8 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      >
        <div style={{ position: "relative", width: cvW, height: cvH, minWidth: "100%", minHeight: "100%" }}>

          {/* ── SVG edge layer (on top, pointer-events none) ───────────────── */}
          <svg
            width={cvW}
            height={cvH}
            style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
          >
            <defs>
              {data.sharedMembers.map((sm, i) => (
                <marker
                  key={sm.memberId}
                  id={`dot-${sm.memberId}`}
                  markerWidth="6" markerHeight="6"
                  refX="3" refY="3"
                >
                  <circle cx="3" cy="3" r="3" fill={memberColor(i)} />
                </marker>
              ))}
            </defs>

            {edges.map(e => {
              const active = highlight === null || highlight === e.memberId;
              return (
                <g key={e.key} opacity={active ? 1 : 0.12}>
                  <path
                    d={e.d}
                    fill="none"
                    stroke={e.color}
                    strokeWidth={highlight === e.memberId ? 2.5 : 1.8}
                    strokeDasharray={highlight === e.memberId ? "none" : "7 4"}
                    strokeLinecap="round"
                  />
                  {/* Connection dots */}
                  <circle cx={e.fromX} cy={e.fromY} r="4" fill={e.color} />
                  <circle cx={e.toX}   cy={e.toY}   r="4" fill={e.color} />
                </g>
              );
            })}
          </svg>

          {/* ── Team cards ─────────────────────────────────────────────────── */}
          {data.teams.map(team => {
            const pos = positions[team.id];
            if (!pos) return null;
            const isDragged = dragging?.teamId === team.id;

            return (
              <div
                key={team.id}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: CARD_W,
                  zIndex: isDragged ? 10 : 1,
                  cursor: isDragged ? "grabbing" : "grab",
                }}
                onMouseDown={e => {
                  e.preventDefault();
                  if (!containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  setDragging({
                    teamId: team.id,
                    offX: e.clientX - rect.left + containerRef.current.scrollLeft - pos.x,
                    offY: e.clientY - rect.top  + containerRef.current.scrollTop  - pos.y,
                  });
                }}
              >
                <div
                  className="bg-white rounded-xl overflow-hidden shadow-sm"
                  style={{
                    border: isDragged ? "1.5px solid #7c3aed" : "1.5px solid #e4e4e7",
                    boxShadow: isDragged
                      ? "0 8px 24px rgba(124,58,237,0.18)"
                      : "0 1px 6px rgba(0,0,0,0.07)",
                  }}
                >
                  {/* Card header */}
                  <div
                    className="px-3 bg-violet-50 border-b border-violet-100 flex flex-col justify-center"
                    style={{ height: HEADER_H }}
                  >
                    <p className="text-[11px] font-bold text-violet-900 leading-snug line-clamp-2">{team.teamName}</p>
                    <p className="text-[10px] text-violet-500 truncate mt-0.5">{team.contingentName ?? "—"}</p>
                    {team.stateName && (
                      <p className="text-[10px] text-violet-400 truncate">{team.stateName}</p>
                    )}
                  </div>

                  {/* Members */}
                  <div className="px-3" style={{ paddingBottom: CARD_PAD_B }}>
                    {team.members.map(m => {
                      const isShared = sharedMemberIds.has(m.id);
                      const color    = colorMap[m.id];
                      const dimmed   = highlight !== null && highlight !== m.id;
                      return (
                        <div
                          key={m.id}
                          style={{
                            height: MEMBER_ROW_H,
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            opacity: (isShared && dimmed) ? 0.3 : 1,
                            transition: "opacity 0.15s",
                          }}
                        >
                          <span
                            className="flex-none rounded-full"
                            style={{
                              width: 8, height: 8,
                              background: isShared ? color : "#d4d4d8",
                              boxShadow: isShared && !dimmed ? `0 0 0 2px ${color}30` : "none",
                            }}
                          />
                          <span
                            className="text-[11px] leading-none truncate"
                            style={{
                              color:      isShared ? (dimmed ? "#a1a1aa" : color) : "#52525b",
                              fontWeight: isShared ? 600 : 400,
                            }}
                          >
                            {m.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
