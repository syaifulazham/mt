"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import {
  Bold, Italic, Heading2, List, ListOrdered, Link2, Quote, ImagePlus, Plus, Trash2, ArrowUp, ArrowDown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Block, BlockOf, SectionImage } from "@/lib/landingSections";
import { ImagePicker } from "./ImagePicker";

// ── Small shared controls ────────────────────────────────────────────────────

const selectCls = "h-9 rounded-md border border-input bg-white px-2 text-sm";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-zinc-600">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

function Choice<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md bg-zinc-100 p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium ${value === o.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ALIGN = [{ value: "left" as const, label: "Left" }, { value: "center" as const, label: "Centre" }];
const COLS = [{ value: 2 as const, label: "2" }, { value: 3 as const, label: "3" }, { value: 4 as const, label: "4" }];

/** Move / remove buttons for an item inside a list block. */
function ItemTools({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (from: number, to: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" disabled={i === 0} onClick={() => onMove(i, i - 1)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button type="button" disabled={i === n - 1} onClick={() => onMove(i, i + 1)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onRemove} className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

// ── Markdown field with a formatting toolbar ─────────────────────────────────

export function MarkdownField({ value, onChange, rows = 6, placeholder }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(kind: "bold" | "italic" | "h" | "ul" | "ol" | "quote" | "link") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = value.slice(a, b);
    let next = value, caretA = a, caretB = b;

    if (kind === "bold" || kind === "italic" || kind === "link") {
      const [pre, post, filler] =
        kind === "bold" ? ["**", "**", "bold text"] :
        kind === "italic" ? ["*", "*", "italic text"] :
        ["[", "](https://)", "link text"];
      const inner = sel || filler;
      next = value.slice(0, a) + pre + inner + post + value.slice(b);
      caretA = a + pre.length; caretB = caretA + inner.length;
    } else {
      // Line prefixes apply to every selected line.
      const lineStart = value.lastIndexOf("\n", a - 1) + 1;
      const lineEnd = value.indexOf("\n", b) === -1 ? value.length : value.indexOf("\n", b);
      const lines = value.slice(lineStart, lineEnd).split("\n");
      const prefixed = lines.map((l, i) => {
        const clean = l.replace(/^(#{1,4} |[-*] |\d+\. |> )/, "");
        return (kind === "h" ? "### " : kind === "ul" ? "- " : kind === "ol" ? `${i + 1}. ` : "> ") + clean;
      }).join("\n");
      next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
      caretA = lineStart; caretB = lineStart + prefixed.length;
    }
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caretA, caretB); });
  }

  const tools = [
    { k: "bold" as const, icon: Bold, t: "Bold" },
    { k: "italic" as const, icon: Italic, t: "Italic" },
    { k: "h" as const, icon: Heading2, t: "Sub-heading" },
    { k: "ul" as const, icon: List, t: "Bulleted list" },
    { k: "ol" as const, icon: ListOrdered, t: "Numbered list" },
    { k: "quote" as const, icon: Quote, t: "Quote" },
    { k: "link" as const, icon: Link2, t: "Link" },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-input bg-white focus-within:ring-2 focus-within:ring-sky-200">
      <div className="flex items-center gap-0.5 border-b bg-zinc-50 px-1.5 py-1">
        {tools.map(({ k, icon: Icon, t }) => (
          <button key={k} type="button" title={t} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(k)}
            className="rounded p-1.5 text-zinc-500 hover:bg-white hover:text-zinc-900">
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <span className="ml-auto pr-1 text-[10px] text-zinc-400">Markdown</span>
      </div>
      <textarea ref={ref} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="block w-full resize-y px-3 py-2 text-sm leading-relaxed outline-none" />
    </div>
  );
}

// ── Image field ──────────────────────────────────────────────────────────────

export function ImageField({ value, onChange, withText = true }: {
  value: SectionImage; onChange: (v: SectionImage) => void; withText?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3">
      <button type="button" onClick={() => setOpen(true)}
        className="relative flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 hover:border-sky-300 hover:text-sky-600">
        {value.url ? <img src={value.url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>{value.url ? "Change image" : "Choose image"}</Button>
          {value.url && <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, url: "" })}><X className="mr-1 h-3.5 w-3.5" />Remove</Button>}
        </div>
        {withText && (
          <div className="grid grid-cols-2 gap-2">
            <Input className="h-8 text-xs" value={value.alt} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder="Alt text (describe the image)" />
            <Input className="h-8 text-xs" value={value.caption} onChange={(e) => onChange({ ...value, caption: e.target.value })} placeholder="Caption (optional)" />
          </div>
        )}
      </div>
      <ImagePicker open={open} onClose={() => setOpen(false)} onPick={([img]) => img && onChange({ ...value, url: img.url, alt: value.alt || img.alt })} />
    </div>
  );
}

// ── Per-block forms ──────────────────────────────────────────────────────────

type P<T extends Block["type"]> = { block: BlockOf<T>; onChange: (b: BlockOf<T>) => void };

function HeadingForm({ block, onChange }: P<"heading">) {
  return (
    <div className="space-y-3">
      <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Heading text" className="font-semibold" />
      <div className="flex flex-wrap gap-3">
        <Choice value={block.level} options={[{ value: 2, label: "Large" }, { value: 3, label: "Small" }]} onChange={(level) => onChange({ ...block, level })} />
        <Choice value={block.align} options={ALIGN} onChange={(align) => onChange({ ...block, align })} />
      </div>
    </div>
  );
}

function TextForm({ block, onChange }: P<"text">) {
  return (
    <div className="space-y-3">
      <MarkdownField value={block.markdown} onChange={(markdown) => onChange({ ...block, markdown })} placeholder="Write the paragraph…" />
      <Choice value={block.align} options={ALIGN} onChange={(align) => onChange({ ...block, align })} />
    </div>
  );
}

function ImageForm({ block, onChange }: P<"image">) {
  return (
    <div className="space-y-3">
      <ImageField value={block.image} onChange={(image) => onChange({ ...block, image })} />
      <Choice value={block.width} options={[{ value: "medium", label: "Medium" }, { value: "wide", label: "Wide" }, { value: "full", label: "Full width" }]}
        onChange={(width) => onChange({ ...block, width })} />
    </div>
  );
}

function ImagesForm({ block, onChange }: P<"images">) {
  const [open, setOpen] = useState(false);
  const set = (items: SectionImage[]) => onChange({ ...block, items });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {block.items.map((img, i) => (
          <div key={`${img.url}-${i}`} className="group relative aspect-[4/3] overflow-hidden rounded-md border bg-zinc-100">
            <img src={img.url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
              <div className="rounded bg-white/90"><ItemTools i={i} n={block.items.length} onMove={(a, b) => set(move(block.items, a, b))} onRemove={() => set(block.items.filter((_, j) => j !== i))} /></div>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setOpen(true)}
          className="flex aspect-[4/3] flex-col items-center justify-center rounded-md border-2 border-dashed border-zinc-300 text-xs text-zinc-400 hover:border-sky-300 hover:text-sky-600">
          <ImagePlus className="mb-1 h-5 w-5" /> Add images
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">Columns <Choice value={block.columns} options={COLS} onChange={(columns) => onChange({ ...block, columns })} /></div>
      <ImagePicker open={open} multiple onClose={() => setOpen(false)} onPick={(imgs) => set([...block.items, ...imgs])} />
    </div>
  );
}

function MediaForm({ block, onChange }: P<"media">) {
  return (
    <div className="space-y-3">
      <ImageField value={block.image} onChange={(image) => onChange({ ...block, image })} />
      <MarkdownField value={block.markdown} onChange={(markdown) => onChange({ ...block, markdown })} placeholder="Text shown beside the image…" />
      <div className="flex items-center gap-2 text-xs text-zinc-500">Image on the <Choice value={block.side} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} onChange={(side) => onChange({ ...block, side })} /></div>
    </div>
  );
}

function CardsForm({ block, onChange }: P<"cards">) {
  const set = (items: BlockOf<"cards">["items"]) => onChange({ ...block, items });
  const [picking, setPicking] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {block.items.map((c, i) => (
        <div key={i} className="flex gap-3 rounded-md border bg-zinc-50/60 p-2.5">
          <button type="button" onClick={() => setPicking(i)}
            className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-zinc-300 bg-white text-zinc-400 hover:text-sky-600">
            {c.image ? <img src={c.image} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input className="h-8 text-sm font-medium" value={c.title} placeholder="Card title" onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <textarea className="block w-full rounded-md border border-input px-2.5 py-1.5 text-xs" rows={2} value={c.text} placeholder="Short description"
              onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            <div className="flex gap-2">
              <Input className="h-7 text-xs" value={c.url} placeholder="Link (optional) — https://… or /path" onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              {c.image && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => set(block.items.map((x, j) => (j === i ? { ...x, image: "" } : x)))}>No image</Button>}
            </div>
          </div>
          <ItemTools i={i} n={block.items.length} onMove={(a, b) => set(move(block.items, a, b))} onRemove={() => set(block.items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={block.items.length >= 24} onClick={() => set([...block.items, { title: "", text: "", image: "", url: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add card</Button>
        <span className="flex items-center gap-2 text-xs text-zinc-500">Columns <Choice value={block.columns} options={COLS} onChange={(columns) => onChange({ ...block, columns })} /></span>
      </div>
      <ImagePicker open={picking !== null} onClose={() => setPicking(null)}
        onPick={([img]) => img && picking !== null && set(block.items.map((x, j) => (j === picking ? { ...x, image: img.url } : x)))} />
    </div>
  );
}

function StatsForm({ block, onChange }: P<"stats">) {
  const set = (items: BlockOf<"stats">["items"]) => onChange({ ...block, items });
  return (
    <div className="space-y-2">
      {block.items.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="h-8 w-32 text-sm font-bold" value={s.value} placeholder="e.g. 170k" onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <Input className="h-8 text-sm" value={s.label} placeholder="Label, e.g. Peserta" onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <ItemTools i={i} n={block.items.length} onMove={(a, b) => set(move(block.items, a, b))} onRemove={() => set(block.items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={block.items.length >= 8} onClick={() => set([...block.items, { value: "", label: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add stat</Button>
    </div>
  );
}

function ButtonsForm({ block, onChange }: P<"buttons">) {
  const set = (items: BlockOf<"buttons">["items"]) => onChange({ ...block, items });
  return (
    <div className="space-y-2">
      {block.items.map((b, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input className="h-8 w-44 text-sm" value={b.label} placeholder="Button label" onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Input className="h-8 min-w-0 flex-1 text-sm" value={b.url} placeholder="https://…, /path or #section" onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <select className={selectCls} value={b.variant} onChange={(e) => set(block.items.map((x, j) => (j === i ? { ...x, variant: e.target.value as "primary" | "secondary" } : x)))}>
            <option value="primary">Solid</option>
            <option value="secondary">Outline</option>
          </select>
          <ItemTools i={i} n={block.items.length} onMove={(a, c) => set(move(block.items, a, c))} onRemove={() => set(block.items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={block.items.length >= 6} onClick={() => set([...block.items, { label: "", url: "", variant: "secondary" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add button</Button>
        <Choice value={block.align} options={ALIGN} onChange={(align) => onChange({ ...block, align })} />
      </div>
    </div>
  );
}

function VideoForm({ block, onChange }: P<"video">) {
  return (
    <div className="space-y-2">
      <Input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="YouTube link — https://www.youtube.com/watch?v=…" />
      <Input className="h-8 text-xs" value={block.caption} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional)" />
    </div>
  );
}

export function BlockForm({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  switch (block.type) {
    case "heading": return <HeadingForm block={block} onChange={onChange} />;
    case "text": return <TextForm block={block} onChange={onChange} />;
    case "image": return <ImageForm block={block} onChange={onChange} />;
    case "images": return <ImagesForm block={block} onChange={onChange} />;
    case "media": return <MediaForm block={block} onChange={onChange} />;
    case "cards": return <CardsForm block={block} onChange={onChange} />;
    case "stats": return <StatsForm block={block} onChange={onChange} />;
    case "buttons": return <ButtonsForm block={block} onChange={onChange} />;
    case "video": return <VideoForm block={block} onChange={onChange} />;
  }
}
