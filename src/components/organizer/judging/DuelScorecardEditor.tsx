"use client";

import { useState } from "react";
import { AlertCircle, Ban, FileText, Loader2, Minus, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DuelConfig } from "@/lib/duel";
import { maxGain, newScoreItem, newScoreOption, parseScorecard, type ScoreItem, type Scorecard } from "@/lib/duel-scorecard";

/** Seamless segmented buttons for a single choice (the scorecard's CHOICE items). */
export function ChoiceToggle({ options, value, onChange, tone = "gain", disabled }: {
  options: { id: string; label: string; points: number }[]; value: string | null; onChange: (id: string | null) => void;
  tone?: "gain" | "penalty"; disabled?: boolean;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap overflow-hidden rounded-lg border bg-white">
      {options.map((o, i) => {
        const on = value === o.id;
        return (
          <button key={o.id} type="button" disabled={disabled} onClick={() => onChange(on ? null : o.id)}
            className={cn("px-3 py-1.5 text-xs font-medium transition-colors", i > 0 && "border-l",
              on ? (tone === "penalty" ? "bg-red-600 text-white" : "bg-emerald-600 text-white") : "text-zinc-600 hover:bg-zinc-50")}>
            {o.label || "…"} <span className={cn("font-mono text-[10px]", on ? "text-white/80" : "text-zinc-400")}>{tone === "penalty" ? "−" : "+"}{o.points}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Kad skor duel (Penghakiman → Duel): the items a marshal marks for each team
 * in a duel — Mata (gains) and Penalti, as counters or single choices; a
 * penalty can disqualify. Drafted by hand or by Pembantu AI from a prompt or
 * rule documents; saved into the duel settings.
 */
export function DuelScorecardEditor({ base, canWrite, config, onSaved }: {
  base: string; canWrite: boolean; config: DuelConfig; onSaved: (c: DuelConfig) => void;
}) {
  const [card, setCard] = useState<Scorecard>(config.scorecard);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ai, setAi] = useState(false);

  const update = (next: Scorecard) => { setCard(next); setDirty(true); };
  const setItem = (id: string, patch: Partial<ScoreItem>) => update({ ...card, items: card.items.map(i => (i.id === id ? { ...i, ...patch } : i)) });

  async function save() {
    setBusy(true); setErr("");
    try {
      const clean = parseScorecard(card);
      const res = await fetch(`${base}/duel-config`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duelConfig: { ...config, scorecard: clean } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      onSaved(j.duelConfig); setCard(j.duelConfig.scorecard); setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  const group = (g: ScoreItem["group"]) => {
    const penalty = g === "PENALTY";
    const items = card.items.filter(i => i.group === g);
    return (
      <div className={cn("space-y-2 rounded-xl border p-3", penalty ? "border-red-100 bg-red-50/40" : "border-emerald-100 bg-emerald-50/40")}>
        <p className={cn("text-xs font-bold uppercase tracking-wide", penalty ? "text-red-700" : "text-emerald-700")}>{penalty ? "Penalti (ditolak)" : "Mata (ditambah)"}</p>
        {items.length === 0 && <p className="text-[11px] text-zinc-400">Tiada item.</p>}
        {items.map(it => (
          <div key={it.id} className="space-y-1.5 rounded-lg border bg-white p-2">
            <div className="flex items-center gap-1.5">
              <Input value={it.label} disabled={!canWrite} onChange={e => setItem(it.id, { label: e.target.value })}
                placeholder={penalty ? "cth. Keluar gelanggang" : "cth. Tumbangkan lawan"} className="h-7 flex-1 text-xs" />
              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">{it.kind === "COUNT" ? "Kiraan" : "Pilihan tunggal"}</span>
              {canWrite && <button onClick={() => update({ ...card, items: card.items.filter(x => x.id !== it.id) })} className="rounded p-1 text-zinc-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {it.kind === "COUNT" ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span className="font-mono">{penalty ? "−" : "+"}</span>
                <Input value={String(it.points)} disabled={!canWrite} onChange={e => setItem(it.id, { points: Math.abs(Number(e.target.value) || 0) })} className="h-7 w-14 text-xs" />
                mata setiap kali · maks
                <Input value={String(it.max)} disabled={!canWrite || it.disqualify} onChange={e => setItem(it.id, { max: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} className="h-7 w-14 text-xs" />
                kali <span className="text-zinc-400">(0 = tiada had)</span>
                {penalty && (
                  <label className="ml-auto flex items-center gap-1 font-medium text-red-700">
                    <input type="checkbox" checked={it.disqualify} disabled={!canWrite} className="accent-red-600"
                      onChange={e => setItem(it.id, { disqualify: e.target.checked, max: e.target.checked ? 1 : it.max })} />
                    <Ban className="h-3 w-3" /> Hilang kelayakan
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {it.options.map(o => (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <Input value={o.label} disabled={!canWrite} placeholder="Pilihan" className="h-7 flex-1 text-xs"
                      onChange={e => setItem(it.id, { options: it.options.map(x => (x.id === o.id ? { ...x, label: e.target.value } : x)) })} />
                    <span className="font-mono text-[11px] text-zinc-400">{penalty ? "−" : "+"}</span>
                    <Input value={String(o.points)} disabled={!canWrite} className="h-7 w-14 text-xs"
                      onChange={e => setItem(it.id, { options: it.options.map(x => (x.id === o.id ? { ...x, points: Math.abs(Number(e.target.value) || 0) } : x)) })} />
                    {canWrite && it.options.length > 2 && (
                      <button onClick={() => setItem(it.id, { options: it.options.filter(x => x.id !== o.id) })} className="text-zinc-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2">
                  {canWrite && <button onClick={() => setItem(it.id, { options: [...it.options, newScoreOption()] })} className="flex items-center gap-1 text-[11px] text-violet-600 hover:underline"><Plus className="h-3 w-3" /> Pilihan</button>}
                  <ChoiceToggle options={it.options} value={null} onChange={() => {}} tone={penalty ? "penalty" : "gain"} disabled />
                </div>
              </div>
            )}
          </div>
        ))}
        {canWrite && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 gap-1 bg-white text-[11px]" onClick={() => update({ ...card, items: [...card.items, newScoreItem(g, "COUNT")] })}><Plus className="h-3 w-3" /> Kiraan</Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 bg-white text-[11px]" onClick={() => update({ ...card, items: [...card.items, newScoreItem(g, "CHOICE")] })}><Plus className="h-3 w-3" /> Pilihan tunggal</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2 rounded-xl border border-rose-100 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-zinc-800">Kad skor duel</span>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={card.enabled} disabled={!canWrite} className="accent-rose-600" onChange={e => update({ ...card, enabled: e.target.checked })} />
          Rekod keputusan menggunakan kad skor
        </label>
        <span className="text-[11px] text-zinc-400">{card.items.length} item{card.items.length > 0 && ` · maks mata ${maxGain(card)}${card.items.some(i => i.group === "GAIN" && i.kind === "COUNT" && !i.max) ? "+" : ""}`}</span>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => setAi(true)}
            className="ml-auto h-7 gap-1 rounded-full border-violet-300 bg-gradient-to-r from-violet-50 to-fuchsia-50 text-xs text-violet-700">
            <Sparkles className="h-3 w-3" /> Pembantu AI
          </Button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500">Marsyal menanda kad skor bagi setiap pasukan; kedudukan perlawanan mengikut jumlah markah (hilang kelayakan sentiasa di bawah). Markah sama diputuskan secara manual.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {group("GAIN")}
        {group("PENALTY")}
      </div>
      {canWrite && (
        <div className="flex items-center gap-3">
          <Button size="sm" className="h-7 bg-rose-600 text-xs hover:bg-rose-700" disabled={!dirty || busy} onClick={save}>
            {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Simpan kad skor
          </Button>
          {dirty && <span className="text-[11px] text-amber-600">Belum disimpan</span>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      )}
      {ai && <ScorecardAiDialog base={base} card={card} onClose={() => setAi(false)} onApply={items => { update({ enabled: true, items }); setAi(false); }} />}
    </div>
  );
}

function ScorecardAiDialog({ base, card, onClose, onApply }: {
  base: string; card: Scorecard; onClose: () => void; onApply: (items: ScoreItem[]) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [revise, setRevise] = useState(card.items.length > 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [out, setOut] = useState<{ items: ScoreItem[]; notes: string } | null>(null);

  async function run() {
    setBusy(true); setErr(""); setOut(null);
    try {
      const fd = new FormData();
      fd.set("prompt", prompt);
      files.forEach(f => fd.append("files", f));
      if (revise && card.items.length) fd.set("current", JSON.stringify(card.items.map(({ group, kind, label, points, max, disqualify, options }) => ({ group, kind, label, points, max, disqualify, options: options.map(o => ({ label: o.label, points: o.points })) }))));
      const res = await fetch(`${base}/duel-config/scorecard-ai`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      setOut({ items: j.items, notes: j.notes });
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /> Pembantu AI · Kad skor duel</DialogTitle>
          <DialogDescription>Terangkan cara pemarkahan atau muat naik peraturan pertandingan (PDF, Word, imej, teks, Excel).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-6 pb-6 pt-4">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
            placeholder="cth. Tumbangkan lawan 2 mata tanpa had; agresif Tinggi 3 / Sederhana 2 / Rendah 1; keluar gelanggang −1; robot rosak sebelum tamat hilang kelayakan."
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-1.5 text-xs text-zinc-600 hover:border-violet-300">
              <Upload className="h-3.5 w-3.5" /> Dokumen peraturan
              <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,image/*" className="hidden"
                onChange={e => { const add = [...(e.target.files ?? [])]; setFiles(f => [...f, ...add].slice(0, 5)); e.target.value = ""; }} />
            </label>
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px]">
                <FileText className="h-3 w-3" /> {f.name}
                <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </span>
            ))}
            {card.items.length > 0 && (
              <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
                <input type="checkbox" checked={revise} onChange={e => setRevise(e.target.checked)} className="accent-violet-600" /> Ubah suai kad skor semasa
              </label>
            )}
          </div>
          <Button className="gap-1.5 bg-violet-600 hover:bg-violet-700" disabled={busy || (!prompt.trim() && !files.length)} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Jana kad skor
          </Button>
          {err && <p className="flex items-start gap-1.5 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {err}</p>}
          {out && (
            <div className="space-y-2 rounded-xl border p-3">
              {out.notes && <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">{out.notes}</p>}
              {(["GAIN", "PENALTY"] as const).map(g => (
                <div key={g}>
                  <p className={cn("text-[11px] font-bold uppercase", g === "PENALTY" ? "text-red-700" : "text-emerald-700")}>{g === "PENALTY" ? "Penalti" : "Mata"}</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {out.items.filter(i => i.group === g).map(i => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-800">{i.label}</span>
                        {i.kind === "COUNT"
                          ? <span className="text-zinc-500">{g === "PENALTY" ? "−" : "+"}{i.points} setiap kali{i.max ? `, maks ${i.max}` : ", tiada had"}{i.disqualify && " · hilang kelayakan"}</span>
                          : <ChoiceToggle options={i.options} value={null} onChange={() => {}} tone={g === "PENALTY" ? "penalty" : "gain"} disabled />}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={onClose}>Batal</Button>
                <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => onApply(out.items)}>Guna dalam editor</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** − n + counter for a COUNT item (max 0 = no limit). */
export function CountStepper({ value, max, onChange, tone = "gain" }: { value: number; max: number; onChange: (n: number) => void; tone?: "gain" | "penalty" }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border bg-white">
      <button type="button" disabled={value <= 0} onClick={() => onChange(value - 1)} className="px-2 py-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
      <span className={cn("min-w-8 border-x px-2 py-1 text-center font-mono text-sm font-bold", value > 0 && (tone === "penalty" ? "text-red-600" : "text-emerald-700"))}>{value}</span>
      <button type="button" disabled={!!max && value >= max} onClick={() => onChange(value + 1)} className="px-2 py-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}
