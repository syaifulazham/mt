"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Loader2, Plus, Save, Sparkles, Trash2,
  Heading, Type, Image as ImageIcon, LayoutGrid, Columns2, SquareStack, BarChart3, MousePointerClick, Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BACKGROUNDS, BLOCK_LABELS, DEFAULT_BACKDROP, isBackdropActive, newBlock,
  type Backdrop, type Background, type Block, type BlockType, type LandingSectionDto,
} from "@/lib/landingSections";
import { BackdropEditor } from "./BackdropEditor";
import { CustomSection, CUSTOM_SECTION_CSS } from "@/components/landing/CustomSection";
import { BlockForm, Field } from "./BlockEditors";
import { AiHelperDialog, type AiMode, type AiResult } from "./AiHelperDialog";

const BLOCK_ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  heading: Heading, text: Type, image: ImageIcon, images: LayoutGrid, media: Columns2,
  cards: SquareStack, stats: BarChart3, buttons: MousePointerClick, video: Youtube,
};

const BG_LABEL: Record<Background, { label: string; swatch: string }> = {
  white: { label: "White", swatch: "#ffffff" },
  light: { label: "Light grey", swatch: "#f1f5f9" },
  dark: { label: "Dark", swatch: "#0f172a" },
  brand: { label: "Techlympics blue", swatch: "linear-gradient(135deg,#001f5b,#003893)" },
};

// The editor always holds a backdrop object; an unused one is saved as null.
type Draft = Omit<LandingSectionDto, "id" | "updatedAt" | "backdrop"> & { backdrop: Backdrop };

