"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Loader2, Upload, Link, X } from "lucide-react";
import { PushKbButton } from "./PushKbButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "./DeleteDialog";

type Theme = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  description: string | null;
};

const PAGE_SIZE = 20;

const EMPTY_FORM = {
  name:        "",
  color:       "#3B82F6",
  logoUrl:     "",
  description: "",
};

export function ThemesTab() {
  const [data, setData]       = useState<Theme[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState("");
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<Theme | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  // Logo input mode: "url" | "upload"
  const [logoMode, setLogoMode]       = useState<"url" | "upload">("url");
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewUrl, setPreviewUrl]   = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Theme | null>(null);
  const [loadError, setLoadError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
      const res = await fetch(`/api/v2/organizer/reference-data/themes?${params}`);
      if (!res.ok) {
        let msg = `Failed to load (${res.status})`;
        try { const j = await res.json(); msg = j.error ?? msg; } catch { /* HTML body */ }
        setLoadError(msg);
        return;
      }
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load themes");
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setLogoMode("url");
    setPreviewUrl("");
    setUploadError("");
    setFormOpen(true);
  }

  function openEdit(t: Theme) {
    setEditing(t);
    setForm({
      name:        t.name,
      color:       t.color       ?? "#3B82F6",
      logoUrl:     t.logoUrl     ?? "",
      description: t.description ?? "",
    });
    setFormError("");
    setLogoMode(t.logoUrl ? "url" : "url");
    setPreviewUrl(t.logoUrl ?? "");
    setUploadError("");
    setFormOpen(true);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview immediately
    setPreviewUrl(URL.createObjectURL(file));
    setUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v2/organizer/reference-data/themes/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error === "FILE_TOO_LARGE" ? "File must be under 2 MB."
          : json.error === "INVALID_TYPE" ? "Only JPEG, PNG, GIF, SVG, or WebP allowed."
          : json.error;
        setUploadError(msg);
        setPreviewUrl("");
        return;
      }
      setForm(f => ({ ...f, logoUrl: json.url }));
      setPreviewUrl(json.url);
    } catch {
      setUploadError("Upload failed. Please try again.");
      setPreviewUrl("");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearLogo() {
    setForm(f => ({ ...f, logoUrl: "" }));
    setPreviewUrl("");
    setUploadError("");
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError("Theme name is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const url    = editing
        ? `/api/v2/organizer/reference-data/themes/${editing.id}`
        : `/api/v2/organizer/reference-data/themes`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        form.name,
          color:       form.color       || undefined,
          logoUrl:     form.logoUrl     || undefined,
          description: form.description || undefined,
        }),
      });
      if (!res.ok) {
        let msg = `Save failed (${res.status})`;
        try {
          const j = await res.json();
          msg = j.error === "NAME_TAKEN" ? "Theme name already exists."
              : j.error ?? msg;
        } catch { /* non-JSON body (e.g. 500 HTML) */ }
        throw new Error(msg);
      }
      setFormOpen(false);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/reference-data/themes/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json();
      throw new Error(j.error === "HAS_DEPENDENTS" ? "Cannot delete: theme is used by contests." : j.error);
    }
    load();
  }

  const pages = Math.ceil(total / PAGE_SIZE);
  const effectivePreview = previewUrl || form.logoUrl;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search themes…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />Add Theme
        </Button>
        <PushKbButton entityType="reference/themes" label="Themes" />
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="px-3 py-2 w-10"></th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Name</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Description</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Logo</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            )}
            {!loading && loadError && (
              <tr><td colSpan={5} className="px-3 py-8 text-center">
                <p className="text-red-500 text-sm mb-2">{loadError}</p>
                <Button variant="outline" size="sm" onClick={() => load()}>Retry</Button>
              </td></tr>
            )}
            {!loading && !loadError && data.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-400">No themes found.</td></tr>
            )}
            {!loading && data.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="px-3 py-2">
                  <div
                    className="w-6 h-6 rounded-full border border-zinc-200 flex-shrink-0"
                    style={{ backgroundColor: t.color ?? "#e4e4e7" }}
                  />
                </td>
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2 text-zinc-500 max-w-[220px] truncate">
                  {t.description ?? <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2">
                  {t.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logoUrl} alt={t.name} className="h-7 w-7 object-contain rounded" />
                  ) : (
                    <span className="text-zinc-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(t)} className="p-1 rounded hover:bg-zinc-100">
                      <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                    </button>
                    <button onClick={() => setDeleteTarget(t)} className="p-1 rounded hover:bg-zinc-100">
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-zinc-500">
          <span>{total} themes</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 py-1">{page}/{pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Theme" : "Add Competition Theme"}</DialogTitle>
          </DialogHeader>

          <div className="px-6 space-y-4">
            {/* Name */}
            <div>
              <Label>Theme Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Green Technology"
                className="mt-1"
              />
            </div>

            {/* Colour */}
            <div>
              <Label>Colour</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                  className="h-9 w-12 rounded-md border border-input cursor-pointer p-0.5"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                  placeholder="#3B82F6"
                  className="font-mono flex-1"
                  maxLength={7}
                />
              </div>
            </div>

            {/* Logo */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Logo <span className="text-zinc-400 font-normal">(optional)</span></Label>
                {/* Toggle */}
                <div className="flex rounded-md border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => { setLogoMode("url"); setUploadError(""); }}
                    className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${logoMode === "url" ? "bg-zinc-800 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50"}`}
                  >
                    <Link className="h-3 w-3" />URL
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLogoMode("upload"); setUploadError(""); }}
                    className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${logoMode === "upload" ? "bg-zinc-800 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50"}`}
                  >
                    <Upload className="h-3 w-3" />Upload
                  </button>
                </div>
              </div>

              {logoMode === "url" ? (
                <Input
                  value={form.logoUrl}
                  onChange={(e) => { setForm(f => ({ ...f, logoUrl: e.target.value })); setPreviewUrl(e.target.value); }}
                  placeholder="https://…"
                />
              ) : (
                <div>
                  <div
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-zinc-50 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-400" />
                    ) : (
                      <>
                        <Upload className="h-6 w-6 mx-auto text-zinc-300 mb-1" />
                        <p className="text-xs text-zinc-500">Click to choose image</p>
                        <p className="text-xs text-zinc-400">JPEG · PNG · GIF · SVG · WebP · max 2 MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
                </div>
              )}

              {/* Logo preview */}
              {effectivePreview && (
                <div className="mt-2 flex items-center gap-2 p-2 rounded-md border bg-zinc-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={effectivePreview}
                    alt="logo preview"
                    className="h-10 w-10 object-contain rounded"
                    onError={() => setPreviewUrl("")}
                  />
                  <p className="flex-1 text-xs text-zinc-500 truncate">{form.logoUrl}</p>
                  <button type="button" onClick={clearLogo} className="p-1 rounded hover:bg-zinc-200">
                    <X className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <Label>Description <span className="text-zinc-400 font-normal">(optional)</span></Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of the theme…"
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Live preview */}
            {form.name && (
              <div className="rounded-lg border p-3 flex items-center gap-3 bg-zinc-50">
                {effectivePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={effectivePreview} alt="logo" className="h-9 w-9 object-contain rounded flex-shrink-0" onError={() => setPreviewUrl("")} />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex-shrink-0 border border-zinc-200"
                    style={{ backgroundColor: form.color || "#e4e4e7" }}
                  />
                )}
                <div>
                  <p className="text-sm font-medium">{form.name}</p>
                  {form.description && <p className="text-xs text-zinc-400 truncate max-w-[220px]">{form.description}</p>}
                </div>
              </div>
            )}
          </div>

          {formError && <p className="text-sm text-red-500 px-6 mt-1">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete theme "${deleteTarget?.name}"?`}
        description="This will permanently remove the theme."
      />
    </div>
  );
}
