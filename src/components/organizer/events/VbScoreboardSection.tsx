"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, MonitorPlay, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Live scoreboard links (/live/<slug>) of a VibeBlocks walk-in competition:
// big-screen boards fed by VibeBlocks' event-wide leaderboard, each with an
// optional passcode.

type Board = { id: string; routeSlug: string; passcode: string | null; label: string | null; active: boolean; createdAt: string };

export function VbScoreboardSection({ eventId, wicId, canWrite, eventCreated }: {
  eventId: string; wicId: string; canWrite: boolean;
  /** The VibeBlocks event exists; boards show nothing until it does. */
  eventCreated: boolean;
}) {
  const base = `/api/v2/organizer/events/${eventId}/walkin/${wicId}/scoreboards`;
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [usePasscode, setUsePasscode] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Board | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setError(j?.message ?? "Gagal memuatkan papan skor."); return; }
    setBoards(j.data);
  }, [base]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function call(key: string, url: string, method: string, body?: unknown) {
    setBusy(key); setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) { setError(j?.message ?? "Tindakan gagal."); return false; }
    await load();
    return true;
  }

  async function create() {
    const ok = await call("new", base, "POST", {
      label,
      // Omitted → generated; "" → open link.
      ...(usePasscode ? (passcode.trim() ? { passcode: passcode.trim() } : {}) : { passcode: "" }),
    });
    if (ok) { setAdding(false); setLabel(""); setPasscode(""); setUsePasscode(true); }
  }

  const urlOf = (b: Board) => `${typeof window !== "undefined" ? window.location.origin : ""}/live/${b.routeSlug}`;
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); } catch { window.prompt("Salin:", text); return; }
    setCopied(key); setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
  }

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MonitorPlay className="h-4 w-4 text-indigo-600 shrink-0" />
          <p className="text-sm font-semibold text-zinc-800">Papan Skor Langsung</p>
          {boards && boards.length > 0 && <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-full">{boards.length}</span>}
        </div>
        {canWrite && !adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Pautan baharu
          </Button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500">
        Paparan skrin besar: kemajuan, perlanggaran, masa, penalti dan jumlah masa setiap peserta, terus daripada papan pendahulu VibeBlocks (dikemas kini setiap 5 saat).
        {!eventCreated && <span className="text-amber-700"> Cipta acara VibeBlocks dahulu — papan kosong sehingga itu.</span>}
      </p>

      {adding && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-3 space-y-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (cth. Skrin Dewan A)" maxLength={80}
            className="h-8 w-full rounded-md border px-2 text-sm" />
          <label className="flex items-center gap-2 text-xs text-zinc-700">
            <input type="checkbox" checked={usePasscode} onChange={(e) => setUsePasscode(e.target.checked)} />
            Lindungi dengan passcode
          </label>
          {usePasscode && (
            <input value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
              placeholder="Kosongkan untuk jana automatik" maxLength={32}
              className="h-8 w-full rounded-md border px-2 font-mono text-sm uppercase" />
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>Batal</Button>
            <Button size="sm" className="h-7 text-xs" disabled={busy === "new" || (usePasscode && passcode.length > 0 && passcode.length < 4)} onClick={create}>
              {busy === "new" && <Loader2 className="h-3 w-3 animate-spin" />} Cipta pautan
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {!boards && !error && <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Loader2 className="h-3 w-3 animate-spin" /> Memuatkan…</div>}
      {boards && boards.length === 0 && !adding && <p className="text-xs text-zinc-400">Belum ada pautan papan skor.</p>}

      {boards && boards.length > 0 && (
        <div className="divide-y divide-zinc-100 rounded-lg border">
          {boards.map((b) => (
            <div key={b.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 ${b.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800 truncate">{b.label || "Papan skor"}</p>
                <p className="text-[11px] text-zinc-500 font-mono truncate">/live/{b.routeSlug}</p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono ${b.passcode ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-500"}`}>
                <KeyRound className="h-3 w-3" /> {b.passcode ?? "tiada"}
              </span>
              <div className="flex items-center gap-1">
                <button className="p-1.5 text-zinc-500 hover:text-zinc-900" title="Salin pautan" onClick={() => copy(`u-${b.id}`, urlOf(b))}>
                  {copied === `u-${b.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a className="p-1.5 text-zinc-500 hover:text-zinc-900" title="Buka" href={`/live/${b.routeSlug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {canWrite && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy === `p-${b.id}`}
                      title={b.passcode ? "Jana passcode baharu" : "Tambah passcode"}
                      onClick={() => call(`p-${b.id}`, `${base}/${b.id}`, "PATCH", { passcode: "new" })}>
                      {b.passcode ? "Passcode baharu" : "Tambah passcode"}
                    </Button>
                    {b.passcode && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy === `p-${b.id}`}
                        onClick={() => call(`p-${b.id}`, `${base}/${b.id}`, "PATCH", { passcode: "" })}>
                        Buang passcode
                      </Button>
                    )}
                    <button type="button" role="switch" aria-checked={b.active} title={b.active ? "Aktif — klik untuk tutup" : "Ditutup — klik untuk aktifkan"}
                      disabled={busy === `a-${b.id}`} onClick={() => call(`a-${b.id}`, `${base}/${b.id}`, "PATCH", { active: !b.active })}
                      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${b.active ? "bg-emerald-500" : "bg-zinc-300"}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${b.active ? "left-3.5" : "left-0.5"}`} />
                    </button>
                    <button className="p-1.5 text-zinc-400 hover:text-red-600" title="Padam" onClick={() => setToDelete(b)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title="Padam pautan papan skor?"
        description={`${toDelete?.label || "Papan skor"} (/live/${toDelete?.routeSlug}) akan berhenti berfungsi pada semua skrin.`}
        confirmLabel="Padam"
        destructive
        onConfirm={async () => { if (toDelete) await call(`d-${toDelete.id}`, `${base}/${toDelete.id}`, "DELETE"); setToDelete(null); }}
      />
    </div>
  );
}
