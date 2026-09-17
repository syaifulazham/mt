"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { CertConfig, CertElement, FontId } from "@/lib/certificates/config-schema";

/**
 * The canvas is an SVG overlay whose viewBox is the page in PDF points, which is
 * the one thing that keeps it honest: SVG's coordinate system is already
 * top-left with y growing downward, and `<text y>` is already the baseline with
 * `text-anchor` for horizontal alignment. So the editor draws the *same* numbers
 * `render.ts` draws, scaled only by `zoom`.
 *
 * The one approximation is `vAlign` other than "baseline", where SVG's
 * `dominant-baseline` stands in for pdf-lib's font metrics. The true preview is
 * the arbiter, which is why it renders the real PDF rather than a picture of it.
 */

const CSS_FONT: Record<FontId, string> = {
  helvetica: "Helvetica, Arial, sans-serif",
  inter:     "CertInter, sans-serif",
  lora:      "CertLora, serif",
};

type DominantBaseline = "alphabetic" | "text-before-edge" | "central" | "text-after-edge";
type TextAnchor = "start" | "middle" | "end";

const DOMINANT_BASELINE: Record<CertElement["vAlign"], DominantBaseline> = {
  baseline: "alphabetic",
  top:      "text-before-edge",
  middle:   "central",
  bottom:   "text-after-edge",
};

const TEXT_ANCHOR: Record<CertElement["align"], TextAnchor> = {
  left:   "start",
  center: "middle",
  right:  "end",
};

export type CanvasProps = {
  config: CertConfig;
  baseAssetUrl: string | null;
  baseAssetType: "PDF" | "IMAGE" | null;
  zoom: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  /** Called with the guideline's new x, in points. */
  onGuideMove?: (x: number) => void;
  previewText: (el: CertElement) => string;
  readOnly?: boolean;
};

