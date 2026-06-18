"use client";

import { useState, useRef } from "react";
import {
  Megaphone, Plus, Pencil, Trash2, Loader2, AlertTriangle,
  Eye, EyeOff, Upload, Link, X, ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type Announcement = {
  id: string;
  title: string;
  content: string;
  coverUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Cover photo picker ────────────────────────────────────────────────────────

function CoverPhotoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [tab,      setTab]      = useState<"upload" | "url">("upload");
  const [urlInput, setUrlInput] = useState(value.startsWith("http") ? value : "");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [preview,  setPreview]  = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true); setUploadErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/v2/organizer/landing/announcements/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setPreview(data.url);
      onChange(data.url);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  }

  function applyUrl() {
    const u = urlInput.trim();
    if (!u) return;
    setPreview(u);
    onChange(u);
  }

  function clearCover() {
    setPreview("");
    setUrlInput("");
    onChange("");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "upload" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
        <button
          type="button"
          onClick={() => setTab("url")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "url" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <Link className="h-3.5 w-3.5" /> URL
        </button>
      </div>

      {tab === "upload" && (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors cursor-pointer h-32 ${
            uploading ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 hover:border-blue-400 hover:bg-blue-50/30"
          }`}
        >
          {uploading
            ? <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            : <><Upload className="h-6 w-6 text-zinc-300" /><p className="text-xs text-zinc-400">Click or drag image here</p></>}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {tab === "url" && (
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyUrl())}
            placeholder="https://example.com/image.jpg"
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={applyUrl} disabled={!urlInput.trim()}>
            Apply
          </Button>
        </div>
      )}

      {uploadErr && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{uploadErr}
        </p>
      )}

      {/* Preview */}
      {preview && (
        <div className="relative rounded-lg overflow-hidden border border-zinc-200 h-36 bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Cover preview" className="w-full h-full object-cover" onError={() => setPreview("")} />
          <button
            type="button"
            onClick={clearCover}
            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!preview && (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-200 h-20 bg-zinc-50">
          <div className="flex items-center gap-2 text-zinc-300">
            <ImageIcon className="h-5 w-5" />
            <span className="text-xs">No cover photo</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add / Edit dialog ─────────────────────────────────────────────────────────

type FormState = { title: string; content: string; coverUrl: string; isPublished: boolean };

function AnnouncementDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Announcement;
  onClose: () => void;
  onSaved: (a: Announcement) => void;
}) {
  const [form, setForm] = useState<FormState>({
    title:       initial?.title       ?? "",
    content:     initial?.content     ?? "",
    coverUrl:    initial?.coverUrl    ?? "",
    isPublished: initial?.isPublished ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const isEdit = !!initial;

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are required.");
      return;
    }
    setSaving(true); setError("");
    try {
      const url    = isEdit
        ? `/api/v2/organizer/landing/announcements/${initial.id}`
        : "/api/v2/organizer/landing/announcements";
      const method = isEdit ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-amber-500" />
            {isEdit ? "Edit Announcement" : "New Announcement"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div>
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Announcement title…"
              className="mt-1"
            />
          </div>

          {/* Content */}
          <div>
            <Label>Content <span className="text-red-500">*</span></Label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder="Write the announcement content…"
              rows={6}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          {/* Cover photo */}
          <div>
            <Label className="mb-2 block">Cover Photo</Label>
            <CoverPhotoPicker
              value={form.coverUrl}
              onChange={(url) => setForm((p) => ({ ...p, coverUrl: url }))}
            />
          </div>

          {/* Published toggle */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Published</p>
              <p className="text-xs text-zinc-500">Visible on the landing page when enabled</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, isPublished: !p.isPublished }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                form.isPublished ? "bg-green-500" : "bg-zinc-300"
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                form.isPublished ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />{error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.content.trim()} className="gap-1.5">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : isEdit ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirmation dialog ────────────────────────────────────────────────

function DeleteDialog({
  announcement,
  onClose,
  onDeleted,
}: {
  announcement: Announcement;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState("");

  async function handleDelete() {
    setDeleting(true); setError("");
    try {
      const res = await fetch(`/api/v2/organizer/landing/announcements/${announcement.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      onDeleted(announcement.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !deleting && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> Delete Announcement
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Delete <span className="font-semibold">&quot;{announcement.title}&quot;</span>? This cannot be undone.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" disabled={deleting} onClick={handleDelete} className="gap-1.5">
            {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4" /> Delete</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Toggle published ──────────────────────────────────────────────────────────

async function togglePublish(a: Announcement): Promise<Announcement> {
  const res = await fetch(`/api/v2/organizer/landing/announcements/${a.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isPublished: !a.isPublished }),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

// ── Main client ───────────────────────────────────────────────────────────────

export function AnnouncementsClient({ initial }: { initial: Announcement[] }) {
  const [items, setItems]     = useState<Announcement[]>(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  function handleSaved(a: Announcement) {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === a.id);
      return idx >= 0 ? prev.map((x) => x.id === a.id ? a : x) : [a, ...prev];
    });
    setAddOpen(false);
    setEditing(null);
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    setDeleting(null);
  }

  async function handleToggle(a: Announcement) {
    setToggling(a.id);
    try {
      const updated = await togglePublish(a);
      setItems((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    } catch { /* silently ignore */ }
    finally { setToggling(null); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-100">
            <Megaphone className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Announcements</h1>
            <p className="text-sm text-zinc-500">Manage announcements displayed on the landing page.</p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Announcement
        </Button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 flex flex-col items-center justify-center gap-3 py-16">
          <Megaphone className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-500">No announcements yet</p>
            <p className="text-xs text-zinc-400 mt-0.5">Create one to display it on the landing page.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5 mt-1">
            <Plus className="h-3.5 w-3.5" /> New Announcement
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden divide-y">
          {items.map((a) => (
            <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors">

              {/* Cover thumbnail */}
              <div className="shrink-0 h-16 w-24 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100 flex items-center justify-center">
                {a.coverUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.coverUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  : <ImageIcon className="h-5 w-5 text-zinc-300" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-zinc-900 truncate">{a.title}</p>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                    a.isPublished
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                  }`}>
                    {a.isPublished ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {a.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 line-clamp-2">{a.content}</p>
                <p className="text-[11px] text-zinc-400">
                  {new Date(a.createdAt).toLocaleDateString("en-MY", { year: "numeric", month: "short", day: "numeric" })}
                  {a.publishedAt && ` · Published ${new Date(a.publishedAt).toLocaleDateString("en-MY", { month: "short", day: "numeric" })}`}
                </p>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1">
                <button
                  onClick={() => handleToggle(a)}
                  disabled={toggling === a.id}
                  title={a.isPublished ? "Unpublish" : "Publish"}
                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                    a.isPublished
                      ? "text-green-600 hover:bg-green-50"
                      : "text-zinc-400 hover:bg-zinc-100"
                  }`}
                >
                  {toggling === a.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : a.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setEditing(a)}
                  title="Edit"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleting(a)}
                  title="Delete"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {addOpen   && <AnnouncementDialog onClose={() => setAddOpen(false)} onSaved={handleSaved} />}
      {editing   && <AnnouncementDialog initial={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
      {deleting  && <DeleteDialog announcement={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} />}
    </div>
  );
}
