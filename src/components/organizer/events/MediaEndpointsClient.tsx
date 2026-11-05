"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowLeft, Camera, Plus, Loader2, Copy, Check, Eye, EyeOff, RefreshCw, Trash2, ExternalLink, Images, Share2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ShareMenu } from "@/components/organizer/landing/ShareMenu";

/* Event → Manage → Media (SUPER_ADMIN): links for the media team to create
   galleries and upload photos at /media/<slug>, each with its own passcode. */

export type MediaEndpointItem = {
  id: string; routeSlug: string; passcode: string; label: string | null; active: boolean;
  createdAt: string; lastUsedAt: string | null; galleryCount: number; photoCount: number;
};

const PASSCODE_RE = /^[A-Za-z0-9]{6,32}$/;

type EndpointGallery = { id: string; title: string; year: number; createdAt: string; updatedAt: string; photoCount: number; thumbs: string[]; shareImage: string | null };

/** The galleries made through one media endpoint; each opens in Landing Page → Galeri. */
function EndpointGalleries({ url }: { url: string }) {
  const [rows, setRows] = useState<EndpointGallery[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(j => { if (alive) setRows(j.data); })
      .catch(() => { if (alive) setErr("Gagal memuatkan galeri."); });
    return () => { alive = false; };
  }, [url]);

  if (err) return <p className="text-xs text-red-600">{err}</p>;
  if (!rows) return <p className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuatkan galeri…</p>;
  if (rows.length === 0) return <p className="text-xs text-zinc-400 italic">Belum ada galeri dicipta melalui pautan ini.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(g => (
        <div key={g.id} className="relative">
        <Link href={`/organizer/landing/galleries?gallery=${g.id}`}
          className="flex gap-3 rounded-lg border bg-zinc-50/60 p-2 pr-10 hover:border-pink-200 hover:bg-pink-50/40 transition-colors">
          <div className="grid grid-cols-3 gap-0.5 w-24 h-16 shrink-0 rounded-md overflow-hidden bg-zinc-200">
            {g.thumbs.slice(0, 6).map((t, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={t} alt="" className="h-full w-full object-cover" loading="lazy" />
            ))}
            {g.thumbs.length === 0 && <Images className="col-span-3 m-auto h-5 w-5 text-zinc-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-800 line-clamp-2">{g.title}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">{g.photoCount} foto · {g.year}</p>
            <p className="text-[10px] text-zinc-400">dikemas kini {when(g.updatedAt)}</p>
          </div>
        </Link>
        {g.photoCount > 0 && (
          <div className="absolute top-2 right-2">
            <ShareMenu iconOnly path={`/gallery/${g.id}`} title={g.title} imageUrl={g.shareImage ?? undefined}
              className="h-7 w-7 rounded-md border border-zinc-200 bg-white flex items-center justify-center text-zinc-500 hover:text-pink-700 hover:border-pink-200" />
          </div>
        )}
        </div>
      ))}
    </div>
  );
}

