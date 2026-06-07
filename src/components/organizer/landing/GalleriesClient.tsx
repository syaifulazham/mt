"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, Images, ArrowLeft, Upload, Loader2,
  Check, Star, StarOff, X, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Photo = {
  id?: string;
  driveFileId: string;  // repurposed as R2 object key
  thumbUrl: string;
  fullUrl: string;
  description: string;
  order: number;
};

type Gallery = {
  id: string;
  title: string;
  year: number;
  description: string | null;
  coverUrl: string | null;
  photos: Photo[];
};

type UploadedFile = { key: string; url: string; name: string };

// ── Upload status per file ─────────────────────────────────────────────────────

type UploadFile = {
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "done" | "error";
};

// ── Photo upload dialog ───────────────────────────────────────────────────────

function PhotoUploadDialog({
  onAdd,
  onClose,
}: {
  onAdd: (files: UploadedFile[]) => void;
  onClose: () => void;
}) {
  const [files, setFiles]       = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | File[]) {
    const imageFiles = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [
      ...prev,
      ...imageFiles.map((f) => ({
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: "pending" as const,
      })),
    ]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (!files.length) return;
    setUploading(true);
    setError("");

    const BATCH = 5;
    const results: UploadedFile[] = [];

    for (let i = 0; i < files.length; i += BATCH) {
      const batchSlice = files.slice(i, i + BATCH);

      setFiles((prev) =>
        prev.map((f, idx) =>
          idx >= i && idx < i + BATCH ? { ...f, status: "uploading" as const } : f
        )
      );

      const form = new FormData();
      batchSlice.forEach((f) => form.append("files", f.file));

      const res = await fetch("/api/v2/organizer/landing/upload", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Upload failed. Please try again.");
        setUploading(false);
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx >= i && idx < i + BATCH && f.status === "uploading"
              ? { ...f, status: "error" as const }
              : f
          )
        );
        return;
      }

      const data: { files: UploadedFile[] } = await res.json();
      results.push(...data.files);

      setFiles((prev) =>
        prev.map((f, idx) =>
          idx >= i && idx < i + BATCH ? { ...f, status: "done" as const } : f
        )
      );
    }

    setUploading(false);
    onAdd(results);
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-sky-500" /> Upload Photos
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Drag and drop or select images to upload. JPEG, PNG, WebP and GIF are supported.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div className="px-6 pt-4 shrink-0">
          <div
            className={cn(
              "rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 cursor-pointer transition-colors",
              isDragging
                ? "border-sky-400 bg-sky-50"
                : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-zinc-400 mb-2" />
            <p className="text-sm font-medium text-zinc-600">Drop images here or click to browse</p>
            <p className="text-xs text-zinc-400 mt-1">Multiple files supported</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>
        </div>

        {/* Preview grid */}
        {files.length > 0 && (
          <>
            <div className="px-6 pt-3 pb-1 flex items-center justify-between shrink-0">
              <p className="text-xs text-zinc-500">{files.length} file(s) selected</p>
              {!uploading && (
                <button
                  onClick={() => {
                    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
                    setFiles([]);
                  }}
                  className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-3">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {files.map((f, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg overflow-hidden border bg-zinc-100 aspect-square"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.previewUrl} alt={f.file.name} className="w-full h-full object-cover" />

                    {f.status === "uploading" && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                      </div>
                    )}
                    {f.status === "done" && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <Check className="h-6 w-6 text-green-600 drop-shadow" />
                      </div>
                    )}
                    {f.status === "error" && (
                      <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                        <X className="h-6 w-6 text-red-600 drop-shadow" />
                      </div>
                    )}
                    {f.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity shadow"
                      >
                        <X className="h-3 w-3 text-zinc-700" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="px-6 pb-2 text-xs text-red-500 shrink-0">{error}</p>}

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || uploading || pendingCount === 0}>
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Uploading…</>
            ) : (
              <>Upload {pendingCount > 0 ? `${pendingCount} Photo(s)` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Gallery form dialog ───────────────────────────────────────────────────────

function GalleryFormDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Gallery | null;
  onClose: () => void;
  onSaved: (g: Gallery) => void;
}) {
  const isEdit = !!initial?.id;
  const [title, setTitle]   = useState(initial?.title ?? "");
  const [year, setYear]     = useState(String(initial?.year ?? new Date().getFullYear()));
  const [desc, setDesc]     = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const url    = isEdit ? `/api/v2/organizer/landing/galleries/${initial!.id}` : "/api/v2/organizer/landing/galleries";
    const method = isEdit ? "PATCH" : "POST";
    const res    = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, year: Number(year), description: desc }),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) { setError(j.error ?? "Failed to save."); return; }
    onSaved(j);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="pb-2">
          <DialogTitle>{isEdit ? "Edit Gallery" : "New Gallery"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-3 px-1">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="MT2026 Zon Tengah" />
          </div>
          <div className="space-y-2">
            <Label>Year</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
          </div>
          <div className="space-y-2">
            <Label>Description <span className="text-zinc-400 text-xs">(optional)</span></Label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Short description of this gallery…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Gallery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Gallery detail view ───────────────────────────────────────────────────────

function GalleryDetail({
  gallery: initial,
  onBack,
  onUpdated,
}: {
  gallery: Gallery;
  onBack: () => void;
  onUpdated: (g: Gallery) => void;
}) {
  const [gallery, setGallery]       = useState<Gallery>(initial);
  const [photos, setPhotos]         = useState<Photo[]>(initial.photos);
  const [editOpen, setEditOpen]     = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [dirty, setDirty]           = useState(false);

  async function addPhotos(uploaded: UploadedFile[]) {
    const newPhotos: Photo[] = uploaded.map((f, i) => ({
      driveFileId: f.key,
      thumbUrl:    f.url,
      fullUrl:     f.url,
      description: "",
      order:       photos.length + i,
    }));
    const allPhotos = [...photos, ...newPhotos];
    setPhotos(allPhotos);
    setUploadOpen(false);

    // Auto-save immediately so a refresh doesn't lose the uploaded photos
    setSaving(true);
    const res = await fetch(`/api/v2/organizer/landing/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverUrl: gallery.coverUrl, photos: allPhotos }),
    });
    const j = await res.json();
    setSaving(false);
    if (res.ok) { setPhotos(j.photos); setGallery(j); setDirty(false); onUpdated(j); }
    else setDirty(true);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, order: i })));
    if (gallery.coverUrl === photos[idx]?.thumbUrl) {
      setGallery((g) => ({ ...g, coverUrl: null }));
    }
    setDirty(true);
  }

  function setDescription(idx: number, val: string) {
    setPhotos((prev) => prev.map((p, i) => (i === idx ? { ...p, description: val } : p)));
    setDirty(true);
  }

  function setCover(photo: Photo) {
    setGallery((g) => ({ ...g, coverUrl: g.coverUrl === photo.thumbUrl ? null : photo.thumbUrl }));
    setDirty(true);
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    const res = await fetch(`/api/v2/organizer/landing/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverUrl: gallery.coverUrl, photos }),
    });
    const j = await res.json();
    setSaving(false);
    if (res.ok) { setPhotos(j.photos); setGallery(j); setDirty(false); onUpdated(j); }
  }, [gallery, photos, onUpdated]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-zinc-900">{gallery.title}</h2>
            <p className="text-sm text-zinc-500">{gallery.year} · {photos.length} photo(s)</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Info
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Photos
          </Button>
        </div>
      </div>

      {/* Gallery description */}
      {gallery.description && (
        <p className="text-sm text-zinc-600 bg-zinc-50 rounded-lg border px-4 py-3">{gallery.description}</p>
      )}

      {/* Cover indicator */}
      {gallery.coverUrl && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Star className="h-3.5 w-3.5 shrink-0" />
          Cover image is set. Click <Star className="h-3 w-3 inline mx-0.5" /> on a photo to change it.
        </div>
      )}

      {/* Photos grid */}
      {photos.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 flex flex-col items-center justify-center h-52 cursor-pointer hover:border-sky-400 hover:bg-sky-50 transition-colors"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="h-8 w-8 text-zinc-400 mb-2" />
          <p className="text-sm text-zinc-500 font-medium">Upload photos to this gallery</p>
          <p className="text-xs text-zinc-400 mt-1">Drag and drop or click to select images</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo, idx) => {
            const isCover = gallery.coverUrl === photo.thumbUrl;
            return (
              <div key={photo.driveFileId + idx} className="group relative rounded-xl overflow-hidden border bg-white shadow-sm">
                <div className="relative aspect-square overflow-hidden bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbUrl} alt="" className="w-full h-full object-cover" />
                  {isCover && (
                    <div className="absolute top-2 left-2 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Star className="h-2.5 w-2.5" /> Cover
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      title={isCover ? "Remove cover" : "Set as cover"}
                      onClick={() => setCover(photo)}
                      className="h-8 w-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-colors"
                    >
                      {isCover
                        ? <StarOff className="h-4 w-4 text-amber-500" />
                        : <Star    className="h-4 w-4 text-amber-500" />}
                    </button>
                    <button
                      type="button"
                      title="Remove photo"
                      onClick={() => removePhoto(idx)}
                      className="h-8 w-8 rounded-full bg-white/90 hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="px-2 py-1.5">
                  <input
                    type="text"
                    value={photo.description ?? ""}
                    onChange={(e) => setDescription(idx, e.target.value)}
                    placeholder="Add a caption…"
                    className="w-full text-xs bg-transparent border-0 border-b border-transparent focus:border-zinc-300 focus:outline-none py-0.5 text-zinc-700 placeholder:text-zinc-400 transition-colors"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save bar */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="bg-white rounded-xl border shadow-lg px-4 py-3 flex items-center gap-3">
            <p className="text-sm text-zinc-600">Unsaved changes</p>
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </div>
      )}

      {editOpen && (
        <GalleryFormDialog
          initial={gallery}
          onClose={() => setEditOpen(false)}
          onSaved={(g) => { setGallery(g); setEditOpen(false); onUpdated(g); }}
        />
      )}
      {uploadOpen && (
        <PhotoUploadDialog
          onAdd={addPhotos}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </div>
  );
}

// ── Gallery list ──────────────────────────────────────────────────────────────

export function GalleriesClient() {
  const [galleries, setGalleries]   = useState<Gallery[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Gallery | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/v2/organizer/landing/galleries");
    const data = await res.json();
    setGalleries(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    await fetch(`/api/v2/organizer/landing/galleries/${deleteId}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteId(null);
    setGalleries((prev) => prev.filter((g) => g.id !== deleteId));
    if (selected?.id === deleteId) setSelected(null);
  }

  function handleCreated(g: Gallery) {
    setGalleries((prev) => [g, ...prev]);
    setCreateOpen(false);
    setSelected(g);
  }

  function handleUpdated(g: Gallery) {
    setGalleries((prev) => prev.map((x) => (x.id === g.id ? g : x)));
    if (selected?.id === g.id) setSelected(g);
  }

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <GalleryDetail
        gallery={selected}
        onBack={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-100">
            <Images className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Galleries</h1>
            <p className="text-sm text-zinc-500">Manage photo galleries for the landing page.</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Gallery
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
        </div>
      ) : galleries.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center h-48 gap-3">
          <Images className="h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">No galleries yet.</p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create first gallery
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {galleries.map((g) => (
            <div
              key={g.id}
              className="group rounded-xl border bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelected(g)}
            >
              <div className="aspect-video bg-zinc-100 overflow-hidden relative">
                {g.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.coverUrl} alt={g.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : g.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.photos[0].thumbUrl} alt={g.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Images className="h-10 w-10 text-zinc-300" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
              </div>

              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">{g.title}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{g.year} · {g.photos.length} photo(s)</p>
                    {g.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{g.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5 group-hover:text-zinc-600 transition-colors" />
                </div>
              </div>

              <div className="px-4 pb-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 text-xs text-zinc-500 hover:text-zinc-900"
                  onClick={(e) => { e.stopPropagation(); setSelected(g); }}
                >
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={(e) => { e.stopPropagation(); setDeleteId(g.id); }}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <GalleryFormDialog onClose={() => setCreateOpen(false)} onSaved={handleCreated} />
      )}

      {deleteId && (
        <Dialog open onOpenChange={() => setDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" /> Delete Gallery?
              </DialogTitle>
              <DialogDescription>
                This will permanently delete the gallery and all its photos. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
