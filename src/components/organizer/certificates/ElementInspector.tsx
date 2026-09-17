"use client";

import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FONT_IDS, type CertElement } from "@/lib/certificates/config-schema";
import { CERT_FIELDS } from "@/lib/certificates/fields";

const SELECT_CLASS =
  "w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, step = 1 }: { value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <Input
      type="number" step={step} value={value} className="h-7 text-xs"
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function ElementInspector({
  element, onChange, onDelete, centerGuide,
}: {
  element: CertElement;
  onChange: (patch: Partial<CertElement>) => void;
  onDelete: () => void;
  /** x of the centre guideline in points, when one is shown. */
  centerGuide?: number;
}) {
  const hasText = element.type === "static_text" || element.type === "field";

  /**
   * Snapping to the guide is one assignment because `align` already means "which
   * edge of the text sits on x" — the same convention the renderer uses. There is
   * no separate "bounding box" to reposition.
   */
  function snapToGuide(align: CertElement["align"]) {
    if (centerGuide === undefined) return;
    onChange({ x: centerGuide, align } as Partial<CertElement>);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-700">
          {element.type === "field" ? `Field · ${element.field}` : element.type.replace("_", " ")}
        </span>
        <button type="button" onClick={onDelete} className="text-zinc-400 hover:text-red-600 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Position — points from the top-left of the page; y is the anchor line. */}
      <div className="grid grid-cols-2 gap-2">
        <Row label="x (pt)"><Num value={element.x} onChange={(x) => onChange({ x } as Partial<CertElement>)} step={0.5} /></Row>
        <Row label="y (pt)"><Num value={element.y} onChange={(y) => onChange({ y } as Partial<CertElement>)} step={0.5} /></Row>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Align">
          <select className={SELECT_CLASS} value={element.align}
                  onChange={(e) => onChange({ align: e.target.value as CertElement["align"] } as Partial<CertElement>)}>
            <option value="left">left</option><option value="center">center</option><option value="right">right</option>
          </select>
        </Row>
        <Row label="V-align">
          <select className={SELECT_CLASS} value={element.vAlign}
                  onChange={(e) => onChange({ vAlign: e.target.value as CertElement["vAlign"] } as Partial<CertElement>)}>
            <option value="baseline">baseline</option><option value="top">top</option>
            <option value="middle">middle</option><option value="bottom">bottom</option>
          </select>
        </Row>
      </div>
      <Row label="Layer"><Num value={element.z} onChange={(z) => onChange({ z } as Partial<CertElement>)} /></Row>

      {/* Align to the centre guideline */}
      <div className="space-y-1">
        <span className="text-[11px] text-zinc-500">Align to guide</span>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button" title="Centre on guide" disabled={centerGuide === undefined}
            onClick={() => snapToGuide("center")}
            className="flex h-7 items-center justify-center rounded-md border border-zinc-200 hover:bg-zinc-100 disabled:opacity-40 transition-colors"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button" title="Start text at guide" disabled={centerGuide === undefined}
            onClick={() => snapToGuide("left")}
            className="flex h-7 items-center justify-center rounded-md border border-zinc-200 hover:bg-zinc-100 disabled:opacity-40 transition-colors"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button" title="End text at guide" disabled={centerGuide === undefined}
            onClick={() => snapToGuide("right")}
            className="flex h-7 items-center justify-center rounded-md border border-zinc-200 hover:bg-zinc-100 disabled:opacity-40 transition-colors"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {centerGuide === undefined && (
          <p className="text-[10px] text-zinc-400">Switch the guideline on to use these.</p>
        )}
      </div>

      {element.type === "static_text" && (
        <Row label="Text">
          <Input value={element.text} className="h-7 text-xs"
                 onChange={(e) => onChange({ text: e.target.value } as Partial<CertElement>)} />
        </Row>
      )}

      {element.type === "field" && (
        <>
          <Row label="Field">
            <select className={SELECT_CLASS} value={element.field}
                    onChange={(e) => onChange({ field: e.target.value } as Partial<CertElement>)}>
              {CERT_FIELDS.map((f) => <option key={f.token} value={f.token}>{f.label}</option>)}
            </select>
          </Row>
          <Row label="Prefix">
            <Input value={element.prefix ?? ""} className="h-7 text-xs"
                   onChange={(e) => onChange({ prefix: e.target.value || undefined } as Partial<CertElement>)} />
          </Row>
          <Row label="Suffix">
            <Input value={element.suffix ?? ""} className="h-7 text-xs"
                   onChange={(e) => onChange({ suffix: e.target.value || undefined } as Partial<CertElement>)} />
          </Row>
          <Row label="Fallback">
            <Input value={element.fallback ?? ""} className="h-7 text-xs" placeholder="printed when empty"
                   onChange={(e) => onChange({ fallback: e.target.value || undefined } as Partial<CertElement>)} />
          </Row>
        </>
      )}

      {hasText && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Font">
              <select className={SELECT_CLASS} value={element.style.font}
                      onChange={(e) => onChange({ style: { ...element.style, font: e.target.value as typeof FONT_IDS[number] } } as Partial<CertElement>)}>
                {FONT_IDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Row>
            <Row label="Size">
              <Num value={element.style.size} step={0.5}
                   onChange={(size) => onChange({ style: { ...element.style, size } } as Partial<CertElement>)} />
            </Row>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Weight">
              <select className={SELECT_CLASS} value={element.style.weight}
                      onChange={(e) => onChange({ style: { ...element.style, weight: e.target.value as "normal" | "bold" } } as Partial<CertElement>)}>
                <option value="normal">normal</option><option value="bold">bold</option>
              </select>
            </Row>
            <Row label="Colour">
              <input type="color" value={element.style.color} className="h-7 w-full rounded-md border border-zinc-200"
                     onChange={(e) => onChange({ style: { ...element.style, color: e.target.value } } as Partial<CertElement>)} />
            </Row>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Case">
              <select className={SELECT_CLASS} value={element.style.transform}
                      onChange={(e) => onChange({ style: { ...element.style, transform: e.target.value as "none" | "upper" | "title" } } as Partial<CertElement>)}>
                <option value="none">as entered</option><option value="upper">UPPERCASE</option><option value="title">Title Case</option>
              </select>
            </Row>
            <Row label="Tracking">
              <Num value={element.style.letterSpacing ?? 0} step={0.1}
                   onChange={(v) => onChange({ style: { ...element.style, letterSpacing: v || undefined } } as Partial<CertElement>)} />
            </Row>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Max width">
              <Num value={element.maxWidth ?? 0} step={1}
                   onChange={(v) => onChange({ maxWidth: v > 0 ? v : undefined } as Partial<CertElement>)} />
            </Row>
            <Row label="Overflow">
              <select className={SELECT_CLASS} value={element.fit}
                      onChange={(e) => onChange({ fit: e.target.value as "shrink" | "wrap" | "clip" } as Partial<CertElement>)}>
                <option value="shrink">shrink</option><option value="wrap">wrap</option><option value="clip">clip</option>
              </select>
            </Row>
          </div>
          <p className="text-[10px] leading-snug text-zinc-400">
            Max width only applies with a value above zero. Long contingent names are what
            <span className="font-medium"> shrink</span> is for.
          </p>
        </>
      )}

      {element.type === "image" && (
        <>
          <Row label="URL">
            <Input value={element.url} className="h-7 text-xs"
                   onChange={(e) => onChange({ url: e.target.value } as Partial<CertElement>)} />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Width"><Num value={element.width} onChange={(width) => onChange({ width } as Partial<CertElement>)} /></Row>
            <Row label="Height"><Num value={element.height} onChange={(height) => onChange({ height } as Partial<CertElement>)} /></Row>
          </div>
        </>
      )}

      {element.type === "qr" && (
        <>
          <Row label="Encodes">
            <select className={SELECT_CLASS} value={element.encodes}
                    onChange={(e) => onChange({ encodes: e.target.value as "verify_url" | "unique_code" | "serial_number" } as Partial<CertElement>)}>
              <option value="verify_url">verification URL</option>
              <option value="unique_code">verification code</option>
              <option value="serial_number">serial number</option>
            </select>
          </Row>
          <Row label="Size"><Num value={element.size} onChange={(size) => onChange({ size } as Partial<CertElement>)} /></Row>
        </>
      )}
    </div>
  );
}
