"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, Copy, Check, Download, Mail, Loader2, Smartphone } from "lucide-react";

/**
 * Share a gallery or photo to social media (SUPER_ADMIN). On phones "Kongsi…"
 * opens the system share sheet with the photo file attached (WhatsApp,
 * Instagram, Facebook…); the links share the public gallery page, whose
 * preview shows the photo. The photo file comes through
 * /api/v2/organizer/landing/photo-file (R2 sends no CORS headers).
 */

type Target = { key: string; label: string; color: string; href: (url: string, text: string) => string };

const e = encodeURIComponent;
const TARGETS: Target[] = [
  { key: "whatsapp", label: "WhatsApp", color: "#25D366", href: (u, t) => `https://wa.me/?text=${e(`${t}\n${u}`)}` },
  { key: "facebook", label: "Facebook", color: "#1877F2", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${e(u)}` },
  { key: "x",        label: "X (Twitter)", color: "#000000", href: (u, t) => `https://twitter.com/intent/tweet?text=${e(t)}&url=${e(u)}` },
  { key: "telegram", label: "Telegram", color: "#229ED9", href: (u, t) => `https://t.me/share/url?url=${e(u)}&text=${e(t)}` },
  { key: "linkedin", label: "LinkedIn", color: "#0A66C2", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}` },
];

const fileUrl = (img: string, download = false) =>
  `/api/v2/organizer/landing/photo-file?url=${e(img)}${download ? "&download=1" : ""}`;

export function ShareMenu({ path, title, imageUrl, label, className, iconOnly }: {
  /** Public path to share, e.g. /gallery/<id>?photo=<id>. */
  path: string;
  title: string;
  /** The photo, for attaching to the system share sheet and for download. */
  imageUrl?: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const url = typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!pos) return;
    const close = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setPos(null);
    };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setPos(null); };
    const away = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [pos]);

  function toggle(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = btnRef.current!.getBoundingClientRect();
    const W = 224, H = 330;
    setNote("");
    setPos({
      left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)),
      top: window.innerHeight - r.bottom < H && r.top > H ? r.top - H - 4 : r.bottom + 4,
    });
  }

  async function nativeShare() {
    setBusy(true); setNote("");
    try {
      let files: File[] | undefined;
      if (imageUrl) {
        const res = await fetch(fileUrl(imageUrl));
        if (res.ok) {
          const blob = await res.blob();
          const f = new File([blob], "techlympics.jpg", { type: blob.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [f] })) files = [f];
        }
      }
      await navigator.share({ title, text: `${title}\n${url}`, url, ...(files && { files }) });
      setPos(null);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setNote("Tidak dapat membuka menu kongsi peranti.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const item = "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 rounded-md text-left";
  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} title="Kongsi" aria-haspopup="menu" aria-expanded={!!pos}
        className={className ?? "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50"}>
        <Share2 className="h-3.5 w-3.5" />{!iconOnly && (label ?? "Kongsi")}
      </button>
      {pos && createPortal(
        <div ref={menuRef} role="menu" onClick={ev => ev.stopPropagation()}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
          className="z-[10000] rounded-lg border border-zinc-200 bg-white p-1 shadow-xl">
          {canNative && (
            <button type="button" onClick={nativeShare} disabled={busy} className={`${item} font-medium`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : <Smartphone className="h-4 w-4 text-zinc-500" />}
              Kongsi…{imageUrl && <span className="ml-auto text-[10px] text-zinc-400">dengan foto</span>}
            </button>
          )}
          {TARGETS.map(t => (
            <a key={t.key} href={t.href(url, title)} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setPos(null)}>
              <span className="h-4 w-4 rounded-full shrink-0" style={{ background: t.color }} />
              {t.label}
            </a>
          ))}
          <a href={`mailto:?subject=${e(title)}&body=${e(`${title}\n${url}`)}`} className={item} onClick={() => setPos(null)}>
            <Mail className="h-4 w-4 text-zinc-500" /> E-mel
          </a>
          <div className="my-1 border-t" />
          <button type="button" onClick={copyLink} className={item}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-zinc-500" />}
            {copied ? "Pautan disalin" : "Salin pautan"}
          </button>
          {imageUrl && (
            <a href={fileUrl(imageUrl, true)} className={item} onClick={() => setPos(null)}>
              <Download className="h-4 w-4 text-zinc-500" /> Muat turun foto
            </a>
          )}
          {note && <p className="px-3 py-1.5 text-[11px] text-red-600">{note}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
