"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, GripVertical, LayoutTemplate, Loader2, Lock, Pencil, Plus, Save, Trash2, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FIXED_SECTIONS, type FixedKey, type LandingLayout, type LandingSectionDto } from "@/lib/landingSections";

export function SectionsClient({ initialSections, initialLayout, canEdit }: {
  initialSections: LandingSectionDto[];
  initialLayout: LandingLayout; // order already resolved
  canEdit: boolean;
}) {
  const [sections, setSections] = useState(initialSections);
  const [order, setOrder] = useState(initialLayout.order);
  const [hidden, setHidden] = useState(initialLayout.hidden);
  const [savedLayout, setSavedLayout] = useState(() => JSON.stringify(initialLayout));
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutMsg, setLayoutMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<LandingSectionDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const layoutDirty = JSON.stringify({ order, hidden }) !== savedLayout;

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((o) => { const a = [...o]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  }

  async function saveLayout() {
    setSavingLayout(true); setLayoutMsg(null);
    try {
      const res = await fetch("/api/v2/organizer/landing/sections/layout", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order, hidden }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOrder(j.data.order); setHidden(j.data.hidden);
      setSavedLayout(JSON.stringify(j.data));
      setLayoutMsg({ ok: true, text: "Page order saved." });
    } catch (e) {
      setLayoutMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSavingLayout(false);
    }
  }

  function resetLayout() {
    const s = JSON.parse(savedLayout) as LandingLayout;
    setOrder(s.order); setHidden(s.hidden); setLayoutMsg(null);
  }

  async function togglePublish(s: LandingSectionDto) {
    setToggling(s.id);
    try {
      const res = await fetch(`/api/v2/organizer/landing/sections/${s.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished: !s.isPublished }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setSections((all) => all.map((x) => (x.id === s.id ? j.data : x)));
    } finally {
      setToggling(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v2/organizer/landing/sections/${toDelete.id}`, { method: "DELETE" });
      if (res.ok) {
        const key = `custom:${toDelete.id}`;
        setSections((all) => all.filter((x) => x.id !== toDelete.id));
        setOrder((o) => o.filter((k) => k !== key));
        setSavedLayout((sl) => {
          const s = JSON.parse(sl) as LandingLayout;
          return JSON.stringify({ order: s.order.filter((k) => k !== key), hidden: s.hidden });
        });
        setToDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  const fixedRow = (label: string, note: string) => (
    <div className="flex items-center gap-3 rounded-lg border border-dashed bg-zinc-50 px-3 py-2 text-zinc-400">
      <Lock className="h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs">{note}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900"><LayoutTemplate className="h-6 w-6 text-sky-600" /> Custom Sections</h1>
          <p className="mt-1 text-sm text-zinc-500">Add your own sections to the public landing page and set where every section appears.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />View landing page</a></Button>
          {canEdit && <Button asChild><Link href="/organizer/landing/sections/new"><Plus className="mr-1.5 h-4 w-4" />New section</Link></Button>}
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          View only — only Super Admin and Admin can change landing page content.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ── Sections ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800">Your sections</h2>
          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white px-6 py-12 text-center">
              <LayoutTemplate className="mx-auto h-8 w-8 text-zinc-300" />
              <p className="mt-2 text-sm text-zinc-500">No custom sections yet.</p>
              {canEdit && <Button size="sm" className="mt-4" asChild><Link href="/organizer/landing/sections/new"><Plus className="mr-1.5 h-4 w-4" />Create the first one</Link></Button>}
            </div>
          ) : sections.map((s) => (
            <div key={s.id} className="flex items-center gap-4 rounded-xl border bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/organizer/landing/sections/${s.id}`} className="truncate font-semibold text-zinc-900 hover:text-sky-700">{s.title}</Link>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                    {s.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {[s.eyebrow, `${s.blocks.length} block${s.blocks.length === 1 ? "" : "s"}`, s.navLabel ? `menu: “${s.navLabel}”` : null,
                    `updated ${new Date(s.updatedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={toggling === s.id} onClick={() => togglePublish(s)} title={s.isPublished ? "Unpublish" : "Publish"}>
                    {toggling === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : s.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="ml-1.5 hidden sm:inline">{s.isPublished ? "Unpublish" : "Publish"}</span>
                  </Button>
                  <Button variant="ghost" size="sm" asChild><Link href={`/organizer/landing/sections/${s.id}`}><Pencil className="h-4 w-4" /></Link></Button>
                  <Button variant="ghost" size="sm" onClick={() => setToDelete(s)} className="text-zinc-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Page order ── */}
        <div className="h-fit space-y-3 rounded-xl border bg-white p-4 shadow-sm lg:sticky lg:top-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">Page order</h2>
            <p className="text-xs text-zinc-500">Drag or use the arrows to arrange the fixed and custom sections. Draft sections keep their place but stay hidden until published.</p>
          </div>

          <div className="space-y-1.5">
            {fixedRow("Hero banner", "always first")}
            {order.map((key, i) => {
              const isFixed = key.startsWith("fixed:");
              const fixed = isFixed ? FIXED_SECTIONS[key.slice(6) as FixedKey] : null;
              const custom = isFixed ? null : byId.get(key.slice(7));
              if (!fixed && !custom) return null;
              const isHidden = isFixed ? hidden.includes(key) : !custom!.isPublished;
              return (
                <div key={key}
                  draggable={canEdit}
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) { move(dragIdx, i); setDragIdx(i); } }}
                  onDragEnd={() => setDragIdx(null)}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-2 transition ${dragIdx === i ? "border-sky-300 bg-sky-50" : "bg-white"} ${isHidden ? "opacity-60" : ""}`}>
                  {canEdit && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-300" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-zinc-800">{fixed?.label ?? custom!.title}</span>
                      <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${isFixed ? "bg-zinc-100 text-zinc-500" : "bg-sky-50 text-sky-700"}`}>
                        {isFixed ? "Fixed" : "Custom"}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-zinc-400">
                      {isFixed ? (hidden.includes(key) ? "Hidden from the page" : fixed!.description) : custom!.isPublished ? "Published" : "Draft — not shown"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center">
                      {isFixed && (
                        <button type="button" onClick={() => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))}
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title={hidden.includes(key) ? "Show on page" : "Hide from page"}>
                          {hidden.includes(key) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={i === order.length - 1} onClick={() => move(i, i + 1)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {fixedRow("Footer", "always last")}
          </div>

          {layoutMsg && <p className={`text-xs ${layoutMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{layoutMsg.text}</p>}
          {canEdit && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={!layoutDirty || savingLayout} onClick={resetLayout}><Undo2 className="mr-1.5 h-4 w-4" />Reset</Button>
              <Button size="sm" disabled={!layoutDirty || savingLayout} onClick={saveLayout}>
                {savingLayout ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save order
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this section?"
        description={toDelete ? `“${toDelete.title}” will be removed from the landing page and cannot be recovered.` : undefined}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