export function EditorCanvas({
  config, baseAssetUrl, baseAssetType, zoom, selectedId, onSelect, onMove, onGuideMove, previewText, readOnly,
}: CanvasProps) {
  const { width, height, centerGuide } = config.canvas;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const guideDrag = useRef<{ startX: number; originX: number } | null>(null);

  function beginDrag(e: ReactPointerEvent, el: CertElement) {
    if (readOnly) return;
    e.stopPropagation();
    onSelect(el.id);
    drag.current = { id: el.id, startX: e.clientX, startY: e.clientY, originX: el.x, originY: el.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function beginGuideDrag(e: ReactPointerEvent) {
    if (readOnly || centerGuide === undefined) return;
    e.stopPropagation();
    guideDrag.current = { startX: e.clientX, originX: centerGuide };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    // px → pt is a plain division by zoom; no second coordinate system exists.
    const g = guideDrag.current;
    if (g && onGuideMove) {
      const x = Math.round((g.originX + (e.clientX - g.startX) / zoom) * 10) / 10;
      onGuideMove(Math.max(0, Math.min(width, x)));
      return;
    }

    const d = drag.current;
    if (!d) return;
    const x = Math.round((d.originX + (e.clientX - d.startX) / zoom) * 10) / 10;
    const y = Math.round((d.originY + (e.clientY - d.startY) / zoom) * 10) / 10;
    onMove(d.id, Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y)));
  }

  function endDrag() { drag.current = null; guideDrag.current = null; }

  return (
    <div
      className="relative shadow-lg bg-white shrink-0"
      style={{ width: width * zoom, height: height * zoom }}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* Base artwork. A PDF base is shown through <embed> rather than rasterised
          server-side — no pdfium in this stack — and never receives pointers. */}
      {baseAssetUrl && baseAssetType === "PDF" && (
        <embed
          src={`${baseAssetUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
          type="application/pdf"
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      )}
      {baseAssetUrl && baseAssetType === "IMAGE" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={baseAssetUrl} alt="" className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
      )}
      {!baseAssetUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 border-2 border-dashed">
          Upload a base PDF or image
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={width * zoom}
        height={height * zoom}
        className="absolute inset-0"
        onPointerMove={onPointerMove}
        // Only a click on the empty page clears the selection. Without the
        // target check, the click that follows pointerdown on an element bubbles
        // up here and deselects it the moment the mouse is released.
        onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
      >
        {/* Centre guideline. Drawn under the elements so it never intercepts a
            click meant for one; its own hit area is the wide transparent line. */}
        {centerGuide !== undefined && (
          <g>
            <line
              x1={centerGuide} x2={centerGuide} y1={0} y2={height}
              stroke="#e11d48" strokeWidth={0.7} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
            />
            <line
              x1={centerGuide} x2={centerGuide} y1={0} y2={height}
              stroke="transparent" strokeWidth={10 / zoom}
              style={{ cursor: readOnly ? "default" : "ew-resize" }}
              onPointerDown={beginGuideDrag}
            />
            <rect
              x={centerGuide - 9 / zoom} y={0} width={18 / zoom} height={14 / zoom}
              fill="#e11d48" rx={2 / zoom}
              style={{ cursor: readOnly ? "default" : "ew-resize" }}
              onPointerDown={beginGuideDrag}
            />
            <text
              x={centerGuide} y={10 / zoom} textAnchor="middle" fill="#fff"
              fontSize={9 / zoom} style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {Math.round(centerGuide)}
            </text>
          </g>
        )}

        {[...config.elements].sort((a, b) => a.z - b.z).map((el) => {
          const selected = el.id === selectedId;
          if (el.type === "image" || el.type === "qr") {
            const w = el.type === "image" ? el.width : el.size;
            const h = el.type === "image" ? el.height : el.size;
            return (
              <g key={el.id} onPointerDown={(e) => beginDrag(e, el)} style={{ cursor: readOnly ? "default" : "move" }}>
                {el.type === "image"
                  ? <image href={el.url} x={el.x} y={el.y - h} width={w} height={h} opacity={el.opacity ?? 1} preserveAspectRatio="none" />
                  : <rect x={el.x} y={el.y - h} width={w} height={h} fill="#111" opacity={0.15} />}
                <rect
                  x={el.x} y={el.y - h} width={w} height={h}
                  fill="transparent" stroke={selected ? "#2563eb" : "transparent"} strokeWidth={1}
                  strokeDasharray="3 2" vectorEffect="non-scaling-stroke"
                />
                {el.type === "qr" && (
                  <text x={el.x + w / 2} y={el.y - h / 2} textAnchor="middle" dominantBaseline="central"
                        fontSize={Math.min(10, w / 3)} fill="#111">QR</text>
                )}
              </g>
            );
          }

          const text = previewText(el) || " ";
          return (
            <g key={el.id} onPointerDown={(e) => beginDrag(e, el)} style={{ cursor: readOnly ? "default" : "move" }}>
              <text
                x={el.x}
                y={el.y}
                textAnchor={TEXT_ANCHOR[el.align]}
                dominantBaseline={DOMINANT_BASELINE[el.vAlign]}
                fontFamily={CSS_FONT[el.style.font]}
                fontSize={el.style.size}
                fontWeight={el.style.weight === "bold" ? 700 : 400}
                letterSpacing={el.style.letterSpacing ?? undefined}
                fill={el.style.color}
                style={{ userSelect: "none" }}
              >
                {text}
              </text>
              {/* Anchor cross-hair: shows exactly which point x/y refer to. */}
              {selected && (
                <>
                  <line x1={el.x - 6} x2={el.x + 6} y1={el.y} y2={el.y} stroke="#2563eb" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                  <line x1={el.x} x2={el.x} y1={el.y - 6} y2={el.y + 6} stroke="#2563eb" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                  {el.maxWidth && (
                    <rect
                      x={el.align === "center" ? el.x - el.maxWidth / 2 : el.align === "right" ? el.x - el.maxWidth : el.x}
                      y={el.y - el.style.size} width={el.maxWidth} height={el.style.size * 1.3}
                      fill="none" stroke="#2563eb" strokeWidth={0.5} strokeDasharray="2 2" vectorEffect="non-scaling-stroke"
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
