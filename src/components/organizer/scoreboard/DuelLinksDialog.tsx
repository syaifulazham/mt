"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Plus, QrCode, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type Link = {
  id: string; routeSlug: string; passcode: string; label: string | null; access: "CONTROL" | "FULL" | string;
  active: boolean; createdAt: string; lastUsedAt: string | null;
};

const ACCESS: Record<string, { label: string; hint: string }> = {
  CONTROL: { label: "Kawalan arena", hint: "Mula/jeda/tamat sesi dan rekod keputusan." },
  FULL: { label: "Akses penuh", hint: "Juga cabutan, susun dan sahkan pusingan." },
};

const urlOf = (slug: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/duel-control/${slug}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ms-MY", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }) : null;

/**
 * Passcode links that replicate this competition's duel manager
 * (/duel-control/<slug>) for arena marshals without an organizer account.
 */
export function DuelLinksDialog({ apiBase, competition, onClose }: {
  apiBase: string; competition: { name: string; code: string }; onClose: () => void;
}) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [err, setErr] = useState("");
  const [label, setLabel] = useState("");
  const [access, setAccess] = useState<"CONTROL" | "FULL">("CONTROL");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<Link | null>(null);
  const [copied, setCopied] = useState("");
  const [del, setDel] = useState<Link | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    let alive = true;
    fetch(apiBase, { cache: "no-store" }).then(async res => {
      const j = await res.json().catch(() => ({}));
      if (!alive) return;
      if (res.ok) setLinks(j.links); else setErr(j.message ?? j.error ?? "Gagal memuatkan");
    }).catch(() => alive && setErr("Ralat rangkaian"));
    return () => { alive = false; };
  }, [apiBase, tick]);

  async function send(url: string, method: string, body?: object) {
    setErr("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal"); return null; }
    load();
    return j;
  }

  async function create() {
    setBusy(true);
    const j = await send(apiBase, "POST", { label, access, passcode: passcode || undefined });
    setBusy(false);
    if (j?.link) { setLabel(""); setPasscode(""); setQr(j.link); }
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* clipboard blocked */ }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-4 w-4 text-violet-600" /> Pautan kawalan · {competition.code} {competition.name}</DialogTitle>
          <DialogDescription>
            Halaman ini direplikasi di pautan berkod laluan — untuk marsyal arena tanpa akaun penganjur. Imbas kod QR, masukkan kod laluan, dan halaman yang sama dipaparkan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6 pt-4">
        <section className="space-y-3 rounded-xl border bg-zinc-50 p-3">
          <p className="text-sm font-semibold text-zinc-800">Pautan baharu</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-zinc-500">Label (cth. Arena 1, Marsyal A)</span>
              <Input value={label} onChange={e => setLabel(e.target.value)} className="h-9 bg-white" maxLength={80} />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-zinc-500">Kod laluan (kosongkan untuk dijana)</span>
              <Input value={passcode} onChange={e => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                className="h-9 bg-white font-mono tracking-widest" maxLength={32} placeholder="6–32 huruf/nombor" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["CONTROL", "FULL"] as const).map(k => (
              <label key={k} className={cn("flex flex-1 cursor-pointer items-start gap-2 rounded-lg border bg-white p-2.5", access === k ? "border-violet-400 ring-1 ring-violet-200" : "border-zinc-200")}>
                <input type="radio" checked={access === k} onChange={() => setAccess(k)} className="mt-0.5 accent-violet-600" />
                <span>
                  <span className="block text-sm font-medium text-zinc-800">{ACCESS[k].label}</span>
                  <span className="block text-[11px] text-zinc-500">{ACCESS[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            {err ? <p className="text-xs text-red-600">{err}</p> : <span />}
            <Button onClick={create} disabled={busy || (!!passcode && passcode.length < 6)} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Cipta pautan
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          {!links ? (
            <p className="py-6 text-center text-sm text-zinc-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</p>
          ) : links.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">Belum ada pautan.</p>
          ) : links.map(l => {
            const url = urlOf(l.routeSlug);
            return (
              <div key={l.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", !l.active && "opacity-60")}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-800">
                    {l.label || "Tanpa label"}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", l.access === "FULL" ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700")}>
                      {ACCESS[l.access]?.label ?? l.access}
                    </span>
                    {!l.active && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600">Ditutup</span>}
                  </p>
                  <p className="truncate font-mono text-[11px] text-zinc-500">{url}</p>
                  <p className="text-[11px] text-zinc-500">
                    Kod laluan <b className="font-mono tracking-widest text-zinc-800">{l.passcode}</b>
                    {l.lastUsedAt && <> · digunakan {when(l.lastUsedAt)}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setQr(l)}><QrCode className="h-3.5 w-3.5" /> QR</Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => copy(url, l.id)}>
                    {copied === l.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Salin
                  </Button>
                  <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-zinc-50">
                    <ExternalLink className="h-3.5 w-3.5" /> Buka
                  </a>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => send(`${apiBase}/${l.id}`, "PATCH", { active: !l.active })}>
                    {l.active ? "Tutup" : "Buka semula"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-red-600" onClick={() => setDel(l)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          })}
        </section>
        </div>

        {/* A dialog of its own: a fixed overlay inside this (transformed) dialog would be mispositioned. */}
        <Dialog open={!!qr} onOpenChange={o => { if (!o) setQr(null); }}>
          {qr && (
            <DialogContent className="max-w-sm space-y-4 px-6 pb-6 text-center">
              <DialogHeader className="px-0 text-left">
                <DialogTitle>{qr.label || "Pautan kawalan"}</DialogTitle>
                <DialogDescription>{competition.code} {competition.name} · {ACCESS[qr.access]?.label}</DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-xl border bg-white p-4">
                <QRCodeSVG value={urlOf(qr.routeSlug)} size={256} level="M" marginSize={1} />
              </div>
              <p className="break-all font-mono text-[11px] text-zinc-500">{urlOf(qr.routeSlug)}</p>
              <div className="rounded-xl bg-violet-50 py-3">
                <p className="text-[11px] uppercase tracking-widest text-violet-500">Kod laluan</p>
                <p className="font-mono text-3xl font-black tracking-[0.3em] text-violet-900">{qr.passcode}</p>
              </div>
              <Button variant="outline" className="w-full gap-1.5" onClick={() => copy(`${urlOf(qr.routeSlug)}\nKod laluan: ${qr.passcode}`, "qr")}>
                {copied === "qr" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} Salin pautan & kod laluan
              </Button>
            </DialogContent>
          )}
        </Dialog>

        <ConfirmDialog open={!!del} onOpenChange={o => { if (!o) setDel(null); }} destructive
          title="Padam pautan ini?" description="Pautan dan kod QR berhenti berfungsi serta-merta. Sesiapa yang sedang membukanya akan dikunci."
          confirmLabel="Padam"
          onConfirm={async () => { if (del) await send(`${apiBase}/${del.id}`, "DELETE"); setDel(null); }} />
      </DialogContent>
    </Dialog>
  );
}
