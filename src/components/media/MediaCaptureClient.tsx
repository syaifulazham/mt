"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, ImagePlus, Plus, Loader2, ChevronLeft, LogOut, Trash2, X, RotateCcw, CheckCircle2, AlertCircle, Pencil, Images, Radio,
} from "lucide-react";
import { MediaLiveClient } from "@/components/media/MediaLiveClient";

/* /media/<slug>: the media team creates galleries and uploads photos with the
   endpoint's passcode. Photos are shrunk on the device (long side 2560 px, plus
   a 640 px thumbnail) and uploaded three at a time. API: /api/v2/media/<slug>. */

type Photo = { id: string; thumbUrl: string; fullUrl: string; description: string | null; order: number };
type Gallery = { id: string; title: string; year: number; description: string | null; createdAt: string; photos: Photo[] };
type QueueItem = { key: string; name: string; preview: string; file: File; status: "waiting" | "uploading" | "done" | "error"; progress: number; error?: string };

const PINK = "#db2777";
const FULL_PX = 2560, THUMB_PX = 640, PARALLEL = 3;

/** Resizes an image to fit `max` px (keeps orientation); null when the browser cannot read it. */
async function shrink(file: File, max: number, quality: number): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise(res => canvas.toBlob(b => res(b), "image/jpeg", quality));
  } catch {
    return null;
  }
}

function storeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function storeSet(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } }

