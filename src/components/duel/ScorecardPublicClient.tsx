"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, RefreshCw, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScorecardForm, type ScorecardEntry } from "@/components/duel/ScorecardForm";
import type { Scorecard, Tally } from "@/lib/duel-scorecard";

type Head = { event: string; competition: { code: string; name: string }; session: string };
type Loaded = Head & {
  card: Scorecard; allowDraw: boolean; advance: number; round: { stage: string; isFinal: boolean };
  status: string; arena: number; entries: ScorecardEntry[];
};

const STATUS: Record<string, string> = { PENDING: "Belum bermula", RUNNING: "Sedang berlangsung", PAUSED: "Dijeda", ENDED: "Tamat — beri keputusan", DONE: "Keputusan disimpan" };
const keyOf = (slug: string) => `scorecard:${slug}`;
const remembered = (slug: string) => { try { return localStorage.getItem(keyOf(slug)) ?? ""; } catch { return ""; } };

/** /scorecard/<slug>: passcode, then the duel's scorecard; saving records the result. */
export function ScorecardPublicClient({ slug }: { slug: string }) {
  const api = `/api/duel-scorecard/${slug}`;
  const [head, setHead] = useState<Head | null>(null);
  const [passcode, setPasscode] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async (code: string, quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code, action: "load" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) { try { localStorage.removeItem(keyOf(slug)); } catch { /* ignore */ } setData(null); }
        if (!quiet) setErr(j.message ?? "Gagal");
        return false;
      }
      try { localStorage.setItem(keyOf(slug), code); } catch { /* ignore */ }
      // A poll only refreshes the status; the marks being entered stay.
      setData(d => (quiet && d ? { ...d, status: j.status } : j));
      setErr("");
      return true;
    } finally { if (!quiet) setBusy(false); }
  }, [api, slug]);

  useEffect(() => {
    let alive = true;
    fetch(api).then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok, j }) => {
      if (!alive) return;
      if (!ok) { setErr(j.message ?? "Pautan tidak sah."); return; }
      setHead(j);
      const code = remembered(slug);
      if (code) { setPasscode(code); void load(code); }
    }).catch(() => alive && setErr("Ralat rangkaian"));
    return () => { alive = false; };
  }, [api, slug, load]);

  // Until the duel starts, check every 5 s so saving unlocks by itself.
  useEffect(() => {
    if (!data || data.status !== "PENDING") return;
    const t = setInterval(() => { void load(passcode, true); }, 5000);
    return () => clearInterval(t);
  }, [data, passcode, load]);

  async function save(ranks: Record<string, number>, tallies: Record<string, Tally>) {
    setErr("");
    const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode, action: "save", ranks, tallies }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal menyimpan"); return; }
    setSaved(true);
    await load(passcode, false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-violet-50">
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-violet-950 via-indigo-900 to-violet-800 p-4 text-white shadow-lg">
          <Swords className="mt-1 h-5 w-5 shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/60">{head?.event ?? "Kad skor duel"}</p>
            <p className="font-bold">{head ? <><span className="font-mono text-white/60">{head.competition.code}</span> {head.competition.name}</> : "…"}</p>
            <p className="text-lg font-black text-cyan-300">{head?.session}</p>
          </div>
          {data && (
            <div className="text-right text-xs">
              {data.arena > 0 && <p className="font-bold uppercase tracking-widest text-cyan-300">Arena {data.arena}</p>}
              <p className="mt-1 rounded-full bg-white/15 px-2 py-0.5">{STATUS[data.status] ?? data.status}</p>
            </div>
          )}
        </div>

        {!data ? (
          <form className="mx-auto max-w-sm space-y-3 rounded-2xl border bg-white p-5 text-center shadow-sm"
            onSubmit={e => { e.preventDefault(); if (passcode.trim()) void load(passcode.trim().toUpperCase()); }}>
            <Lock className="mx-auto h-6 w-6 text-rose-500" />
            <p className="text-sm font-semibold text-zinc-800">Masukkan kod laluan kad skor</p>
            <input value={passcode} onChange={e => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5))}
              autoFocus inputMode="text" autoCapitalize="characters" placeholder="•••••"
              className="w-full rounded-xl border px-3 py-3 text-center font-mono text-3xl font-black tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-rose-200" />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700" disabled={busy || passcode.length !== 5 || !head}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Buka kad skor
            </Button>
          </form>
        ) : (
          <>
            {saved && (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> Keputusan disimpan. Anda boleh membetulkannya dan simpan semula selagi pusingan seterusnya belum disahkan.
              </p>
            )}
            {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            {!data.card.enabled ? (
              <p className="rounded-xl border bg-white p-6 text-center text-sm text-zinc-500">Kad skor tidak diaktifkan untuk pertandingan ini.</p>
            ) : (
              <div className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                <ScorecardForm key={formKey} entries={data.entries} card={data.card} stage={data.round.stage} isFinal={data.round.isFinal}
                  allowDraw={data.allowDraw} advance={data.advance} onSave={save}
                  disabledReason={data.status === "PENDING" ? "Perlawanan belum dimulakan — anda boleh menanda dahulu; simpan selepas ia bermula." : null} />
              </div>
            )}
            <div className="flex justify-center">
              <button onClick={() => { setSaved(false); setFormKey(k => k + 1); void load(passcode); }} className="flex items-center gap-1 text-xs text-zinc-500 hover:underline">
                <RefreshCw className="h-3 w-3" /> Muat semula daripada pelayan
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
