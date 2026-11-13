"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, Plus, QrCode, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type LinkRow = {
  id: string; routeSlug: string; passcode: string; label: string | null; scope: "ALL" | "OWN" | string;
  active: boolean; createdAt: string; lastUsedAt: string | null; schools: number;
};

const SCOPE: Record<string, { label: string; hint: string }> = {
  ALL: { label: "Semua sekolah antarabangsa", hint: "Boleh melihat dan mengurus setiap sekolah luar negara, termasuk yang didaftarkan oleh penganjur." },
  OWN: { label: "Sekolah sendiri sahaja", hint: "Hanya sekolah yang dicipta melalui pautan ini — sekolah lain tidak kelihatan." },
};

const urlOf = (slug: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/intl/${slug}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ms-MY", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }) : null;

/**
 * Pautan pihak ketiga: passcode links (/intl/<slug>, 6-character passcode) that
 * open this event's Penyertaan Antarabangsa page for a third party without an
 * organizer account. Acceptance (Penerimaan) stays with the organizers.
 */
export function InternationalLinksDialog({ apiBase, eventName, onClose }: { apiBase: string; eventName: string; onClose: () => void }) {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [err, setErr] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"ALL" | "OWN">("ALL");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<LinkRow | null>(null);
  const [copied, setCopied] = useState("");
  const [del, setDel] = useState<LinkRow | null>(null);
  const [rekey, setRekey] = useState<LinkRow | null>(null);

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
    const j = await send(apiBase, "POST", { label, scope });
    setBusy(false);
    if (j?.link) { setLabel(""); setQr(j.link); }
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* clipboard blocked */ }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-sky-600" /> Pautan pihak ketiga · Penyertaan Antarabangsa</DialogTitle>
          <DialogDescription>
            {eventName} — pautan berkod laluan untuk pihak ketiga mengurus pendaftaran antarabangsa (negara, sekolah, peserta, jurulatih, pasukan dan
            penyertaan) tanpa akaun penganjur. Status penerimaan kekal di tangan penganjur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6 pt-4">
          <section className="space-y-3 rounded-xl border bg-zinc-50 p-3">
            <p className="text-sm font-semibold text-zinc-800">Pautan baharu</p>
            <label className="block space-y-1">
              <span className="block text-[11px] font-medium text-zinc-500">Label (cth. nama agensi / penyelaras)</span>
              <Input value={label} onChange={e => setLabel(e.target.value)} className="h-9 bg-white" maxLength={80} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["ALL", "OWN"] as const).map(k => (
                <label key={k} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-2.5", scope === k ? "border-sky-400 ring-1 ring-sky-200" : "border-zinc-200")}>
                  <input type="radio" checked={scope === k} onChange={() => setScope(k)} className="mt-0.5 accent-sky-600" />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800">{SCOPE[k].label}</span>
                    <span className="block text-[11px] text-zinc-500">{SCOPE[k].hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              {err ? <p className="text-xs text-red-600">{err}</p> : <span className="text-[11px] text-zinc-400">Kod laluan 6 aksara dijana secara rawak.</span>}
              <Button onClick={create} disabled={busy} className="gap-1.5 bg-sky-600 hover:bg-sky-700">
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
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", l.scope === "OWN" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700")}>
                        {SCOPE[l.scope]?.label ?? l.scope}
                      </span>
                      {!l.active && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600">Ditutup</span>}
                    </p>
                    <p className="truncate font-mono text-[11px] text-zinc-500">{url}</p>
                    <p className="text-[11px] text-zinc-500">
                      Kod laluan <b className="font-mono tracking-widest text-zinc-800">{l.passcode}</b>
                      {l.scope === "OWN" && <> · {l.schools} sekolah dicipta</>}
                      {l.lastUsedAt && <> · digunakan {when(l.lastUsedAt)}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setQr(l)}><QrCode className="h-3.5 w-3.5" /> QR</Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => copy(`${url}\nKod laluan: ${l.passcode}`, l.id)}>
                      {copied === l.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Salin
                    </Button>
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-zinc-50">
                      <ExternalLink className="h-3.5 w-3.5" /> Buka
                    </a>
                    <Button size="sm" variant="outline" className="h-8" title="Jana kod laluan baharu" onClick={() => setRekey(l)}><KeyRound className="h-3.5 w-3.5" /></Button>
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

        <Dialog open={!!qr} onOpenChange={o => { if (!o) setQr(null); }}>
          {qr && (
            <DialogContent className="max-w-sm space-y-4 px-6 pb-6 text-center">
              <DialogHeader className="px-0 text-left">
                <DialogTitle>{qr.label || "Pautan pihak ketiga"}</DialogTitle>
                <DialogDescription>Penyertaan Antarabangsa · {SCOPE[qr.scope]?.label}</DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-xl border bg-white p-4">
                <QRCodeSVG value={urlOf(qr.routeSlug)} size={240} level="M" marginSize={1} />
              </div>
              <p className="break-all font-mono text-[11px] text-zinc-500">{urlOf(qr.routeSlug)}</p>
              <div className="rounded-xl bg-sky-50 py-3">
                <p className="text-[11px] uppercase tracking-widest text-sky-500">Kod laluan</p>
                <p className="font-mono text-3xl font-black tracking-[0.3em] text-sky-900">{qr.passcode}</p>
              </div>
              <Button variant="outline" className="w-full gap-1.5" onClick={() => copy(`${urlOf(qr.routeSlug)}\nKod laluan: ${qr.passcode}`, "qr")}>
                {copied === "qr" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} Salin pautan & kod laluan
              </Button>
            </DialogContent>
          )}
        </Dialog>

        <ConfirmDialog open={!!rekey} onOpenChange={o => { if (!o) setRekey(null); }}
          title="Jana kod laluan baharu?" description="Kod laluan lama berhenti berfungsi serta-merta; sesiapa yang menggunakannya perlu memasukkan kod baharu."
          confirmLabel="Jana kod baharu"
          onConfirm={async () => { if (rekey) { const j = await send(`${apiBase}/${rekey.id}`, "PATCH", { newPasscode: true }); if (j?.link) setQr(j.link); } setRekey(null); }} />
        <ConfirmDialog open={!!del} onOpenChange={o => { if (!o) setDel(null); }} destructive
          title="Padam pautan ini?" description="Pautan berhenti berfungsi serta-merta. Sekolah, peserta dan penyertaan yang telah didaftarkan melaluinya kekal."
          confirmLabel="Padam"
          onConfirm={async () => { if (del) await send(`${apiBase}/${del.id}`, "DELETE"); setDel(null); }} />
      </DialogContent>
    </Dialog>
  );
}
