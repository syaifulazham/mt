"use client";

import { useState, useCallback, useRef } from "react";
import {
  ChevronDown, ChevronRight, Trash2, Save, Sparkles,
  Globe, Eye, RefreshCw, AlertCircle, CheckCircle2, PencilRuler,
  FileText, ExternalLink, GripVertical,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { MClusterFull, MCompetitionFull, MEntry, MasterCompDoc } from "@/lib/mapping-db";

// ── types ────────────────────────────────────────────────────────────────────

type EntryRow = { code: string; level: string; tg_name: string | null };

type FormState = {
  id: string | null;
  name: string;
  slug: string;
  cluster_id: number;
  is_international: boolean;
  method: string;
  desc_bm: string;
  desc_en: string;
  is_active: boolean;
  // readonly from master:
  entries: EntryRow[];
  pdf_docs: MasterCompDoc[];  // parsed from pdf_url JSON
};

const EMPTY_FORM = (clusterId: number): FormState => ({
  id: null, name: "", slug: "", cluster_id: clusterId,
  is_international: false, method: "", desc_bm: "", desc_en: "",
  is_active: true, entries: [], pdf_docs: [],
});

const LEVEL_OPTIONS = [
  { value: "kids",         label: "Sekolah Rendah (kids)" },
  { value: "teens",        label: "Sekolah Menengah (teens)" },
  { value: "youth",        label: "Belia (youth)" },
  { value: "open",         label: "Terbuka (open)" },
  { value: "kindergarten", label: "Tadika (kindergarten)" },
];

const LEVEL_COLOR: Record<string, string> = {
  kids: "#f4679d", teens: "#97a5f0", youth: "#a8c653", open: "#f89b53", kindergarten: "#ffc53d",
};

const METHOD_OPTIONS = [
  { value: "",          label: "Standard (zon + akhir)" },
  { value: "online",    label: "Sepenuhnya dalam talian" },
  { value: "walkin",    label: "Walk-in (zon & akhir)" },
  { value: "hybrid",    label: "Zon dalam talian · akhir fizikal" },
  { value: "finalonly", label: "Peringkat akhir sahaja" },
];

// ── sub-components ────────────────────────────────────────────────────────────

function LevelDots({ entries }: { entries: MEntry[] }) {
  const levels = [...new Set(entries.map((e) => e.level))];
  return (
    <span className="flex gap-1 items-center">
      {levels.map((lv) => (
        <span key={lv} style={{ width: 8, height: 8, borderRadius: "50%", background: LEVEL_COLOR[lv] ?? "#ccc", flexShrink: 0 }} />
      ))}
    </span>
  );
}

function ClusterEditModal({
  cluster, onSave, onClose,
}: {
  cluster: MClusterFull;
  onSave: (nameBm: string, nameEn: string) => void;
  onClose: () => void;
}) {
  const [bm, setBm] = useState(cluster.name_bm);
  const [en, setEn] = useState(cluster.name_en);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Kluster</DialogTitle>
          <DialogDescription>Kemaskini nama kluster dalam BM dan EN.</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nama BM</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={bm} onChange={e => setBm(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nama EN</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={en} onChange={e => setEn(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">Batal</button>
          <button
            onClick={() => { onSave(bm, en); onClose(); }}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Simpan
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main component ────────────────────────────────────────────────────────────

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

function parsePdfDocs(pdf_url: string | null): MasterCompDoc[] {
  if (!pdf_url) return [];
  try { return JSON.parse(pdf_url) as MasterCompDoc[]; } catch { return []; }
}

export function MappingClient({ initialClusters }: { initialClusters: MClusterFull[] }) {
  const [clusters, setClusters] = useState<MClusterFull[]>(initialClusters);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM(1));
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [editCluster, setEditCluster] = useState<MClusterFull | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const confirmRef = useRef<((ok: boolean) => void) | null>(null);
  const [view, setView] = useState<"editor" | "preview">("editor");

  const showConfirm = useCallback((
    title: string, message: string,
    opts?: { confirmLabel?: string; danger?: boolean }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmRef.current = resolve;
      setConfirmState({ open: true, title, message, resolve, ...opts });
    });
  }, []);

  const resolveConfirm = (ok: boolean) => {
    confirmRef.current?.(ok);
    setConfirmState(null);
  };

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const toggleCluster = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const selectComp = async (comp: MCompetitionFull) => {
    if (dirty && selected) {
      const ok = await showConfirm(
        "Perubahan belum disimpan",
        "Anda mempunyai perubahan yang belum disimpan. Teruskan tanpa menyimpan?",
        { confirmLabel: "Teruskan", danger: true }
      );
      if (!ok) return;
    }
    setSelected(comp.id);
    setForm({
      id: comp.id,
      name: comp.name,
      slug: comp.slug,
      cluster_id: comp.cluster_id,
      is_international: comp.is_international === 1,
      method: comp.method ?? "",
      desc_bm: comp.desc_bm ?? "",
      desc_en: comp.desc_en ?? "",
      is_active: comp.is_active === 1,
      entries: comp.entries.map((e) => ({ code: e.code, level: e.level, tg_name: e.tg_name ?? null })),
      pdf_docs: parsePdfDocs(comp.pdf_url),
    });
    setDirty(false);
  };

  const updateForm = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
  };

  const autoSlug = useCallback((name: string) => {
    return name.toLowerCase().replace(/[*():]/g, "").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }, []);

  // ── save ─────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!form.name.trim()) { showToast("Nama pertandingan diperlukan", "err"); return; }
    setSaving(true);
    try {
      const isNew = !form.id || selected === "__new__";
      const url = isNew
        ? "/api/v2/organizer/mapping/competition"
        : `/api/v2/organizer/mapping/competition/${form.id}`;
      const payload = {
        name: form.name,
        slug: form.slug || autoSlug(form.name),
        cluster_id: form.cluster_id,
        is_international: form.is_international,
        method: form.method,
        desc_bm: form.desc_bm,
        desc_en: form.desc_en,
        is_active: form.is_active,
      };
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClusters(data.clusters);
      if (isNew) setSelected(data.id ?? null);
      setDirty(false);
      showToast("Disimpan!");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal simpan", "err");
    } finally {
      setSaving(false);
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────

  const deleteComp = async () => {
    if (!form.id || selected === "__new__") {
      setSelected(null); setDirty(false); return;
    }
    const ok = await showConfirm(
      "Padam Pertandingan",
      `Adakah anda pasti ingin memadamkan "${form.name}"? Tindakan ini tidak boleh dibatalkan.`,
      { confirmLabel: "Padam", danger: true }
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/organizer/mapping/competition/${form.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClusters(data.clusters);
      setSelected(null);
      showToast("Dipadam");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal padam", "err");
    } finally {
      setSaving(false);
    }
  };

  // ── AI enhance ───────────────────────────────────────────────────────────

  const aiEnhance = async () => {
    if (!form.name) { showToast("Masukkan nama pertandingan dahulu", "err"); return; }
    setAiLoading(true);
    try {
      const cluster = clusters.find((c) => c.id === form.cluster_id);
      const res = await fetch("/api/v2/organizer/mapping/ai-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          clusterNameBm: cluster?.name_bm,
          entries: form.entries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm((f) => ({ ...f, desc_bm: data.desc_bm, desc_en: data.desc_en }));
      setDirty(true);
      showToast("Penerangan AI dijana!");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI gagal", "err");
    } finally {
      setAiLoading(false);
    }
  };

  // ── cluster save ─────────────────────────────────────────────────────────

  const saveCluster = async (id: number, nameBm: string, nameEn: string) => {
    try {
      const cl = clusters.find((c) => c.id === id);
      await fetch(`/api/v2/organizer/mapping/cluster/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name_bm: nameBm, name_en: nameEn, sort_order: cl?.sort_order ?? id }),
      });
      setClusters((prev) => prev.map((c) => c.id === id ? { ...c, name_bm: nameBm, name_en: nameEn } : c));
      showToast("Kluster dikemas kini");
    } catch { showToast("Gagal kemaskini kluster", "err"); }
  };

  // ── load initial ─────────────────────────────────────────────────────────

  const loadInitial = async () => {
    const ok = await showConfirm(
      "Muatkan Data Awal",
      "Ini akan menyegerakkan data mapping dari pangkalan data utama. Perubahan anda pada Kaedah, Antarabangsa, dan Penerangan akan dikekalkan. Teruskan?",
      { confirmLabel: "Muatkan", danger: false }
    );
    if (!ok) return;
    setLoadingInitial(true);
    try {
      const res = await fetch("/api/v2/organizer/mapping/load-initial", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClusters(data.clusters);
      setSelected(null);
      setExpanded(new Set());
      showToast(`Data disegerakkan — ${data.clusters.length} kluster`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal memuatkan data awal", "err");
    } finally {
      setLoadingInitial(false);
    }
  };

  const totalComps = clusters.reduce((s, c) => s + c.competitions.length, 0);
  const totalEntries = clusters.reduce((s, c) => s + c.competitions.reduce((ss, cc) => ss + cc.entries.length, 0), 0);

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center gap-2 transition-all"
          style={{ background: toast.type === "ok" ? "#064e3b" : "#7f1d1d", color: "#fff", minWidth: 220 }}
        >
          {toast.type === "ok"
            ? <CheckCircle2 size={15} className="text-emerald-300 flex-shrink-0" />
            : <AlertCircle size={15} className="text-red-300 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmState && (
        <Dialog open={confirmState.open} onOpenChange={(o) => { if (!o) resolveConfirm(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{confirmState.title}</DialogTitle>
              <DialogDescription className="pt-1">{confirmState.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => resolveConfirm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
              >
                Batal
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${confirmState.danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {confirmState.confirmLabel ?? "OK"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Pemetaan Pertandingan</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {clusters.length} kluster · {totalComps} pertandingan · {totalEntries} kumpulan sasaran
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "editor" && (
            <button
              onClick={loadInitial}
              disabled={loadingInitial}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingInitial ? "animate-spin" : ""} />
              Muatkan Data Awal
            </button>
          )}
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setView("editor")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${
                view === "editor"
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <PencilRuler size={13} /> Editor
            </button>
            <button
              onClick={() => setView("preview")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${
                view === "preview"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Eye size={13} /> Pratonton
            </button>
          </div>
        </div>
      </div>

      {/* Preview iframe */}
      {view === "preview" && (
        <iframe
          key="preview-frame"
          src="/api/v2/organizer/mapping/preview-html"
          className="flex-1 w-full border-0"
          title="Pratonton Peta Pertandingan"
        />
      )}

      {/* Editor body */}
      <div className={`flex flex-1 overflow-hidden ${view === "preview" ? "hidden" : ""}`}>
        {/* ── Left: cluster tree ── */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
          {clusters.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">
              <p className="mb-3">Tiada data.</p>
              <button onClick={loadInitial} className="text-blue-600 underline text-xs">Muatkan data awal</button>
            </div>
          )}

          {clusters.map((cl) => {
            const isOpen = expanded.has(cl.id);
            return (
              <div key={cl.id} className="border-b border-slate-200">
                <div className="flex items-center gap-2 px-3 py-2.5 group">
                  <button
                    onClick={() => toggleCluster(cl.id)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    <span className="text-slate-400">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide leading-tight truncate">
                        {cl.id}. {cl.name_bm}
                      </p>
                      {cl.name_en && (
                        <p className="text-xs text-slate-400 truncate">{cl.name_en}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-medium ml-1 flex-shrink-0">
                      {cl.competitions.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setEditCluster(cl)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 p-1 rounded"
                    title="Edit kluster"
                  >
                    <GripVertical size={13} />
                  </button>
                </div>

                {isOpen && (
                  <div className="pl-4 pb-1">
                    {cl.competitions.map((comp) => (
                      <button
                        key={comp.id}
                        onClick={() => selectComp(comp)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs mb-0.5 transition-colors ${
                          selected === comp.id
                            ? "bg-blue-100 text-blue-800 font-semibold"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <LevelDots entries={comp.entries} />
                        <span className="flex-1 min-w-0 truncate">{comp.name}</span>
                        {comp.is_international === 1 && (
                          <span className="text-xs px-1 py-0.5 rounded border border-indigo-300 text-indigo-500 font-bold" style={{ fontSize: 9 }}>INT</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right: editor ── */}
        <div className="flex-1 overflow-y-auto bg-white">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
              <Globe size={40} strokeWidth={1} />
              <p>Pilih pertandingan di sebelah kiri untuk mengedit</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-6 py-6">
              {/* ── Name + slug ── */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Nama Pertandingan *
                  </label>
                  {form.entries[0]?.code && (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      {form.entries[0].code}
                    </span>
                  )}
                </div>
                <input
                  readOnly
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-600 cursor-default"
                  value={form.name}
                />
              </div>

              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Slug</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.slug}
                  onChange={(e) => updateForm("slug", e.target.value)}
                  placeholder="cth. cabaran-ezbot"
                />
              </div>

              {/* ── Cluster + method ── */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Kluster</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.cluster_id}
                    onChange={(e) => updateForm("cluster_id", Number(e.target.value))}
                  >
                    {clusters.map((cl) => (
                      <option key={cl.id} value={cl.id}>{cl.id}. {cl.name_bm}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Kaedah</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.method}
                    onChange={(e) => updateForm("method", e.target.value)}
                  >
                    {METHOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6 mb-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_international}
                    onChange={(e) => updateForm("is_international", e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">Antarabangsa (INT)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => updateForm("is_active", e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">Aktif</span>
                </label>
              </div>

              {/* ── Descriptions ── */}
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Penerangan</label>
                <button
                  onClick={aiEnhance}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                >
                  <Sparkles size={12} className={aiLoading ? "animate-pulse" : ""} />
                  {aiLoading ? "Jana AI…" : "✦ Jana dengan AI"}
                </button>
              </div>
              <div className="mb-3">
                <div className="text-xs text-slate-400 mb-1 font-medium">BM</div>
                <textarea
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={form.desc_bm}
                  onChange={(e) => updateForm("desc_bm", e.target.value)}
                  placeholder="Penerangan dalam Bahasa Malaysia…"
                />
              </div>
              <div className="mb-5">
                <div className="text-xs text-slate-400 mb-1 font-medium">EN</div>
                <textarea
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={form.desc_en}
                  onChange={(e) => updateForm("desc_en", e.target.value)}
                  placeholder="Description in English…"
                />
              </div>

              {/* ── Penyertaan (readonly from master) ── */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Kumpulan Sasaran / Penyertaan
                  </label>
                  <span className="text-xs text-slate-400 italic">(dari pangkalan data utama)</span>
                </div>

                {form.entries.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
                    Tiada kumpulan sasaran. Klik &quot;Muatkan Data Awal&quot; untuk menyegerakkan.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.entries.map((entry, i) => {
                      const levelLabel = LEVEL_OPTIONS.find(l => l.value === entry.level)?.label ?? entry.level;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          {/* Official code chip */}
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 flex-shrink-0">
                            {entry.code}
                          </span>
                          {/* Target group name */}
                          <span className="flex-1 text-sm text-slate-700 truncate">
                            {entry.tg_name ?? levelLabel}
                          </span>
                          {/* Level badge */}
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                            style={{ background: LEVEL_COLOR[entry.level] ?? "#94a3b8" }}
                          >
                            {entry.level}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Kertas Konsep / Concept Papers (readonly from master) ── */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Kertas Konsep
                  </label>
                  <span className="text-xs text-slate-400 italic">(dari pangkalan data utama)</span>
                </div>

                {form.pdf_docs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
                    Tiada kertas konsep dimuat naik.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.pdf_docs.map((doc, i) => (
                      <a
                        key={i}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                      >
                        <FileText size={15} className="text-red-400 flex-shrink-0" />
                        <span className="flex-1 text-sm text-slate-700 truncate group-hover:text-blue-700">
                          {doc.name}
                        </span>
                        <ExternalLink size={12} className="text-slate-400 flex-shrink-0 group-hover:text-blue-500" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Actions ── */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-5">
                <button
                  onClick={deleteComp}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Padam
                </button>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={14} /> {saving ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cluster edit modal */}
      {editCluster && (
        <ClusterEditModal
          cluster={editCluster}
          onSave={(bm, en) => saveCluster(editCluster.id, bm, en)}
          onClose={() => setEditCluster(null)}
        />
      )}
    </div>
  );
}