function blockSummary(b: Block): string {
  switch (b.type) {
    case "heading": return b.text;
    case "text": case "media": return b.markdown.replace(/[#*_>\[\]()`-]/g, "").slice(0, 80);
    case "image": return b.image.alt || b.image.url.split("/").pop() || "";
    case "images": return `${b.items.length} image${b.items.length === 1 ? "" : "s"}`;
    case "cards": return b.items.map((c) => c.title).filter(Boolean).join(" · ");
    case "stats": return b.items.map((s) => `${s.value} ${s.label}`.trim()).filter(Boolean).join(" · ");
    case "buttons": return b.items.map((x) => x.label).filter(Boolean).join(" · ");
    case "video": return b.url;
  }
}

export function SectionEditor({ initial, canEdit }: { initial: LandingSectionDto | null; canEdit: boolean }) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id ?? null);
  const [draft, setDraft] = useState<Draft>(() => initial
    ? { title: initial.title, eyebrow: initial.eyebrow, navLabel: initial.navLabel, background: initial.background, backdrop: initial.backdrop ?? DEFAULT_BACKDROP, blocks: initial.blocks, isPublished: initial.isPublished }
    : { title: "", eyebrow: "", navLabel: "", background: "white", backdrop: DEFAULT_BACKDROP, blocks: [], isPublished: false });
  const [saved, setSaved] = useState(() => JSON.stringify(draft));
  const [open, setOpen] = useState<string | null>(draft.blocks[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== saved, [draft, saved]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setBlocks = (fn: (b: Block[]) => Block[]) => setDraft((d) => ({ ...d, blocks: fn(d.blocks) }));

  function addBlock(type: BlockType) {
    const b = newBlock(type);
    setBlocks((bs) => [...bs, b]);
    setOpen(b.id);
    setAdding(false);
  }

  function moveBlock(i: number, to: number) {
    setBlocks((bs) => { const a = [...bs]; const [x] = a.splice(i, 1); a.splice(to, 0, x); return a; });
  }

  function duplicate(i: number) {
    setBlocks((bs) => {
      const copy = { ...structuredClone(bs[i]), id: Math.random().toString(36).slice(2, 10) };
      const a = [...bs]; a.splice(i + 1, 0, copy); return a;
    });
  }

  function applyAi(r: AiResult, mode: AiMode) {
    setDraft((d) => {
      if (mode === "append") return { ...d, blocks: [...d.blocks, ...r.blocks] };
      return {
        ...d,
        title: r.title || d.title,
        eyebrow: r.eyebrow || d.eyebrow,
        background: mode === "replace" ? r.background : d.background,
        blocks: r.blocks,
      };
    });
    setOpen(null);
    setMessage({ ok: true, text: "AI draft added. Check the content, then Save." });
  }

  async function save(publish?: boolean) {
    setBusy(true); setMessage(null);
    const body = { ...draft, backdrop: isBackdropActive(draft.backdrop) ? draft.backdrop : null, ...(publish !== undefined ? { isPublished: publish } : {}) };
    try {
      const res = await fetch(id ? `/api/v2/organizer/landing/sections/${id}` : "/api/v2/organizer/landing/sections", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      const s = j.data as LandingSectionDto;
      const next: Draft = { title: s.title, eyebrow: s.eyebrow, navLabel: s.navLabel, background: s.background, backdrop: s.backdrop ?? DEFAULT_BACKDROP, blocks: s.blocks, isPublished: s.isPublished };
      setDraft(next);
      setSaved(JSON.stringify(next));
      setMessage({ ok: true, text: s.isPublished ? "Saved — live on the landing page." : "Saved as draft (not shown on the landing page)." });
      if (!id) { setId(s.id); router.replace(`/organizer/landing/sections/${s.id}`); }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700;800;900&family=Rajdhani:wght@400;600;700&display=swap');${CUSTOM_SECTION_CSS}`}</style>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/organizer/landing/sections" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Custom sections
          </Link>
          <h1 className="mt-1 text-xl font-bold text-zinc-900">{id ? draft.title || "Untitled section" : "New section"}</h1>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${draft.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${draft.isPublished ? "bg-emerald-500" : "bg-zinc-400"}`} />
              {draft.isPublished ? "Published" : "Draft"}
            </span>
            {dirty && <span className="text-amber-600">Unsaved changes</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)} className="hidden xl:inline-flex">
            {showPreview ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}{showPreview ? "Hide preview" : "Show preview"}
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAiOpen(true)} className="border-violet-200 text-violet-700 hover:bg-violet-50">
                <Sparkles className="mr-1.5 h-4 w-4" /> AI helper
              </Button>
              {draft.isPublished ? (
                <Button variant="outline" size="sm" disabled={busy || !draft.title.trim()} onClick={() => save(false)}>Unpublish</Button>
              ) : (
                <Button variant="outline" size="sm" disabled={busy || !draft.title.trim()} onClick={() => save(true)}>Save &amp; publish</Button>
              )}
              <Button size="sm" disabled={busy || !draft.title.trim() || (!dirty && !!id)} onClick={() => save()}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save
              </Button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 rounded-lg border px-4 py-2 text-xs ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}
      {!canEdit && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          View only — only Super Admin and Admin can change landing page content.
        </div>
      )}

      <div className={`grid gap-6 ${showPreview ? "xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]" : ""}`}>
        {/* ── Editor column ── */}
        <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
          <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">Section</h2>
            <Field label="Title">
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Tentang Techlympics" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label above title" hint="Optional, e.g. MENGENAI KAMI">
                <Input value={draft.eyebrow ?? ""} onChange={(e) => set("eyebrow", e.target.value)} />
              </Field>
              <Field label="Menu label" hint="Shown in the top menu when filled in">
                <Input value={draft.navLabel ?? ""} onChange={(e) => set("navLabel", e.target.value)} maxLength={40} />
              </Field>
            </div>
            <Field label="Background">
              <div className="flex flex-wrap gap-2">
                {BACKGROUNDS.map((bg) => (
                  <button key={bg} type="button" onClick={() => set("background", bg)}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${draft.background === bg ? "border-sky-400 ring-2 ring-sky-100" : "hover:bg-zinc-50"}`}>
                    <span className="h-4 w-4 rounded border" style={{ background: BG_LABEL[bg].swatch }} />
                    {BG_LABEL[bg].label}
                  </button>
                ))}
              </div>
            </Field>
            <BackdropEditor value={draft.backdrop} onChange={(b) => set("backdrop", b)} />
          </div>

          <div className="space-y-2">
            <h2 className="px-1 text-sm font-semibold text-zinc-800">Content blocks</h2>
            {draft.blocks.length === 0 && (
              <div className="rounded-xl border border-dashed bg-white px-6 py-10 text-center">
                <p className="text-sm text-zinc-500">No content yet.</p>
                <p className="mt-1 text-xs text-zinc-400">Add blocks below, or let the AI helper draft the section for you.</p>
                {canEdit && (
                  <Button size="sm" variant="outline" className="mt-4 border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => setAiOpen(true)}>
                    <Sparkles className="mr-1.5 h-4 w-4" /> Generate with AI
                  </Button>
                )}
              </div>
            )}
            {draft.blocks.map((b, i) => {
              const Icon = BLOCK_ICONS[b.type];
              const isOpen = open === b.id;
              return (
                <div key={b.id} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${isOpen ? "ring-1 ring-sky-200" : ""}`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onClick={() => setOpen(isOpen ? null : b.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-sky-50 text-sky-700"><Icon className="h-3.5 w-3.5" /></span>
                      <span className="shrink-0 text-xs font-semibold text-zinc-700">{BLOCK_LABELS[b.type]}</span>
                      <span className="truncate text-xs text-zinc-400">{blockSummary(b)}</span>
                    </button>
                    <div className="flex shrink-0 items-center">
                      <button type="button" disabled={i === 0} onClick={() => moveBlock(i, i - 1)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={i === draft.blocks.length - 1} onClick={() => moveBlock(i, i + 1)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => duplicate(i)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Delete block"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t bg-white px-4 py-4">
                      <BlockForm block={b} onChange={(nb) => setBlocks((bs) => bs.map((x) => (x.id === b.id ? nb : x)))} />
                    </div>
                  )}
                </div>
              );
            })}

            {canEdit && (adding ? (
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => {
                    const Icon = BLOCK_ICONS[t];
                    return (
                      <button key={t} type="button" onClick={() => addBlock(t)}
                        className="flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs text-zinc-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800">
                        <Icon className="h-5 w-5" /> {BLOCK_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setAdding(false)} className="mt-2 w-full text-center text-xs text-zinc-400 hover:text-zinc-700">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-200 py-3 text-sm font-medium text-zinc-500 hover:border-sky-300 hover:bg-sky-50/50 hover:text-sky-700">
                <Plus className="h-4 w-4" /> Add block
              </button>
            ))}
          </div>
        </fieldset>

        {/* ── Live preview ── */}
        {showPreview && (
          <div className="min-w-0">
            <div className="sticky top-4">
              <p className="mb-2 px-1 text-xs font-medium text-zinc-500">Live preview</p>
              <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border shadow-sm" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                <CustomSection id={id ?? "preview"} title={draft.title || "Section title"} eyebrow={draft.eyebrow || null} background={draft.background} backdrop={draft.backdrop} blocks={draft.blocks} />
              </div>
            </div>
          </div>
        )}
      </div>

      <AiHelperDialog open={aiOpen} onClose={() => setAiOpen(false)} current={{ title: draft.title, blocks: draft.blocks }} onApply={applyAi} />
    </div>
  );
}
