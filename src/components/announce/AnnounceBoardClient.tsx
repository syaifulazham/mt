"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Megaphone, Loader2, Eye, EyeOff, Lock, Pin, CheckCircle2, Circle, Undo2, Hourglass, Gavel,
  ChevronDown, ChevronUp, Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AnnouncementBoard, AnnounceItem } from "@/lib/announcements";
import { announceKey } from "@/lib/announceKey";

// MC / announcer board (/announce/[slug]): mirrors the announcement list the
// Super Admin arranges on the organizer's Pengumuman page, live (POLL_MS).
// Results the Super Admin green-lit can be announced: the first green-lit one
// in list order is pinned on top as the one to announce now; the announcer
// ticks it off and the next green-lit one moves up. Results without a green
// light are listed dimmed, without their rankings, and can't be ticked.
// Marks are shared by every announcer board of the event.

type BoardResponse = {
  endpoint: { id: string; label: string | null };
  event: { id: string; name: string; scope: string };
  board: AnnouncementBoard;
};

const POLL_MS = 3_000;
const PLACE = ["Johan", "Naib Johan", "Ketiga"];

function fmtTime(d: string | null) {
  return d ? new Date(d).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" }) : "";
}

/** Rankings as read off a script: top 3 by default (all on request), 1st first. */
function Podium({ item, maxPlaces }: { item: AnnounceItem; maxPlaces: number }) {
  // Places 1..maxPlaces only (the server sends no more), read out from the
  // last place up to the winner. Team and contingent; for national results the
  // state stands where the score used to be.
  const shown = (item.rankings ?? []).filter(r => r.rank <= maxPlaces).sort((a, b) => b.rank - a.rank);
  if (shown.length === 0) return <p className="text-sm text-zinc-400 italic">Tiada markah direkodkan.</p>;
  const national = item.stateId === null;
  return (
    <ol className="space-y-2">
      {shown.map(r => (
        <li key={r.teamId} className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5",
          r.rank === 1 ? "bg-amber-50 border border-amber-200"
          : r.rank === 2 ? "bg-zinc-50 border border-zinc-200"
          : r.rank === 3 ? "bg-orange-50 border border-orange-200"
          : "border border-zinc-100",
        )}>
          <span className={cn(
            "shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black",
            r.rank === 1 ? "bg-amber-400 text-white" : r.rank === 2 ? "bg-zinc-400 text-white"
            : r.rank === 3 ? "bg-orange-400 text-white" : "bg-zinc-100 text-zinc-500",
          )}>{r.rank}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {r.rank <= 3 ? PLACE[r.rank - 1] : `Tempat ke-${r.rank}`}
            </p>
            <p className="text-base font-bold text-zinc-900 leading-snug">{r.teamName}</p>
            <p className="text-sm text-zinc-600">{r.contingentName}</p>
          </div>
          {national && r.stateName && (
            <span className="shrink-0 text-xs font-semibold text-sky-700 text-right">{r.stateName}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function CompetitionHeading({ item, big, dim }: { item: AnnounceItem; big?: boolean; dim?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {item.kind === "walkin" && <span className="text-[9px] font-bold px-1.5 py-px rounded bg-indigo-50 text-indigo-600">WALK-IN</span>}
        {item.stateName && <span className="text-[9px] font-bold px-1.5 py-px rounded bg-sky-50 text-sky-700 shrink-0">{item.stateName.toUpperCase()}</span>}
        {!item.stateName && <span className="text-[9px] font-bold px-1.5 py-px rounded bg-zinc-100 text-zinc-600 shrink-0">KEBANGSAAN</span>}
        {item.greenLight && (
          <span className="inline-flex items-center gap-1.5" title="Lampu hijau — sedia diumumkan">
            <span className="relative flex h-2.5 w-2.5">
              {big && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.6)]" />
            </span>
            {big && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Sedia diumumkan</span>}
          </span>
        )}
      </div>
      <p className={cn("font-black leading-tight", dim ? "text-zinc-500" : "text-zinc-900", big ? "text-2xl mt-1" : "text-base mt-0.5")}>
        <span className={dim ? "text-zinc-400" : "text-emerald-700"}>{item.code}</span> {item.name}
      </p>
    </div>
  );
}

export function AnnounceBoardClient({ slug }: { slug: string }) {
  const storageKey = `announce_pc_${slug}`;
  const [passcode, setPasscode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError]       = useState("");
  const [data, setData]         = useState<BoardResponse | null>(null);
  const [busy, setBusy]         = useState<string | null>(null);
  const [markErr, setMarkErr]   = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (pc: string) => {
    const res = await fetch(`/api/announce/${slug}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: pc }),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, j };
  }, [slug]);

  // Restore a passcode from this tab's session.
  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    Promise.resolve(stored)
      .then(pc => { setRestoring(true); return load(pc); })
      .then(({ ok, j }) => { if (ok) setData(j); else sessionStorage.removeItem(storageKey); })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, [load, storageKey]);

  // Live: new verifications and other announcers' ticks.
  const signedIn = !!data;
  useEffect(() => {
    if (!signedIn) return;
    let inFlight = false;
    const t = setInterval(async () => {
      const pc = sessionStorage.getItem(storageKey);
      if (!pc || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { ok, j } = await load(pc);
        if (ok) setData(j);
        else if (j.error === "ENDPOINT_CLOSED" || j.error === "WRONG_PASSCODE") {
          sessionStorage.removeItem(storageKey);
          setData(null);
          setError(j.error === "ENDPOINT_CLOSED" ? "Papan pengumuman ini telah ditutup." : "Passcode telah berubah. Log masuk semula.");
        }
      } catch { /* next tick */ } finally { inFlight = false; }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [signedIn, load, storageKey]);

  async function signIn() {
    if (!passcode.trim()) return;
    setLoading(true); setError("");
    try {
      const pc = passcode.trim().toUpperCase();
      const { ok, j } = await load(pc);
      if (!ok) {
        setError(
          j.error === "WRONG_PASSCODE" ? "Passcode salah. Cuba semula."
          : j.error === "ENDPOINT_CLOSED" ? "Papan pengumuman ini telah ditutup."
          : j.error === "NOT_FOUND" ? "Papan pengumuman tidak dijumpai."
          : (j.error ?? "Ralat tidak diketahui."),
        );
        return;
      }
      sessionStorage.setItem(storageKey, pc);
      setData(j);
    } finally { setLoading(false); }
  }

  async function mark(item: AnnounceItem, announced: boolean) {
    const k = announceKey(item.kind, item.refId, item.stateId);
    const pc = sessionStorage.getItem(storageKey) ?? "";
    setBusy(k); setMarkErr("");
    try {
      const res = await fetch(`/api/announce/${slug}/mark`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: pc, kind: item.kind, refId: item.refId, stateId: item.stateId, announced }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMarkErr(
          j.error === "NOT_VERIFIED" ? "Keputusan ini tidak lagi disahkan — tidak boleh diumumkan."
          : j.error === "NOT_GREEN_LIT" ? "Lampu hijau bagi keputusan ini telah ditarik balik — tunggu arahan Super Admin."
          : (j.error ?? "Gagal menanda."),
        );
      }
      const { ok, j } = await load(pc);
      if (ok) setData(j);
    } finally { setBusy(null); }
  }

  // ── Restoring ──
  if (restoring) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  // ── Passcode ──
  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Megaphone className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-zinc-900">Papan Pengumuman</h1>
            <p className="text-sm text-zinc-500">Masukkan passcode yang diberikan untuk meneruskan.</p>
          </div>
          <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <div className="relative">
              <Input
                value={passcode}
                onChange={e => setPasscode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && signIn()}
                type={showPass ? "text" : "password"}
                placeholder="Passcode"
                className="text-center tracking-[0.3em] font-mono text-lg h-12 pr-10"
                autoComplete="off"
                maxLength={6}
              />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-3.5 text-zinc-400">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-500 text-center flex items-center justify-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />{error}
              </p>
            )}
            <Button onClick={signIn} disabled={loading || passcode.length < 6}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Masuk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { board } = data;
  // The Super Admin's list order; the first green-lit result is the one to announce now
  const current = board.list.find(i => i.greenLight);
  const next = board.list.filter(i => i !== current);
  const readyCount = board.list.filter(i => i.greenLight).length;
  const toggleExpand = (k: string) => setExpanded(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <Megaphone className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-zinc-900 text-sm leading-tight truncate">{data.event.name}</p>
            <p className="text-xs text-zinc-500">{data.endpoint.label ?? "Papan Pengumuman"}</p>
          </div>
          <div className="text-right shrink-0 text-xs">
            <p className="font-semibold text-emerald-700">{readyCount} sedia</p>
            <p className="text-zinc-400">{board.announced.length} diumumkan</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-6">
        {markErr && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{markErr}</p>}

        {/* Pinned: the one to announce now */}
        {current ? (
          <section className="rounded-2xl border-2 border-emerald-400 bg-white shadow-lg ring-4 ring-emerald-100 overflow-hidden">
            <div className="px-5 py-2 bg-emerald-600 text-white flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <Pin className="h-3.5 w-3.5 fill-white" /> Umumkan sekarang
            </div>
            <div className="p-5 space-y-4">
              <CompetitionHeading item={current} big />
              <Podium item={current} maxPlaces={board.maxPlaces} />
              <Button onClick={() => mark(current, true)} disabled={busy !== null}
                className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                {busy === announceKey(current.kind, current.refId, current.stateId) ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                Tandakan Telah Diumumkan
              </Button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border bg-white p-8 text-center space-y-2">
            <Trophy className="h-10 w-10 text-zinc-200 mx-auto" />
            <p className="font-semibold text-zinc-700">
              {board.list.length > 0 ? "Menunggu lampu hijau daripada Super Admin."
                : board.announced.length > 0 ? "Semua keputusan yang disahkan telah diumumkan."
                : "Belum ada keputusan yang sedia diumumkan."}
            </p>
            <p className="text-sm text-zinc-400">
              {board.list.length > 0
                ? "Keputusan akan muncul di sini sebaik sahaja diberi lampu hijau."
                : "Keputusan baharu akan muncul di sini secara automatik sebaik sahaja disahkan."}
            </p>
          </section>
        )}

        {/* Up next */}
        {next.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Seterusnya ({next.length})</h2>
            <ul className="space-y-2">
              {next.map(item => {
                const k = announceKey(item.kind, item.refId, item.stateId);
                const open = expanded.has(k);
                // Without a green light: listed in order, dimmed, no rankings, can't be ticked
                if (!item.greenLight) return (
                  <li key={k} className="rounded-xl border border-dashed bg-zinc-50 opacity-70">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Lock className="h-5 w-5 text-zinc-300 shrink-0" />
                      <div className="flex-1 min-w-0"><CompetitionHeading item={item} dim /></div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0">Menunggu lampu hijau</span>
                    </div>
                  </li>
                );
                return (
                  <li key={k} className="rounded-xl border bg-white overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => mark(item, true)} disabled={busy !== null} title="Tandakan telah diumumkan"
                        className="shrink-0 text-zinc-300 hover:text-emerald-600 disabled:opacity-50">
                        {busy === k ? <Loader2 className="h-6 w-6 animate-spin" /> : <Circle className="h-6 w-6" />}
                      </button>
                      <button onClick={() => toggleExpand(k)} className="flex-1 min-w-0 text-left flex items-center gap-2">
                        <div className="flex-1 min-w-0"><CompetitionHeading item={item} /></div>
                        {open ? <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />}
                      </button>
                    </div>
                    {open && <div className="px-4 pb-4"><Podium item={item} maxPlaces={board.maxPlaces} /></div>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Announced */}
        {board.announced.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Telah diumumkan ({board.announced.length})</h2>
            <ul className="rounded-xl border bg-white divide-y overflow-hidden">
              {board.announced.map(item => {
                const k = announceKey(item.kind, item.refId, item.stateId);
                return (
                  <li key={k} className="flex items-center gap-3 px-4 py-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span className="text-sm text-zinc-500 line-through truncate">{item.code} {item.name}{item.stateName ? ` · ${item.stateName}` : ""}</span>
                    <span className="ml-auto text-[11px] text-zinc-400 shrink-0">
                      {fmtTime(item.announcedAt)}{item.announcedBy && <> · {item.announcedBy}</>}
                    </span>
                    <button onClick={() => mark(item, false)} disabled={busy !== null} title="Batalkan — belum diumumkan"
                      className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 shrink-0">
                      {busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Not announceable yet */}
        {(board.waiting.length > 0 || board.stillJudging > 0) && (
          <p className="flex items-center justify-center gap-4 text-xs text-zinc-400 pt-2">
            {board.waiting.length > 0 && <span className="flex items-center gap-1"><Hourglass className="h-3.5 w-3.5 text-amber-500" />{board.waiting.length} menunggu pengesahan</span>}
            {board.stillJudging > 0 && <span className="flex items-center gap-1"><Gavel className="h-3.5 w-3.5" />{board.stillJudging} masih dinilai</span>}
          </p>
        )}
      </div>
    </div>
  );
}
