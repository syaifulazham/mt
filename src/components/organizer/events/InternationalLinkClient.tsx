"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INTL_LINK_LOCKED_EVENT, InternationalParticipationClient, setInternationalLinkPasscode } from "@/components/organizer/events/InternationalParticipationClient";

type Head = { label: string | null; eventName: string };
type Unlocked = { label: string | null; scope: string; event: { id: string; name: string; slug: string } };

const keyOf = (slug: string) => `intl-link:${slug}`;
const remembered = (slug: string) => { try { return localStorage.getItem(keyOf(slug)) ?? ""; } catch { return ""; } };

/** /intl/<slug>: passcode, then the event's Penyertaan Antarabangsa page in link mode. */
export function InternationalLinkClient({ slug }: { slug: string }) {
  const api = `/api/intl-link/${slug}`;
  const [head, setHead] = useState<Head | null>(null);
  const [passcode, setPasscode] = useState("");
  const [open, setOpen] = useState<Unlocked | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = useCallback(async (code: string, quiet = false) => {
    setBusy(true);
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        try { localStorage.removeItem(keyOf(slug)); } catch { /* ignore */ }
        if (!quiet) setErr(j.message ?? "Gagal");
        return;
      }
      try { localStorage.setItem(keyOf(slug), code); } catch { /* ignore */ }
      setInternationalLinkPasscode(code);
      setErr(""); setPasscode(code); setOpen(j);
    } catch { if (!quiet) setErr("Ralat rangkaian"); }
    finally { setBusy(false); }
  }, [api, slug]);

  const lock = useCallback(() => {
    try { localStorage.removeItem(keyOf(slug)); } catch { /* ignore */ }
    setInternationalLinkPasscode("");
    setOpen(null); setPasscode("");
  }, [slug]);

  useEffect(() => {
    let alive = true;
    fetch(api).then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok, j }) => {
      if (!alive) return;
      if (!ok) { setErr(j.message ?? "Pautan tidak sah."); return; }
      setHead(j);
      const code = remembered(slug);
      if (code) void unlock(code, true);
    }).catch(() => alive && setErr("Ralat rangkaian"));
    return () => { alive = false; };
  }, [api, slug, unlock]);

  // The link was closed, deleted or given a new passcode while in use.
  useEffect(() => {
    window.addEventListener(INTL_LINK_LOCKED_EVENT, lock);
    return () => window.removeEventListener(INTL_LINK_LOCKED_EVENT, lock);
  }, [lock]);

  if (open)
    return (
      <div className="min-h-screen bg-zinc-50">
        <InternationalParticipationClient event={open.event} link={{ slug, passcode, label: open.label, scope: open.scope, onLock: lock }} />
      </div>
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-900 via-sky-800 to-indigo-900 p-4">
      <form className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl"
        onSubmit={e => { e.preventDefault(); if (passcode.trim()) void unlock(passcode.trim().toUpperCase()); }}>
        <Globe2 className="mx-auto h-8 w-8 text-sky-600" />
        <div>
          <p className="text-lg font-bold text-zinc-900">Pendaftaran Antarabangsa</p>
          <p className="text-sm text-zinc-500">{head?.eventName ?? "…"}</p>
          {head?.label && <p className="mt-1 text-xs font-medium text-sky-700">{head.label}</p>}
        </div>
        <label className="block space-y-1 text-left">
          <span className="flex items-center gap-1 text-xs font-medium text-zinc-500"><Lock className="h-3 w-3" /> Kod laluan</span>
          <input value={passcode} onChange={e => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6))}
            autoFocus autoCapitalize="characters" placeholder="••••••"
            className="w-full rounded-xl border px-3 py-3 text-center font-mono text-3xl font-black tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-sky-200" />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button type="submit" className="w-full bg-sky-600 hover:bg-sky-700" disabled={busy || passcode.length !== 6 || !head}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Masuk
        </Button>
      </form>
    </div>
  );
}
