"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Swords } from "lucide-react";
import { DuelManageClient } from "@/components/organizer/scoreboard/DuelManageClient";

type Info = { label: string | null; eventName: string; competition: { name: string; code: string } };
type Session = {
  role: string; label: string | null; ecId: string;
  event: { id: string; name: string; slug: string }; competition: { name: string; code: string };
};

const key = (slug: string) => `duel-control:${slug}`;
function storeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function storeSet(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } }

/** Passcode screen, then the duel manager replica (the passcode is remembered on this device). */
export function DuelControlClient({ slug }: { slug: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState("");
  const [passcode, setPasscode] = useState("");
  const [session, setSession] = useState<{ s: Session; passcode: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = useCallback(async (code: string, silent = false) => {
    setBusy(true); if (!silent) setErr("");
    try {
      const res = await fetch(`/api/duel-control/${slug}`, { method: "POST", headers: { "x-duel-passcode": code } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        storeSet(key(slug), null);
        if (!silent) setErr(j.message ?? "Kod laluan salah.");
        return;
      }
      storeSet(key(slug), code);
      setSession({ s: j, passcode: code });
    } catch { if (!silent) setErr("Ralat rangkaian."); }
    finally { setBusy(false); }
  }, [slug]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/duel-control/${slug}`, { cache: "no-store" }).then(async res => {
      const j = await res.json().catch(() => ({}));
      if (!alive) return;
      if (!res.ok) { setMissing(j.message ?? "Pautan tidak wujud atau telah ditutup."); return; }
      setInfo(j);
      const saved = storeGet(key(slug));
      if (saved) unlock(saved, true);
    }).catch(() => alive && setMissing("Ralat rangkaian."));
    return () => { alive = false; };
  }, [slug, unlock]);

  const lock = useCallback(() => { storeSet(key(slug), null); setSession(null); setPasscode(""); }, [slug]);

  if (session) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <DuelManageClient
          event={session.s.event} ecId={session.s.ecId} competition={session.s.competition} role={session.s.role}
          link={{ slug, passcode: session.passcode, label: session.s.label, onLock: lock }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-950 via-indigo-900 to-violet-800 p-4">
      <form onSubmit={e => { e.preventDefault(); if (passcode) unlock(passcode); }}
        className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-7 text-center shadow-2xl">
        <Swords className="mx-auto h-9 w-9 text-rose-500" />
        {missing ? (
          <p className="text-sm text-zinc-600">{missing}</p>
        ) : !info ? (
          <p className="text-sm text-zinc-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</p>
        ) : (
          <>
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-400">{info.eventName}</p>
              <p className="text-lg font-bold text-zinc-900"><span className="font-mono text-zinc-400">{info.competition.code}</span> {info.competition.name}</p>
              {info.label && <p className="text-sm text-violet-600">{info.label}</p>}
            </div>
            <label className="block space-y-1.5 text-left">
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500"><KeyRound className="h-3.5 w-3.5" /> Kod laluan</span>
              <input value={passcode} autoFocus autoComplete="off" inputMode="text"
                onChange={e => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] outline-none focus:border-violet-500" />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="submit" disabled={busy || passcode.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-bold text-white disabled:opacity-40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Masuk
            </button>
          </>
        )}
      </form>
    </div>
  );
}