// Fixed time zone, so the server-rendered text matches the browser's.
function when(iso: string | null) {
  if (!iso) return "Belum digunakan";
  return new Date(iso).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** window.location.origin in the browser; "" while server rendering (no hydration mismatch). */
const noSubscribe = () => () => {};
function useOrigin() {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}

export function MediaEndpointsClient({ event, initial }: {
  event: { id: string; name: string; slug: string }; initial: MediaEndpointItem[];
}) {
  const base = `/api/v2/organizer/events/${event.id}/media-endpoints`;
  const [items, setItems] = useState(initial);
  const [label, setLabel] = useState("");
  const [passcode, setPasscode] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaEndpointItem | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const origin = useOrigin();
  const urlOf = (e: MediaEndpointItem) => `${origin}/media/${e.routeSlug}`;
  const passOk = !passcode.trim() || PASSCODE_RE.test(passcode.trim());

  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text).catch(() => null);
    setCopied(key);
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1800);
  }

  async function create() {
    setCreating(true); setErr("");
    try {
      const res = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, passcode: passcode.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal mencipta."); return; }
      setItems(prev => [...prev, j.data]);
      setRevealed(prev => new Set(prev).add(j.data.id)); // show the new passcode once
      setLabel(""); setPasscode("");
    } finally { setCreating(false); }
  }

  async function patch(e: MediaEndpointItem, body: Record<string, unknown>) {
    setBusyId(e.id);
    try {
      const res = await fetch(`${base}/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setItems(prev => prev.map(x => (x.id === e.id ? { ...x, ...j.data } : x)));
    } finally { setBusyId(null); }
  }

  async function remove() {
    if (!deleteTarget) return;
    const res = await fetch(`${base}/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) setItems(prev => prev.filter(x => x.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <Link href={`/organizer/events/${event.slug}/manage`}
          className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2"><Camera className="h-5 w-5 text-pink-600" /> Media</h1>
          <p className="text-sm text-zinc-500">{event.name}</p>
        </div>
        <Link href="/organizer/landing/galleries"
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-pink-700 border border-pink-200 rounded-lg px-3 py-1.5 hover:bg-pink-50">
          <Images className="h-3.5 w-3.5" /> Semua galeri
        </Link>
      </div>

      <p className="text-xs text-zinc-500 bg-pink-50/60 border border-pink-100 rounded-lg px-3 py-2">
        Kongsi pautan dan passcode dengan pasukan media. Mereka boleh mencipta galeri dan memuat naik foto terus dari telefon.
        Galeri yang dicipta muncul di <Link href="/organizer/landing/galleries" className="underline">Landing Page → Galeri</Link> dan
        dipaparkan di laman utama sebaik sahaja ada foto.
      </p>

      {/* Create */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-zinc-800">Endpoint baharu</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-start">
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Label (pilihan)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="cth. Pasukan Media A" maxLength={80}
              className="w-full h-9 text-sm border border-zinc-200 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-pink-200" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Passcode (pilihan)</label>
            <input value={passcode} onChange={e => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
              placeholder="Kosongkan → 6 aksara rawak" maxLength={32}
              className={`w-full h-9 text-sm font-mono tracking-widest border rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-pink-200 ${passOk ? "border-zinc-200" : "border-red-300"}`} />
            {!passOk && <p className="text-[10px] text-red-500 mt-0.5">6–32 huruf atau nombor</p>}
          </div>
          <Button onClick={create} disabled={creating || !passOk}
            className="sm:mt-5 h-9 gap-1.5 bg-pink-600 hover:bg-pink-700 text-white">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Cipta
          </Button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-zinc-400">
          <Camera className="h-7 w-7 mx-auto mb-2 opacity-30" />
          Tiada endpoint media lagi.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(e => {
            const shown = revealed.has(e.id);
            const busy = busyId === e.id;
            return (
              <div key={e.id} className={`rounded-xl border bg-white p-4 space-y-3 ${e.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setOpenId(id => (id === e.id ? null : e.id))}
                    aria-expanded={openId === e.id} title="Lihat galeri"
                    className="min-w-0 text-left group">
                    <p className="text-sm font-semibold text-zinc-900 truncate flex items-center gap-1 group-hover:text-pink-700">
                      {e.label ?? "Endpoint media"}
                      <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${openId === e.id ? "rotate-180" : ""}`} />
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      <span className="underline decoration-dotted underline-offset-2">{e.galleryCount} galeri · {e.photoCount} foto</span> · {when(e.lastUsedAt)}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" role="switch" aria-checked={e.active} disabled={busy}
                      onClick={() => patch(e, { active: !e.active })}
                      title={e.active ? "Aktif — klik untuk nyahaktif" : "Tidak aktif — klik untuk aktifkan"}
                      className={`relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${e.active ? "bg-emerald-500" : "bg-zinc-200"}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${e.active ? "translate-x-4" : ""}`} />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(e)} className="text-zinc-300 hover:text-red-500" title="Padam endpoint">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-50 border px-3 py-2 min-w-0">
                    <code className="text-xs text-pink-700 truncate flex-1">{urlOf(e)}</code>
                    <button type="button" onClick={() => copy(`u${e.id}`, urlOf(e))} title="Salin pautan" className="text-zinc-400 hover:text-zinc-700">
                      {copied === `u${e.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a href={urlOf(e)} target="_blank" rel="noreferrer" title="Buka" className="text-zinc-400 hover:text-zinc-700">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-50 border px-3 py-2">
                    <span className="text-[10px] text-zinc-400 uppercase">Passcode</span>
                    <code className="text-sm font-bold tracking-[0.2em] text-zinc-900">{shown ? e.passcode : "••••••"}</code>
                    <button type="button" title={shown ? "Sembunyi" : "Tunjuk"} className="text-zinc-400 hover:text-zinc-700"
                      onClick={() => setRevealed(prev => { const n = new Set(prev); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}>
                      {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => copy(`p${e.id}`, e.passcode)} title="Salin passcode" className="text-zinc-400 hover:text-zinc-700">
                      {copied === `p${e.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" disabled={busy} onClick={() => { setRevealed(prev => new Set(prev).add(e.id)); void patch(e, { regeneratePasscode: true }); }}
                      title="Jana passcode baharu" className="text-zinc-400 hover:text-zinc-700 disabled:opacity-40">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {openId === e.id && (
                  <div className="rounded-lg border border-pink-100 bg-white p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Galeri</p>
                    <EndpointGalleries url={`${base}/${e.id}/galleries`} />
                  </div>
                )}

                <button type="button"
                  onClick={() => copy(`s${e.id}`, `Media — ${event.name}${e.label ? ` (${e.label})` : ""}\nPautan: ${urlOf(e)}\nPasscode: ${e.passcode}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-pink-700 hover:text-pink-900">
                  {copied === `s${e.id}` ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                  {copied === `s${e.id}` ? "Disalin — tampal dalam WhatsApp/e-mel" : "Salin pautan + passcode untuk dikongsi"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null); }}
        title="Padam endpoint media"
        description={`Pautan ${deleteTarget?.label ?? ""} tidak akan berfungsi lagi. Galeri dan foto yang telah dimuat naik kekal di Landing Page → Galeri.`}
        confirmLabel="Padam"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