export function MediaCaptureClient({ slug }: { slug: string }) {
  const api = `/api/v2/media/${slug}`;
  const storeKey = `media-pass:${slug}`;
  const [info, setInfo] = useState<{ label: string | null; eventName: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [passErr, setPassErr] = useState("");
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const passRef = useRef("");

  const call = useCallback((path: string, init?: RequestInit) =>
    fetch(`${api}${path}`, { ...init, headers: { ...(init?.headers ?? {}), "x-media-passcode": passRef.current } }), [api]);

  const getPass = useCallback(() => passRef.current, []);
  const addPhoto = useCallback((galleryId: string, p: Photo) => {
    setGalleries(prev => prev.map(g => (g.id === galleryId ? { ...g, photos: [...g.photos, p] } : g)));
  }, []);

  const loadGalleries = useCallback(async () => {
    const r = await call("/galleries");
    if (r.ok) setGalleries((await r.json()).data);
  }, [call]);

  const tryPass = useCallback(async (p: string, silent = false) => {
    passRef.current = p;
    const r = await fetch(api, { method: "POST", headers: { "x-media-passcode": p } });
    if (r.ok) {
      storeSet(storeKey, p);
      setAuthed(true); setPassErr("");
      await loadGalleries();
      return true;
    }
    if (!silent) setPassErr(r.status === 404 ? "Pautan ini tidak aktif." : "Passcode salah.");
    storeSet(storeKey, null);
    return false;
  }, [api, storeKey, loadGalleries]);

  useEffect(() => {
    (async () => {
      const r = await fetch(api).catch(() => null);
      if (!r || !r.ok) { setNotFound(true); setChecking(false); return; }
      setInfo(await r.json());
      const saved = storeGet(storeKey);
      if (saved) await tryPass(saved, true);
      setChecking(false);
    })();
  }, [api, storeKey, tryPass]);

  function logout() { storeSet(storeKey, null); passRef.current = ""; setAuthed(false); setPass(""); setGalleries([]); setOpenId(null); }

  const shell = "min-h-dvh bg-zinc-50 text-zinc-900";
  if (checking) return <div className={`${shell} flex items-center justify-center`}><Loader2 className="h-6 w-6 animate-spin" style={{ color: PINK }} /></div>;
  if (notFound) return (
    <div className={`${shell} flex items-center justify-center p-6 text-center`}>
      <div><AlertCircle className="h-8 w-8 mx-auto text-zinc-300 mb-2" /><p className="text-sm text-zinc-500">Pautan media ini tidak wujud atau telah dinyahaktifkan.</p></div>
    </div>
  );

  if (!authed) return (
    <div className={`${shell} flex items-center justify-center p-6`}>
      <form className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-6 space-y-5"
        onSubmit={async e => { e.preventDefault(); setChecking(true); await tryPass(pass.trim()); setChecking(false); }}>
        <div className="text-center space-y-1">
          <div className="mx-auto h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: `${PINK}15` }}>
            <Camera className="h-6 w-6" style={{ color: PINK }} />
          </div>
          <p className="text-base font-bold">Media</p>
          <p className="text-sm text-zinc-500">{info?.eventName}{info?.label ? ` · ${info.label}` : ""}</p>
        </div>
        <input value={pass} onChange={e => setPass(e.target.value.toUpperCase())} autoFocus inputMode="text" autoCapitalize="characters"
          autoComplete="one-time-code" placeholder="PASSCODE"
          className="w-full h-14 rounded-xl border text-center text-2xl font-bold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-pink-200" />
        {passErr && <p className="text-sm text-red-600 text-center">{passErr}</p>}
        <button type="submit" disabled={pass.trim().length < 6}
          className="w-full h-12 rounded-xl text-white font-semibold disabled:opacity-40" style={{ background: PINK }}>Masuk</button>
      </form>
    </div>
  );

  const open = galleries.find(g => g.id === openId) ?? null;
  return (
    <div className={shell}>
      {liveMode
        ? <MediaLiveClient call={call} onBack={() => setLiveMode(false)} />
        : open
        ? <GalleryView api={api} getPass={getPass} gallery={open} call={call}
            onBack={() => setOpenId(null)}
            onChange={g => setGalleries(prev => prev.map(x => (x.id === g.id ? g : x)))}
            onPhotoAdded={addPhoto}
            onDeleted={() => { setGalleries(prev => prev.filter(x => x.id !== open.id)); setOpenId(null); }} />
        : <GalleryList info={info!} galleries={galleries} call={call} onLogout={logout}
            onCreated={g => { setGalleries(prev => [g, ...prev]); setOpenId(g.id); }}
            onOpen={setOpenId} onLive={() => setLiveMode(true)} />}
    </div>
  );
}

/* ── Galleries ──────────────────────────────────────────────────────────── */

function GalleryList({ info, galleries, call, onCreated, onOpen, onLogout, onLive }: {
  info: { label: string | null; eventName: string }; galleries: Gallery[];
  call: (p: string, i?: RequestInit) => Promise<Response>;
  onCreated: (g: Gallery) => void; onOpen: (id: string) => void; onLogout: () => void; onLive: () => void;
}) {
  const today = new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(`${info.eventName} — ${today}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setBusy(true); setErr("");
    const r = await call("/galleries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.message ?? "Gagal mencipta galeri."); return; }
    setCreating(false);
    onCreated(j.data);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-zinc-50/90 backdrop-blur flex items-center gap-3 border-b">
        <Camera className="h-5 w-5 shrink-0" style={{ color: PINK }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{info.eventName}</p>
          <p className="text-[11px] text-zinc-500 truncate">{info.label ?? "Media"} · {galleries.length} galeri</p>
        </div>
        <button onClick={onLogout} className="text-zinc-400 p-1" aria-label="Keluar"><LogOut className="h-5 w-5" /></button>
      </header>

      <div className="pt-4 space-y-4">
        {creating ? (
          <div className="bg-white rounded-2xl border p-4 space-y-3">
            <p className="text-sm font-semibold">Galeri baharu</p>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus maxLength={150}
              className="w-full h-12 rounded-xl border px-3 text-base focus:outline-none focus:ring-2 focus:ring-pink-200" />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)} className="h-12 px-4 rounded-xl border text-sm font-medium">Batal</button>
              <button onClick={create} disabled={busy || !title.trim()}
                className="flex-1 h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: PINK }}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />} Cipta &amp; mula ambil gambar
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full h-16 rounded-2xl text-white text-base font-semibold flex items-center justify-center gap-2 shadow-sm active:scale-[.99]" style={{ background: PINK }}>
            <Plus className="h-6 w-6" /> Galeri baharu
          </button>
        )}

        <button onClick={onLive}
          className="w-full h-12 rounded-2xl border-2 border-red-200 bg-white text-sm font-semibold text-red-600 flex items-center justify-center gap-2 active:scale-[.99]">
          <Radio className="h-5 w-5" /> Siaran langsung duel
        </button>

        {galleries.length === 0 ? (
          <p className="text-center text-sm text-zinc-400 py-10">Belum ada galeri. Cipta satu untuk mula.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {galleries.map(g => (
              <button key={g.id} onClick={() => onOpen(g.id)} className="text-left bg-white rounded-2xl border overflow-hidden active:scale-[.99]">
                <div className="aspect-[4/3] bg-zinc-100 flex items-center justify-center">
                  {g.photos[0]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={g.photos[0].thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    : <Images className="h-8 w-8 text-zinc-300" />}
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-semibold leading-snug line-clamp-2">{g.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{g.photos.length} foto</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── One gallery: capture, upload, review ───────────────────────────────── */

function GalleryView({ api, getPass, gallery, call, onBack, onChange, onPhotoAdded, onDeleted }: {
  api: string; getPass: () => string;
  /** Appends to the latest state, so parallel uploads never overwrite each other. */
  onPhotoAdded: (galleryId: string, p: Photo) => void;
  gallery: Gallery; call: (p: string, i?: RequestInit) => Promise<Response>;
  onBack: () => void; onChange: (g: Gallery) => void; onDeleted: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(gallery.title);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const gid = gallery.id;
  const running = useRef(0);

  const patchItem = (key: string, p: Partial<QueueItem>) => setQueue(q => q.map(x => (x.key === key ? { ...x, ...p } : x)));

  const upload = useCallback(async (item: QueueItem) => {
    patchItem(item.key, { status: "uploading", progress: 0, error: undefined });
    const [full, thumb] = await Promise.all([shrink(item.file, FULL_PX, 0.85), shrink(item.file, THUMB_PX, 0.75)]);
    const form = new FormData();
    form.append("full", full ?? item.file, full ? "photo.jpg" : item.file.name);
    if (thumb) form.append("thumb", thumb, "thumb.jpg");
    await new Promise<void>(resolve => {
      // XHR rather than fetch, for upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${api}/galleries/${gid}/photos`);
      xhr.setRequestHeader("x-media-passcode", getPass());
      xhr.upload.onprogress = e => { if (e.lengthComputable) patchItem(item.key, { progress: Math.round((e.loaded / e.total) * 100) }); };
      xhr.onload = () => {
        if (xhr.status === 201) {
          onPhotoAdded(gid, JSON.parse(xhr.responseText).data as Photo);
          patchItem(item.key, { status: "done", progress: 100 });
          setTimeout(() => setQueue(q => q.filter(x => x.key !== item.key)), 1500);
        } else {
          let msg = "Gagal dimuat naik";
          try { msg = JSON.parse(xhr.responseText).message ?? msg; } catch { /* keep default */ }
          patchItem(item.key, { status: "error", error: msg });
        }
        resolve();
      };
      xhr.onerror = () => { patchItem(item.key, { status: "error", error: "Tiada sambungan" }); resolve(); };
      xhr.send(form);
    });
  }, [api, gid, getPass, onPhotoAdded]);

  // Feed the queue, PARALLEL at a time.
  useEffect(() => {
    const free = PARALLEL - running.current;
    const next = queue.filter(x => x.status === "waiting").slice(0, Math.max(0, free));
    for (const item of next) {
      running.current++;
      patchItem(item.key, { status: "uploading" });
      void upload(item).finally(() => { running.current--; setQueue(q => [...q]); });
    }
  }, [queue, upload]);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const items = Array.from(list).filter(f => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).map(f => ({
      key: `${Date.now()}-${Math.random()}`, name: f.name, preview: URL.createObjectURL(f), file: f,
      status: "waiting" as const, progress: 0,
    }));
    setQueue(q => [...q, ...items]);
  }

  async function saveTitle() {
    setRenaming(false);
    if (!title.trim() || title === gallery.title) { setTitle(gallery.title); return; }
    const r = await call(`/galleries/${gallery.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    if (r.ok) onChange({ ...gallery, title: title.trim() }); else setTitle(gallery.title);
  }

  async function deleteGallery() {
    if (!confirm("Padam galeri kosong ini?")) return;
    const r = await call(`/galleries/${gallery.id}`, { method: "DELETE" });
    if (r.ok) onDeleted();
  }

  const uploading = queue.filter(x => x.status === "waiting" || x.status === "uploading").length;
  const failed = queue.filter(x => x.status === "error");

  return (
    <div className="max-w-2xl mx-auto px-4 pb-32">
      <header className="sticky top-0 z-10 -mx-4 px-2 py-2 bg-zinc-50/90 backdrop-blur flex items-center gap-1 border-b">
        <button aria-label="Kembali" className="p-2 text-zinc-500"
          onClick={() => { if (!uploading || confirm(`${uploading} foto masih dimuat naik. Keluar juga? Foto yang belum dimuat naik akan dibatalkan.`)) onBack(); }}>
          <ChevronLeft className="h-6 w-6" />
        </button>
        {renaming ? (
          <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} autoFocus maxLength={150}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="flex-1 h-10 rounded-lg border px-2 text-base" />
        ) : (
          <button onClick={() => setRenaming(true)} className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold truncate flex items-center gap-1.5">{gallery.title} <Pencil className="h-3 w-3 text-zinc-400 shrink-0" /></p>
            <p className="text-[11px] text-zinc-500">{gallery.photos.length} foto{uploading ? ` · memuat naik ${uploading}` : ""}</p>
          </button>
        )}
        {gallery.photos.length === 0 && queue.length === 0 && (
          <button onClick={deleteGallery} className="p-2 text-zinc-400" aria-label="Padam galeri"><Trash2 className="h-5 w-5" /></button>
        )}
      </header>

      {/* Upload queue */}
      {queue.length > 0 && (
        <div className="pt-3 space-y-2">
          {failed.length > 0 && (
            <button onClick={() => setQueue(q => q.map(x => (x.status === "error" ? { ...x, status: "waiting" } : x)))}
              className="w-full h-10 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4" /> Cuba semula {failed.length} foto gagal
            </button>
          )}
          <div className="grid grid-cols-4 gap-2">
            {queue.map(x => (
              <div key={x.key} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.preview} alt="" className={`h-full w-full object-cover ${x.status === "done" ? "" : "opacity-60"}`} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {x.status === "done" ? <CheckCircle2 className="h-7 w-7 text-white drop-shadow" />
                    : x.status === "error" ? <AlertCircle className="h-7 w-7 text-red-500 drop-shadow" />
                    : <span className="text-xs font-bold text-white drop-shadow">{x.status === "waiting" ? "…" : `${x.progress}%`}</span>}
                </div>
                {x.status === "uploading" && (
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-black/20"><div className="h-full" style={{ width: `${x.progress}%`, background: PINK }} /></div>
                )}
                {x.status === "error" && (
                  <button onClick={() => setQueue(q => q.filter(y => y.key !== x.key))} className="absolute top-0.5 right-0.5 bg-black/50 rounded-full p-0.5" aria-label="Buang">
                    <X className="h-3 w-3 text-white" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      {gallery.photos.length === 0 && queue.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Camera className="h-10 w-10 mx-auto text-zinc-300" />
          <p className="text-sm text-zinc-500">Belum ada foto. Tekan butang di bawah untuk mula.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 pt-3">
          {[...gallery.photos].reverse().map(p => (
            <button key={p.id} onClick={() => setViewing(p)} className="aspect-square rounded-lg overflow-hidden bg-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt={p.description ?? ""} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* Capture bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-2">
          <button onClick={() => cameraRef.current?.click()}
            className="h-14 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 active:scale-[.98]" style={{ background: PINK }}>
            <Camera className="h-6 w-6" /> Ambil gambar
          </button>
          <button onClick={() => pickRef.current?.click()}
            className="h-14 rounded-2xl border-2 font-semibold flex items-center justify-center gap-2 active:scale-[.98]" style={{ borderColor: PINK, color: PINK }}>
            <ImagePlus className="h-6 w-6" /> Pilih dari peranti
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={pickRef} type="file" accept="image/*" multiple hidden
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {viewing && (
        <PhotoSheet photo={viewing} galleryId={gallery.id} call={call} onClose={() => setViewing(null)}
          onSaved={p => onChange({ ...gallery, photos: gallery.photos.map(x => (x.id === p.id ? p : x)) })}
          onDeleted={id => { onChange({ ...gallery, photos: gallery.photos.filter(x => x.id !== id) }); setViewing(null); }} />
      )}
    </div>
  );
}

function PhotoSheet({ photo, galleryId, call, onClose, onSaved, onDeleted }: {
  photo: Photo; galleryId: string; call: (p: string, i?: RequestInit) => Promise<Response>;
  onClose: () => void; onSaved: (p: Photo) => void; onDeleted: (id: string) => void;
}) {
  const [caption, setCaption] = useState(photo.description ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await call(`/galleries/${galleryId}/photos/${photo.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: caption }),
    });
    setBusy(false);
    if (r.ok) { onSaved({ ...photo, description: caption.trim() || null }); onClose(); }
  }
  async function remove() {
    if (!confirm("Padam foto ini?")) return;
    setBusy(true);
    const r = await call(`/galleries/${galleryId}/photos/${photo.id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onDeleted(photo.id);
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex justify-end p-3"><button className="text-white p-1" aria-label="Tutup"><X className="h-6 w-6" /></button></div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-2" onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.fullUrl} alt={photo.description ?? ""} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="bg-white p-4 space-y-3 pb-[max(16px,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Kapsyen (pilihan)" maxLength={300}
          className="w-full h-12 rounded-xl border px-3 text-base focus:outline-none focus:ring-2 focus:ring-pink-200" />
        <div className="flex gap-2">
          <button onClick={remove} disabled={busy} className="h-12 px-4 rounded-xl border border-red-200 text-red-600 flex items-center gap-1.5 text-sm font-medium">
            <Trash2 className="h-4 w-4" /> Padam
          </button>
          <button onClick={save} disabled={busy} className="flex-1 h-12 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: PINK }}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
