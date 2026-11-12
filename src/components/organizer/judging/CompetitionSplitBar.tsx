"use client";

import { useState } from "react";
import { Loader2, Medal, Pencil, Plus, Split, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SPLIT_LABEL_MAX } from "@/lib/competition-split";

/**
 * Pecahan pertandingan (Penghakiman card): split a competition into several
 * judged as their own ("Kereta Terpantas", "Pembentangan Terbaik"), rename a
 * split, switch whether it counts in the Medal Tally, or remove an added one.
 * Adding or removing a split reloads the page (a new card appears).
 */
export function CompetitionSplitBar({ base, ec, competition, canWrite, onChange }: {
  base: string;
  ec: { id: string; splitLabel: string; parentId: string | null; countInMedals: boolean };
  competition: { code: string; name: string };
  canWrite: boolean;
  onChange: (patch: { splitLabel?: string; countInMedals?: boolean }) => void;
}) {
  const split = !!ec.splitLabel || !!ec.parentId;
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(ec.splitLabel);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [del, setDel] = useState(false);

  async function call(method: string, body?: object) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${base}/split`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      return j;
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); return null; }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-white px-5 py-2.5 text-xs">
      <Split className="h-3.5 w-3.5 text-indigo-500" />
      <span className="font-medium text-zinc-500">Pecahan</span>
      {!split ? (
        <>
          <span className="text-zinc-400">Tidak dipecahkan — satu set penghakiman dan keputusan.</span>
          {canWrite && (
            <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={() => setAdding(true)}>
              <Split className="h-3 w-3" /> Pecahkan pertandingan
            </Button>
          )}
        </>
      ) : (
        <>
          {renaming ? (
            <span className="flex items-center gap-1.5">
              <Input value={label} onChange={e => setLabel(e.target.value)} maxLength={SPLIT_LABEL_MAX} className="h-7 w-56 text-xs" autoFocus />
              <Button size="sm" className="h-7 text-xs" disabled={busy || label.trim() === ec.splitLabel}
                onClick={async () => { const j = await call("PATCH", { splitLabel: label }); if (j) { onChange({ splitLabel: j.splitLabel }); setRenaming(false); } }}>
                {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Simpan
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setRenaming(false); setLabel(ec.splitLabel); }}>Batal</Button>
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 font-semibold text-indigo-700">
              {ec.splitLabel || "Tanpa label"}
              {canWrite && <button title="Tukar label" onClick={() => setRenaming(true)} className="rounded p-0.5 hover:bg-indigo-100"><Pencil className="h-3 w-3" /></button>}
            </span>
          )}
          <span className="text-zinc-400">{ec.parentId ? "pecahan tambahan" : "bahagian asal"} · penghakiman dan keputusan sendiri</span>
          <label className="ml-auto flex items-center gap-1.5 text-zinc-600" title="Keputusan pecahan ini dikira dalam Medal Tally">
            <input type="checkbox" checked={ec.countInMedals} disabled={!canWrite || busy} className="accent-amber-500"
              onChange={async e => { const j = await call("PATCH", { countInMedals: e.target.checked }); if (j) onChange({ countInMedals: j.countInMedals }); }} />
            <Medal className="h-3.5 w-3.5 text-amber-500" /> Kira dalam Medal Tally
          </label>
          {canWrite && (
            <>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAdding(true)}><Plus className="h-3 w-3" /> Tambah pecahan</Button>
              {ec.parentId && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" title="Padam pecahan" onClick={() => setDel(true)}><Trash2 className="h-3 w-3" /></Button>
              )}
            </>
          )}
        </>
      )}
      {err && <p className="w-full text-red-600">{err}</p>}

      {adding && (
        <AddSplitDialog base={base} competition={competition} needsOriginal={!ec.splitLabel && !ec.parentId} onClose={() => setAdding(false)} />
      )}
      <ConfirmDialog open={del} onOpenChange={setDel} destructive
        title="Padam pecahan ini?" description={`Pecahan “${ec.splitLabel}” dan tetapannya akan dipadam. Pasukan berdaftar tidak terjejas.`}
        confirmLabel="Padam" onConfirm={async () => { setDel(false); if (await call("DELETE")) window.location.reload(); }} />
    </div>
  );
}

function AddSplitDialog({ base, competition, needsOriginal, onClose }: {
  base: string; competition: { code: string; name: string }; needsOriginal: boolean; onClose: () => void;
}) {
  const [original, setOriginal] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`${base}/split`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, ...(needsOriginal && { originalLabel: original }) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setErr(j.message ?? j.error ?? "Gagal"); return; }
    window.location.reload();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{needsOriginal ? "Pecahkan pertandingan" : "Tambah pecahan"} · {competition.code}</DialogTitle>
          <DialogDescription>
            Setiap pecahan dinilai sebagai pertandingan sendiri — kaedah, templat, tugas, keputusan dan sijil berasingan — dengan pasukan berdaftar yang sama.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-6 pb-6 pt-4">
          {needsOriginal && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-zinc-600">Label bahagian sedia ada</span>
              <Input value={original} onChange={e => setOriginal(e.target.value)} maxLength={SPLIT_LABEL_MAX} placeholder="cth. Kereta Terpantas" />
              <span className="block text-[11px] text-zinc-400">Tetapan, tugas dan markah sedia ada kekal di bahagian ini.</span>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-zinc-600">Label pecahan baharu</span>
            <Input value={label} onChange={e => setLabel(e.target.value)} maxLength={SPLIT_LABEL_MAX} placeholder="cth. Pembentangan Terbaik" />
          </label>
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
            Dipaparkan sebagai <b>{competition.code} {competition.name} — {label.trim() || "…"}</b>
          </p>
          <div className="flex items-center justify-end gap-2">
            {err && <p className="flex-1 text-xs text-red-600">{err}</p>}
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button disabled={busy || !label.trim() || (needsOriginal && !original.trim())} onClick={save}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {needsOriginal ? "Pecahkan" : "Tambah"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
