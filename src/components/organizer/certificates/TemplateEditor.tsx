"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Copy, Eye, Image as ImageIcon, Loader2, QrCode, Save, Type, Upload, Layers, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  certConfigSchema, emptyConfig, PAPER_SIZES, type CertConfig, type CertElement,
} from "@/lib/certificates/config-schema";
import { resolveFieldToken, sampleFieldSource, type CertFieldToken } from "@/lib/certificates/fields";
import { EditorCanvas } from "./EditorCanvas";
import { ElementInspector } from "./ElementInspector";
import { FieldPicker } from "./FieldPicker";
import { TruePreviewDialog } from "./TruePreviewDialog";

export type EditorTemplate = {
  id: string;
  name: string;
  targetType: string;
  status: string;
  draftConfig: unknown;
  baseAssetUrl: string | null;
  baseAssetType: "PDF" | "IMAGE" | null;
  currentVersionId: string | null;
  season: { id: string; code: string; name: string; year: number; archivedAt: string | Date | null };
  versions: { id: string; version: number; publishedAt: string | Date }[];
};

export type EditorSeason = { id: string; code: string; name: string; archivedAt: string | Date | null };

const ZOOMS = [0.5, 0.75, 1, 1.5];

export function TemplateEditor({
  template, seasons, canWrite,
}: {
  template: EditorTemplate;
  seasons: EditorSeason[];
  canWrite: boolean;
}) {
  const parsed = certConfigSchema.safeParse(template.draftConfig);
  const [config, setConfig]   = useState<CertConfig>(parsed.success ? parsed.data : emptyConfig());
  const [name, setName]       = useState(template.name);
  const [asset, setAsset]     = useState({ url: template.baseAssetUrl, type: template.baseAssetType });
  const [selectedId, select]  = useState<string | null>(null);
  const [zoom, setZoom]       = useState(0.75);
  const [dirty, setDirty]     = useState(false);
  const [busy, setBusy]       = useState<null | "save" | "publish" | "upload" | "duplicate">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [followGuide, setFollowGuide] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The season owning archived data is render-only: no publishing, no editing.
  const archived = !!template.season.archivedAt;
  const editable = canWrite && !archived;

  const sample = useMemo(() => sampleFieldSource(template.season), [template.season]);
  const selected = config.elements.find((e) => e.id === selectedId) ?? null;

  const previewText = useCallback((el: CertElement): string => {
    if (el.type !== "static_text" && el.type !== "field") return "";
    const raw = el.type === "static_text"
      ? el.text
      : `${el.prefix ?? ""}${resolveFieldToken(el.field, sample) || el.fallback || ""}${el.suffix ?? ""}`;
    if (el.style.transform === "upper") return raw.toUpperCase();
    if (el.style.transform === "title")
      return raw.toLowerCase().replace(/(^|\s|[-'"(])([\p{L}])/gu, (_, p, c: string) => p + c.toUpperCase());
    return raw;
  }, [sample]);

  function mutate(next: CertConfig) { setConfig(next); setDirty(true); setMessage(null); }

  function addElement(el: CertElement) {
    mutate({ ...config, elements: [...config.elements, el] });
    select(el.id);
  }

  const nextId = () => `el_${Date.now().toString(36)}`;
  const centreX = config.canvas.width / 2;

  function addStaticText() {
    addElement({
      id: nextId(), type: "static_text", text: "New text", z: config.elements.length,
      x: centreX, y: config.canvas.height / 2, align: "center", vAlign: "baseline", fit: "shrink",
      style: { font: "inter", size: 14, weight: "normal", color: "#000000", transform: "none" },
    });
  }

  function addField(field: CertFieldToken) {
    addElement({
      id: nextId(), type: "field", field, z: config.elements.length,
      x: centreX, y: config.canvas.height / 2, align: "center", vAlign: "baseline", fit: "shrink",
      style: { font: "inter", size: 14, weight: "bold", color: "#000000", transform: "upper" },
    });
  }

  function addQr() {
    addElement({
      id: nextId(), type: "qr", encodes: "verify_url", size: 64, z: config.elements.length,
      x: config.canvas.width - 100, y: config.canvas.height - 40, align: "left", vAlign: "bottom",
    });
  }

  function addImage() {
    const url = window.prompt("Image URL (https)");
    if (!url) return;
    addElement({
      id: nextId(), type: "image", url, width: 120, height: 60, z: config.elements.length,
      x: centreX - 60, y: config.canvas.height / 2, align: "left", vAlign: "bottom",
    });
  }

  function patchSelected(patch: Partial<CertElement>) {
    if (!selected) return;
    mutate({
      ...config,
      elements: config.elements.map((e) => (e.id === selected.id ? ({ ...e, ...patch } as CertElement) : e)),
    });
  }

  function deleteSelected() {
    if (!selected) return;
    mutate({ ...config, elements: config.elements.filter((e) => e.id !== selected.id) });
    select(null);
  }

  function toggleGuide(on: boolean) {
    mutate({
      ...config,
      canvas: { ...config.canvas, centerGuide: on ? config.canvas.centerGuide ?? config.canvas.width / 2 : undefined },
    });
  }

  /**
   * Moving the guide with "move elements too" on drags the whole design
   * sideways: every element keeps its offset from the guide, which is what you
   * want when the artwork's centre turns out to be a few points off.
   */
  function moveGuide(x: number) {
    const previous = config.canvas.centerGuide;
    const dx = previous === undefined ? 0 : x - previous;
    mutate({
      ...config,
      canvas: { ...config.canvas, centerGuide: x },
      elements: followGuide && dx
        ? config.elements.map((e) => ({ ...e, x: Math.max(0, Math.min(config.canvas.width, Math.round((e.x + dx) * 10) / 10)) }))
        : config.elements,
    });
  }

  function setPaper(paper: keyof typeof PAPER_SIZES, orientation: "portrait" | "landscape") {
    const { width, height } = PAPER_SIZES[paper];
    mutate({
      ...config,
      canvas: {
        paper, orientation,
        width:  orientation === "portrait" ? width  : height,
        height: orientation === "portrait" ? height : width,
      },
    });
  }

  async function save() {
    setBusy("save"); setMessage(null);
    try {
      const res = await fetch(`/api/v2/organizer/certificates/templates/${template.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, draftConfig: config, baseAssetUrl: asset.url, baseAssetType: asset.type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDirty(false); setMessage("Draft saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(null); }
  }

  async function publish() {
    if (dirty) { setMessage("Save the draft before publishing"); return; }
    setBusy("publish"); setMessage(null);
    try {
      const res = await fetch(`/api/v2/organizer/certificates/templates/${template.id}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage(`Published version ${json.data.version} — certificates already issued keep their own version`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Publish failed");
    } finally { setBusy(null); }
  }

  async function duplicate(seasonId: string) {
    setBusy("duplicate");
    try {
      const res = await fetch(`/api/v2/organizer/certificates/templates/${template.id}/duplicate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seasonId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      window.location.href = `/organizer/certificates/templates/${json.data.id}`;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Duplicate failed");
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("upload"); setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v2/organizer/certificates/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAsset({ url: json.url, type: json.type });
      setDirty(true);
      setMessage("Base asset uploaded — save to attach it");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(null); }
  }

  const duplicateTargets = seasons.filter((s) => !s.archivedAt);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2">
        <Link href="/organizer/certificates" className="text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Input
          value={name} disabled={!editable} onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="h-8 w-72 text-sm font-medium"
        />
        <Badge variant="outline" className="text-[10px]">{template.season.code}</Badge>
        <Badge variant="outline" className="text-[10px]">{template.targetType}</Badge>
        <Badge className="text-[10px]">{template.status}</Badge>
        {template.versions.length > 0 && (
          <span className="text-[11px] text-zinc-500">v{template.versions[0].version} published</span>
        )}
        {archived && (
          <span className="text-[11px] text-amber-600">
            archived season — render only
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <select
            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs"
            value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
          >
            {ZOOMS.map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
          </select>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPreview(true)}>
            <Eye className="mr-1 h-3.5 w-3.5" /> True preview
          </Button>
          {editable && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy !== null} onClick={save}>
                {busy === "save" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                Save{dirty ? " *" : ""}
              </Button>
              <Button size="sm" className="h-8 text-xs" disabled={busy !== null} onClick={publish}>
                {busy === "publish" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                Publish
              </Button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div className="border-b bg-blue-50 px-4 py-1.5 text-[11px] text-blue-800">{message}</div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Left: elements + fields ──────────────────────────────────────── */}
        <div className="w-60 shrink-0 overflow-y-auto border-r bg-white p-3 space-y-4">
          {editable && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Add</p>
              <div className="grid grid-cols-3 gap-1">
                <Button size="sm" variant="outline" className="h-7 px-0 text-[10px]" onClick={addStaticText}>
                  <Type className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-0 text-[10px]" onClick={addImage}>
                  <ImageIcon className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-0 text-[10px]" onClick={addQr}>
                  <QrCode className="h-3.5 w-3.5" />
                </Button>
              </div>
              <input
                ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
              />
              <Button
                size="sm" variant="outline" className="h-7 w-full text-[10px]"
                disabled={busy !== null} onClick={() => fileRef.current?.click()}
              >
                {busy === "upload" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                Base asset
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Page</p>
            <div className="flex gap-1">
              <select
                className="h-7 flex-1 rounded-md border border-zinc-200 bg-white px-1 text-xs"
                disabled={!editable} value={config.canvas.paper}
                onChange={(e) => setPaper(e.target.value as keyof typeof PAPER_SIZES, config.canvas.orientation)}
              >
                {Object.keys(PAPER_SIZES).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                className="h-7 flex-1 rounded-md border border-zinc-200 bg-white px-1 text-xs"
                disabled={!editable} value={config.canvas.orientation}
                onChange={(e) => setPaper(config.canvas.paper as keyof typeof PAPER_SIZES, e.target.value as "portrait" | "landscape")}
              >
                <option value="portrait">portrait</option>
                <option value="landscape">landscape</option>
              </select>
            </div>
            <p className="text-[10px] text-zinc-400">
              {config.canvas.width} × {config.canvas.height} pt
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Centre guide</p>
            <label className="flex items-center gap-2 text-[11px] text-zinc-600">
              <input
                type="checkbox" className="h-3.5 w-3.5" disabled={!editable}
                checked={config.canvas.centerGuide !== undefined}
                onChange={(e) => toggleGuide(e.target.checked)}
              />
              Show guideline
            </label>
            {config.canvas.centerGuide !== undefined && (
              <>
                <label className="flex items-center gap-2 text-[11px] text-zinc-600">
                  <input
                    type="checkbox" className="h-3.5 w-3.5" disabled={!editable}
                    checked={followGuide} onChange={(e) => setFollowGuide(e.target.checked)}
                  />
                  Move elements with it
                </label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number" step={0.5} disabled={!editable}
                    value={config.canvas.centerGuide} className="h-7 text-xs"
                    onChange={(e) => moveGuide(Number(e.target.value))}
                  />
                  <Button
                    size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!editable}
                    onClick={() => moveGuide(config.canvas.width / 2)}
                  >
                    Page
                  </Button>
                </div>
                <p className="text-[10px] leading-snug text-zinc-400">
                  Drag the red line on the canvas. Editor-only — it is never printed.
                </p>
              </>
            )}
          </div>

          <div className="space-y-1">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <Layers className="h-3 w-3" /> Elements ({config.elements.length})
            </p>
            {[...config.elements].sort((a, b) => b.z - a.z).map((el) => (
              <button
                key={el.id} type="button" onClick={() => select(el.id)}
                className={`w-full truncate rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                  el.id === selectedId ? "bg-blue-50 text-blue-700" : "hover:bg-zinc-100 text-zinc-600"
                }`}
              >
                {el.type === "field" ? `{{${el.field}}}` : el.type === "static_text" ? el.text || "(empty)" : el.type}
              </button>
            ))}
          </div>

          {editable && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Fields</p>
              <FieldPicker onAdd={addField} />
            </div>
          )}

          {canWrite && duplicateTargets.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Duplicate to season</p>
              <select
                className="h-7 w-full rounded-md border border-zinc-200 bg-white px-1 text-xs"
                defaultValue="" disabled={busy !== null}
                onChange={(e) => e.target.value && duplicate(e.target.value)}
              >
                <option value="">Choose…</option>
                {duplicateTargets.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
              <p className="flex items-start gap-1 text-[10px] text-zinc-400">
                <Copy className="mt-0.5 h-3 w-3 shrink-0" />
                Clones this design as a draft; nothing already issued is touched.
              </p>
            </div>
          )}
        </div>

        {/* ── Centre: canvas ───────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-auto bg-zinc-100 p-6">
          <EditorCanvas
            config={config}
            baseAssetUrl={asset.url}
            baseAssetType={asset.type}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={select}
            onMove={(id, x, y) =>
              mutate({ ...config, elements: config.elements.map((e) => (e.id === id ? { ...e, x, y } : e)) })}
            onGuideMove={moveGuide}
            previewText={previewText}
            readOnly={!editable}
          />
        </div>

        {/* ── Right: inspector ─────────────────────────────────────────────── */}
        <div className="w-64 shrink-0 overflow-y-auto border-l bg-white p-3">
          {selected ? (
            <ElementInspector
              element={selected}
              onChange={patchSelected}
              onDelete={deleteSelected}
              centerGuide={config.canvas.centerGuide}
            />
          ) : (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Select an element to edit it. Coordinates are PDF points from the top-left;
              <span className="text-zinc-500"> y</span> is the anchor line and
              <span className="text-zinc-500"> v-align</span> decides where the text sits on it.
            </p>
          )}
        </div>
      </div>

      <TruePreviewDialog
        templateId={template.id} config={config} open={preview} onClose={() => setPreview(false)}
      />
    </div>
  );
}
