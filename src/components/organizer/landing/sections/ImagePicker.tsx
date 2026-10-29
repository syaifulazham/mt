"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Images, Link2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SectionImage } from "@/lib/landingSections";

type Photo = { id: string; thumbUrl: string; fullUrl: string; description: string | null };
type Gallery = { id: string; title: string; year: number; coverUrl: string | null; photos: Photo[] };

const TABS = [
  { key: "gallery", label: "Galleries", icon: Images },
  { key: "upload", label: "Upload", icon: Upload },
  { key: "url", label: "Image URL", icon: Link2 },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Galleries are fetched once per page load and shared by every picker.
let galleryCache: Promise<Gallery[]> | null = null;
function loadGalleries() {
  galleryCache ??= fetch("/api/v2/organizer/landing/galleries")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch((e) => { galleryCache = null; throw e; });
  return galleryCache;
}

const bestUrl = (p: Photo) => (p.fullUrl?.startsWith("https://") ? p.fullUrl : p.thumbUrl);

type PickerProps = {
  open: boolean;
  onClose: () => void;
  multiple?: boolean;
  onPick: (images: SectionImage[]) => void;
};

/** Mounted only while open, so each opening starts with a clean selection. */
export function ImagePicker(props: PickerProps) {
  return props.open ? <PickerDialog {...props} /> : null;
}

function PickerDialog({ open, onClose, multiple = false, onPick }: PickerProps) {
  const [tab, setTab] = useState<Tab>("gallery");
  const [galleries, setGalleries] = useState<Gallery[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SectionImage[]>([]);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadGalleries().then(setGalleries).catch((e) => setLoadErr(e instanceof Error ? e.message : "Failed to load galleries"));
  }, []);

  const gallery = galleries?.find((g) => g.id === galleryId) ?? null;

  function toggle(img: SectionImage) {
    if (!multiple) { onPick([img]); onClose(); return; }
    setSelected((s) => (s.some((x) => x.url === img.url) ? s.filter((x) => x.url !== img.url) : [...s, img]));
  }

  async function upload(files: FileList) {
    setUploading(true); setUploadErr("");
    try {
      const fd = new FormData();
      Array.from(files).slice(0, multiple ? 20 : 1).forEach((f) => fd.append("files", f));
      const res = await fetch("/api/v2/organizer/landing/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      const imgs: SectionImage[] = (j.files as { url: string; name: string }[]).map((f) => ({
        url: f.url, alt: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), caption: "",
      }));
      onPick(imgs); onClose();
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const urlOk = /^https?:\/\/\S+$/i.test(url.trim()) || /^\/[^/]\S*$/.test(url.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !uploading) onClose(); }}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>{multiple ? "Add images" : "Choose an image"}</DialogTitle>
          <DialogDescription className="text-xs">Pick from the photo galleries, upload a file, or paste a link.</DialogDescription>
          <div className="mt-3 flex gap-1 rounded-lg bg-zinc-100 p-1 w-fit">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[320px]">
          {tab === "gallery" && (
            !galleries ? (
              <div className="flex h-60 items-center justify-center text-sm text-zinc-400">
                {loadErr ? <span className="text-red-600">{loadErr}</span> : <Loader2 className="h-5 w-5 animate-spin" />}
              </div>
            ) : !gallery ? (
              galleries.length === 0 ? (
                <p className="py-16 text-center text-sm text-zinc-400">No galleries yet. Add photos under Landing Page → Galleries.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {galleries.map((g) => {
                    const cover = g.coverUrl ?? g.photos[0]?.thumbUrl;
                    return (
                      <button key={g.id} type="button" onClick={() => setGalleryId(g.id)} disabled={!g.photos.length}
                        className="group overflow-hidden rounded-lg border bg-white text-left transition hover:border-sky-300 hover:shadow disabled:opacity-50">
                        <div className="aspect-video bg-zinc-100">
                          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Images className="m-auto mt-6 h-6 w-6 text-zinc-300" />}
                        </div>
                        <div className="px-3 py-2">
                          <p className="truncate text-xs font-semibold text-zinc-800">{g.title}</p>
                          <p className="text-[11px] text-zinc-400">{g.year} · {g.photos.length} photos</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <div>
                <button type="button" onClick={() => setGalleryId(null)} className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
                  <ArrowLeft className="h-3.5 w-3.5" /> All galleries
                </button>
                <p className="mb-3 text-sm font-semibold text-zinc-800">{gallery.title} <span className="font-normal text-zinc-400">({gallery.year})</span></p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {gallery.photos.map((p) => {
                    const img: SectionImage = { url: bestUrl(p), alt: p.description ?? gallery.title, caption: "" };
                    const on = selected.some((s) => s.url === img.url);
                    return (
                      <button key={p.id} type="button" onClick={() => toggle(img)} title={p.description ?? ""}
                        className={`relative aspect-square overflow-hidden rounded-md border-2 transition ${on ? "border-sky-500" : "border-transparent hover:border-sky-200"}`}>
                        <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {on && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white"><Check className="h-3 w-3" /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {tab === "upload" && (
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
              className="flex h-60 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100">
              {uploading ? <Loader2 className="h-7 w-7 animate-spin text-zinc-400" /> : <Upload className="h-7 w-7 text-zinc-400" />}
              <p className="mt-2 text-sm font-medium text-zinc-600">{uploading ? "Uploading…" : "Drop an image here or click to browse"}</p>
              <p className="mt-1 text-xs text-zinc-400">JPEG, PNG, WebP or GIF{multiple ? " · several at once" : ""}</p>
              {uploadErr && <p className="mt-2 text-xs text-red-600">{uploadErr}</p>}
              <input ref={fileRef} type="file" accept="image/*" multiple={multiple} className="hidden"
                onChange={(e) => e.target.files?.length && upload(e.target.files)} />
            </div>
          )}

          {tab === "url" && (
            <div className="space-y-3">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/photo.jpg" />
              {urlOk && <img src={url.trim()} alt="" className="max-h-64 rounded-lg border" />}
              <Button type="button" disabled={!urlOk} onClick={() => { onPick([{ url: url.trim(), alt: "", caption: "" }]); onClose(); }}>
                Use this image
              </Button>
            </div>
          )}
        </div>

        {multiple && tab === "gallery" && (
          <DialogFooter className="border-t px-6 py-3 shrink-0">
            <span className="mr-auto self-center text-xs text-zinc-500">{selected.length} selected</span>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" disabled={!selected.length} onClick={() => { onPick(selected); onClose(); }}>
              Add {selected.length || ""} image{selected.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
