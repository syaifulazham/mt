"use client";

import { RotateCcw } from "lucide-react";
import type { Backdrop } from "@/lib/landingSections";
import { DEFAULT_BACKDROP } from "@/lib/landingSections";
import { backdropFill } from "@/components/landing/CustomSection";
import { Field, ImageField } from "./BlockEditors";

const GRADIENT_PRESETS: { label: string; color: string; color2: string; angle: number }[] = [
  { label: "Techlympics blue", color: "#001f5b", color2: "#003893", angle: 135 },
  { label: "Blue → red", color: "#003893", color2: "#CC0001", angle: 135 },
  { label: "Night", color: "#020617", color2: "#1e293b", angle: 180 },
  { label: "Gold", color: "#f59e0b", color2: "#FFD700", angle: 120 },
  { label: "Bottom fade", color: "#0f172a", color2: "#0f172a", angle: 180 },
];

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md bg-zinc-100 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium ${value === o.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-white px-1.5 py-1">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
      <input value={value} maxLength={7}
        onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v); }}
        onBlur={(e) => { if (!/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange("#000000"); }}
        className="w-[4.5rem] font-mono text-xs uppercase outline-none" />
    </span>
  );
}

export function BackdropEditor({ value, onChange }: { value: Backdrop; onChange: (b: Backdrop) => void }) {
  const set = <K extends keyof Backdrop>(k: K, v: Backdrop[K]) => onChange({ ...value, [k]: v });
  const fill = backdropFill(value);
  const changed = JSON.stringify(value) !== JSON.stringify(DEFAULT_BACKDROP);

  return (
    <div className="space-y-4 rounded-lg border bg-zinc-50/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-700">Background image &amp; fill</p>
        {changed && (
          <button type="button" onClick={() => onChange(DEFAULT_BACKDROP)} className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700">
            <RotateCcw className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <Field label="Image">
        <ImageField withText={false} value={{ url: value.image, alt: "", caption: "" }} onChange={(img) => {
          // First image on a plain section: add a readable overlay by default.
          if (img.url && !value.image && value.fill === "none" && value.text === "auto") {
            onChange({ ...value, image: img.url, fill: "gradient", color: "#001f5b", color2: "#003893", angle: 135, opacity: 70, text: "light" });
          } else set("image", img.url);
        }} />
      </Field>
      {value.image && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600">
          <span className="flex items-center gap-2">Focus
            <Seg value={value.position} onChange={(v) => set("position", v)}
              options={[{ value: "top", label: "Top" }, { value: "center", label: "Centre" }, { value: "bottom", label: "Bottom" }]} />
          </span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={value.parallax} onChange={(e) => set("parallax", e.target.checked)} className="h-3.5 w-3.5" />
            Fixed while scrolling (parallax)
          </label>
        </div>
      )}

      <Field label="Fill" hint={value.image ? "Laid over the image — use it to keep text readable." : "Replaces the background colour above."}>
        <Seg value={value.fill} onChange={(v) => set("fill", v)}
          options={[{ value: "none", label: "None" }, { value: "solid", label: "Solid colour" }, { value: "gradient", label: "Gradient" }]} />
      </Field>

      {value.fill !== "none" && (
        <div className="space-y-3">
          {value.fill === "gradient" && (
            <div className="flex flex-wrap gap-1.5">
              {GRADIENT_PRESETS.map((g) => (
                <button key={g.label} type="button" title={g.label}
                  onClick={() => onChange({ ...value, color: g.color, color2: g.color2, angle: g.angle })}
                  className="flex items-center gap-1.5 rounded-full border bg-white py-0.5 pl-0.5 pr-2 text-[11px] text-zinc-600 hover:border-sky-300">
                  <span className="h-4 w-4 rounded-full" style={{ background: `linear-gradient(${g.angle}deg, ${g.color}, ${g.color2})` }} />
                  {g.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
            <span className="flex items-center gap-1.5">{value.fill === "gradient" ? "From" : "Colour"} <ColorInput value={value.color} onChange={(v) => set("color", v)} /></span>
            {value.fill === "gradient" && (
              <span className="flex items-center gap-1.5">To <ColorInput value={value.color2} onChange={(v) => set("color2", v)} /></span>
            )}
          </div>
          {value.fill === "gradient" && (
            <label className="flex items-center gap-3 text-xs text-zinc-600">
              <span className="w-16 shrink-0">Direction</span>
              <input type="range" min={0} max={360} step={15} value={value.angle} onChange={(e) => set("angle", Number(e.target.value))} className="flex-1 accent-sky-600" />
              <span className="w-10 text-right tabular-nums">{value.angle}°</span>
            </label>
          )}
          <label className="flex items-center gap-3 text-xs text-zinc-600">
            <span className="w-16 shrink-0">Opacity</span>
            <input type="range" min={0} max={100} step={5} value={value.opacity} onChange={(e) => set("opacity", Number(e.target.value))} className="flex-1 accent-sky-600" />
            <span className="w-10 text-right tabular-nums">{value.opacity}%</span>
          </label>
          {fill && (
            <div className="h-6 rounded border bg-[length:12px_12px]"
              style={{ backgroundImage: "linear-gradient(45deg,#e4e4e7 25%,transparent 25%,transparent 75%,#e4e4e7 75%),linear-gradient(45deg,#e4e4e7 25%,transparent 25%,transparent 75%,#e4e4e7 75%)", backgroundPosition: "0 0,6px 6px" }}>
              <div className="h-full w-full rounded" style={{ background: fill, opacity: value.opacity / 100 }} />
            </div>
          )}
        </div>
      )}

      <Field label="Text colour" hint={value.image || value.fill !== "none" ? "Pick Light on dark images/fills, Dark on light ones." : undefined}>
        <Seg value={value.text} onChange={(v) => set("text", v)}
          options={[{ value: "auto", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      </Field>
    </div>
  );
}
