"use client";

import { useState, useRef } from "react";
import {
  Plus, Save, Trash2, Sparkles, Globe, ExternalLink,
  CheckCircle2, AlertCircle, X, Upload, Eye, EyeOff,
  Search, Newspaper, RefreshCw, Image as ImageIcon,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { NewsArticle } from "@prisma/client";

// ── types ─────────────────────────────────────────────────────────────────────

type DiscoveredArticle = {
  title: string;
  source: string;
  sourceUrl: string;
  publishedDate: string | null;
  summary: string;
};

type FormState = {
  id: string | null;
  title: string;
  source: string;
  sourceUrl: string;
  content: string;
  images: string[];
  isPublished: boolean;
};

const EMPTY_FORM: FormState = {
  id: null, title: "", source: "", sourceUrl: "",
  content: "", images: [], isPublished: false,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

// ── main component ────────────────────────────────────────────────────────────

export function NewsClient({ initialArticles }: { initialArticles: NewsArticle[] }) {
  const [articles, setArticles]         = useState<NewsArticle[]>(initialArticles);
  const [selected, setSelected]         = useState<string | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [dirty, setDirty]               = useState(false);
  const [saving, setSaving]             = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [discovering, setDiscovering]   = useState(false);
  const [discovered, setDiscovered]     = useState<DiscoveredArticle[]>([]);
  const [showDiscover, setShowDiscover] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState("Malaysia Techlympics 2026");
  const [toast, setToast]               = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const updateForm = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
  };

  // ── select article ──────────────────────────────────────────────────────────

  const selectArticle = (a: NewsArticle) => {
    setSelected(a.id);
    setForm({
      id: a.id,
      title: a.title,
      source: a.source ?? "",
      sourceUrl: a.sourceUrl ?? "",
      content: a.content,
      images: a.images ?? [],
      isPublished: a.isPublished,
    });
    setDirty(false);
  };

  const newArticle = () => {
    setSelected("__new__");
    setForm(EMPTY_FORM);
    setDirty(false);
  };

  // ── save ────────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!form.title.trim()) { showToast("Tajuk diperlukan", "err"); return; }
    if (!form.content.trim()) { showToast("Kandungan diperlukan", "err"); return; }
    setSaving(true);
    try {
      const isNew = !form.id || selected === "__new__";
      const url   = isNew ? "/api/v2/organizer/landing/news" : `/api/v2/organizer/landing/news/${form.id}`;
      const res   = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (isNew) {
        setArticles(prev => [data, ...prev]);
        setSelected(data.id);
        setForm(f => ({ ...f, id: data.id }));
      } else {
        setArticles(prev => prev.map(a => a.id === data.id ? data : a));
      }
      setDirty(false);
      showToast(form.isPublished ? "Diterbitkan!" : "Draf disimpan");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal simpan", "err");
    } finally {
      setSaving(false);
    }
  };

  // ── delete ──────────────────────────────────────────────────────────────────

  const deleteArticle = async () => {
    if (!form.id || selected === "__new__") { setSelected(null); setForm(EMPTY_FORM); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/organizer/landing/news/${form.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal padam");
      setArticles(prev => prev.filter(a => a.id !== form.id));
      setSelected(null);
      setForm(EMPTY_FORM);
      showToast("Dipadam");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal padam", "err");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  // ── image upload ────────────────────────────────────────────────────────────

  const uploadImages = async (files: FileList) => {
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append("files", f));
      const res  = await fetch("/api/v2/organizer/landing/news/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const urls = (data.files as { url: string }[]).map(f => f.url);
      updateForm("images", [...form.images, ...urls]);
      showToast(`${urls.length} imej dimuat naik`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload gagal", "err");
    } finally {
      setUploading(false);
    }
  };

  // ── AI discover ─────────────────────────────────────────────────────────────

  const discover = async () => {
    setDiscovering(true);
    setDiscovered([]);
    try {
      const res  = await fetch("/api/v2/organizer/landing/news/ai-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: discoverQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDiscovered(data.articles ?? []);
      if (!data.articles?.length) showToast("Tiada artikel dijumpai", "err");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Carian AI gagal", "err");
    } finally {
      setDiscovering(false);
    }
  };

  const importArticle = (d: DiscoveredArticle) => {
    setSelected("__new__");
    setForm({
      id: null,
      title: d.title,
      source: d.source,
      sourceUrl: d.sourceUrl,
      content: d.summary,
      images: [],
      isPublished: false,
    });
    setDirty(true);
    setShowDiscover(false);
    showToast("Artikel diimport — semak dan terbitkan");
  };

  const published  = articles.filter(a => a.isPublished);
  const drafts     = articles.filter(a => !a.isPublished);

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center gap-2"
          style={{ background: toast.type === "ok" ? "#064e3b" : "#7f1d1d", color: "#fff", minWidth: 220 }}>
          {toast.type === "ok"
            ? <CheckCircle2 size={15} className="text-emerald-300 shrink-0" />
            : <AlertCircle  size={15} className="text-red-300 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Confirm delete */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Padam Artikel</DialogTitle>
            <DialogDescription>Adakah anda pasti ingin memadamkan &quot;{form.title}&quot;? Tindakan ini tidak boleh dibatalkan.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50">Batal</button>
            <button onClick={deleteArticle} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Padam</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Discover dialog */}
      <Dialog open={showDiscover} onOpenChange={setShowDiscover}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" /> Cari Berita dengan AI
            </DialogTitle>
            <DialogDescription>Gemini akan mencari artikel berita berkaitan Malaysia Techlympics menggunakan Google Search.</DialogDescription>
          </DialogHeader>

          <div className="px-6 flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={discoverQuery}
              onChange={e => setDiscoverQuery(e.target.value)}
              placeholder="cth. Malaysia Techlympics 2026"
              onKeyDown={e => e.key === "Enter" && discover()}
            />
            <button
              onClick={discover}
              disabled={discovering}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {discovering ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              {discovering ? "Mencari…" : "Cari"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-3 mt-3">
            {discovered.length === 0 && !discovering && (
              <p className="text-sm text-slate-400 text-center py-8">Klik &quot;Cari&quot; untuk menjumpai artikel berita terkini.</p>
            )}
            {discovered.map((d, i) => (
              <div key={i} className="border rounded-xl p-4 hover:border-purple-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 leading-snug mb-1">{d.title}</p>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{d.source}</span>
                      {d.publishedDate && <span className="text-xs text-slate-400">{formatDate(d.publishedDate)}</span>}
                      {d.sourceUrl && (
                        <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                          <ExternalLink size={10} /> Sumber
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{d.summary}</p>
                  </div>
                  <button
                    onClick={() => importArticle(d)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shrink-0"
                  >
                    <Plus size={12} /> Import
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100">
            <Newspaper className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Berita</h1>
            <p className="text-xs text-zinc-500">{published.length} diterbitkan · {drafts.length} draf</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDiscover(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50"
          >
            <Sparkles size={14} /> Cari dengan AI
          </button>
          <button
            onClick={newArticle}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <Plus size={14} /> Artikel Baru
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: article list ── */}
        <div className="w-72 shrink-0 border-r bg-slate-50 overflow-y-auto">
          {articles.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">
              <p className="mb-2">Tiada artikel.</p>
              <button onClick={() => setShowDiscover(true)} className="text-purple-600 underline text-xs">Cari dengan AI</button>
            </div>
          )}

          {[{ label: "Diterbitkan", items: published }, { label: "Draf", items: drafts }].map(({ label, items }) =>
            items.length === 0 ? null : (
              <div key={label}>
                <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                {items.map(a => (
                  <button
                    key={a.id}
                    onClick={() => selectArticle(a)}
                    className={`w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-white transition-colors ${selected === a.id ? "bg-white border-l-2 border-l-emerald-500" : ""}`}
                  >
                    <p className="text-xs font-semibold text-slate-800 leading-snug truncate mb-0.5">{a.title}</p>
                    <div className="flex items-center gap-2">
                      {a.source && <span className="text-[10px] text-slate-400 truncate">{a.source}</span>}
                      <span className="text-[10px] text-slate-400 ml-auto shrink-0">{formatDate(a.publishedAt ?? a.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* ── Right: editor ── */}
        <div className="flex-1 overflow-y-auto bg-white">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Globe size={40} strokeWidth={1} />
              <p className="text-sm">Pilih artikel atau cipta baru</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tajuk *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.title}
                  onChange={e => updateForm("title", e.target.value)}
                  placeholder="Tajuk berita…"
                />
              </div>

              {/* Source + URL */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Sumber</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.source}
                    onChange={e => updateForm("source", e.target.value)}
                    placeholder="cth. Bernama"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">URL Sumber</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={form.sourceUrl}
                      onChange={e => updateForm("sourceUrl", e.target.value)}
                      placeholder="https://www.thestar.com.my/news/…/article-title"
                    />
                    {form.sourceUrl && (
                      <a href={form.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:text-blue-700">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  {form.sourceUrl && (() => { try { const u = new URL(form.sourceUrl); return u.pathname.replace(/\/+$/, "").length === 0; } catch { return false; } })() && (
                    <p className="mt-1 text-[10px] text-amber-600">URL ini seperti laman utama sahaja — masukkan URL penuh artikel</p>
                  )}
                  {!form.sourceUrl && <p className="mt-1 text-[10px] text-slate-400">Masukkan URL penuh artikel (bukan laman utama)</p>}
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Kandungan *</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={10}
                  value={form.content}
                  onChange={e => updateForm("content", e.target.value)}
                  placeholder="Tulis kandungan berita di sini…"
                />
              </div>

              {/* Images */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Imej (pilihan)</label>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Upload size={12} className={uploading ? "animate-bounce" : ""} />
                    {uploading ? "Memuat naik…" : "Muat Naik"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files?.length && uploadImages(e.target.files)}
                  />
                </div>

                {form.images.length === 0 ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                  >
                    <ImageIcon size={24} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-xs text-slate-400">Klik untuk muat naik imej</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {form.images.map((url, i) => (
                      <div key={i} className="relative group aspect-video rounded-lg overflow-hidden border bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => updateForm("images", form.images.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="aspect-video rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                    >
                      <Plus size={18} className="text-slate-300" />
                    </div>
                  </div>
                )}
              </div>

              {/* Publish toggle */}
              <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-slate-50 border">
                <button
                  onClick={() => updateForm("isPublished", !form.isPublished)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.isPublished ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.isPublished ? "translate-x-4" : "translate-x-1"}`} />
                </button>
                <div>
                  <p className="text-sm font-medium text-slate-700">{form.isPublished ? "Diterbitkan" : "Draf"}</p>
                  <p className="text-xs text-slate-400">{form.isPublished ? "Artikel akan dipaparkan di laman utama" : "Artikel tidak dipaparkan"}</p>
                </div>
                {form.isPublished ? <Eye size={16} className="ml-auto text-emerald-500" /> : <EyeOff size={16} className="ml-auto text-slate-400" />}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between border-t pt-5">
                {form.id && selected !== "__new__" ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Padam
                  </button>
                ) : <div />}
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save size={14} /> {saving ? "Menyimpan…" : form.isPublished ? "Simpan & Terbitkan" : "Simpan Draf"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
