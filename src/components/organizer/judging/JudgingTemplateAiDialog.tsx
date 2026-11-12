"use client";

import { useState } from "react";
import { AlertCircle, FileText, Loader2, Plus, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/judgingTime";
import { cn } from "@/lib/utils";
import type { DraftCriterion, TemplateDraft } from "@/lib/judging-template-ai";
import type { SetupTemplate } from "@/components/organizer/judging/JudgingSetupPanel";

const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,image/*";
const TYPE_LABEL: Record<DraftCriterion["type"], string> = {
  NUMBER: "Nombor", TIME: "Masa", SINGLE_OPTION: "Satu pilihan", MULTIPLE_OPTION: "Pelbagai pilihan",
};
const TYPE_CLS: Record<DraftCriterion["type"], string> = {
  NUMBER: "bg-violet-50 text-violet-700", TIME: "bg-amber-50 text-amber-700",
  SINGLE_OPTION: "bg-sky-50 text-sky-700", MULTIPLE_OPTION: "bg-emerald-50 text-emerald-700",
};
const EXAMPLES = [
  "Templat untuk larian kereta roket: masa terpantas (maks 2 saat, milisaat, 100 markah) dan potongan langgar halangan -1 setiap satu.",
  "Rubrik pembentangan: isi kandungan, penyampaian, soal jawab dan kreativiti, 25 markah setiap satu.",
  "Ikut skema pemarkahan dalam dokumen yang dimuat naik.",
];

/** Highest points a criterion can give (options: best single / all positive ones). */
function maxOf(c: DraftCriterion): number {
  if (c.type === "SINGLE_OPTION") return Math.max(0, ...c.options.map(o => o.weight));
  if (c.type === "MULTIPLE_OPTION") return c.options.reduce((a, o) => a + Math.max(0, o.weight), 0);
  return c.maxScore ?? 0;
}

/**
 * Pembantu AI (Penghakiman → Templat): Gemini drafts a judging template from a
 * prompt and/or documents (rules, rubrics, score sheets) with the competition
 * as context. The draft is editable and can be refined; "Cipta & tetapkan"
 * saves it and assigns it to the competition.
 */
export function JudgingTemplateAiDialog({ base, competition, onClose, onCreated }: {
  base: string; competition: { code: string; name: string }; onClose: () => void; onCreated: (t: SetupTemplate) => void;
}) {
  const api = `${base}/judging-templates/ai`;
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState<"draft" | "create" | null>(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  async function generate(previous: TemplateDraft | null) {
    setBusy("draft"); setErr(""); setInfo("");
    try {
      const fd = new FormData();
      fd.set("prompt", previous ? refine : prompt);
      if (!previous) files.forEach(f => fd.append("files", f));
      if (previous) fd.set("previous", JSON.stringify(previous));
      const res = await fetch(api, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal menjana");
      setDraft(j.draft);
      if (previous) setRefine("");
      if (j.skipped?.length) setInfo(`Tidak dapat dibaca: ${j.skipped.join(", ")}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menjana"); }
    finally { setBusy(null); }
  }

  async function create() {
    if (!draft) return;
    setBusy("create"); setErr("");
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", draft }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal mencipta");
      onCreated(j.template);
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal mencipta"); }
    finally { setBusy(null); }
  }

  const setC = (i: number, patch: Partial<DraftCriterion>) =>
    setDraft(d => d && { ...d, criterions: d.criterions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const n = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const total = draft?.criterions.reduce((a, c) => a + maxOf(c), 0) ?? 0;

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /> Pembantu AI · Templat penghakiman · {competition.code} {competition.name}</DialogTitle>
          <DialogDescription>
            Terangkan templat yang diperlukan, atau muat naik peraturan / rubrik / borang markah (PDF, Word, imej, teks, Excel). Draf boleh disunting dan diperhalusi sebelum dicipta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 px-6 pb-6 pt-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Request */}
          <div className="space-y-3">
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6}
              placeholder="cth. Templat pembentangan terbaik: kandungan 30, penyampaian 30, soal jawab 20, kreativiti 20."
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(x => (
                <button key={x} type="button" onClick={() => setPrompt(x)}
                  className="max-w-full truncate rounded-full border bg-white px-2.5 py-1 text-left text-[11px] text-zinc-600 hover:border-violet-300 hover:text-violet-700">{x}</button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-sm text-zinc-600 hover:border-violet-300">
              <Upload className="h-4 w-4 text-zinc-400" />
              <span className="flex-1">Muat naik dokumen <span className="text-[11px] text-zinc-400">(maks 5, jumlah 15 MB)</span></span>
              <input type="file" multiple accept={ACCEPT} className="hidden"
                onChange={e => { const add = [...(e.target.files ?? [])]; setFiles(f => [...f, ...add].slice(0, 5)); e.target.value = ""; }} />
            </label>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-zinc-400">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            <Button className="w-full gap-1.5 bg-violet-600 hover:bg-violet-700" disabled={busy !== null || (!prompt.trim() && !files.length)} onClick={() => generate(null)}>
              {busy === "draft" && !draft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {draft ? "Jana semula draf" : "Jana draf"}
            </Button>
            {err && <p className="flex items-start gap-1.5 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {err}</p>}
            {info && <p className="text-xs text-amber-700">{info}</p>}
          </div>

          {/* Draft */}
          <div className="min-w-0 space-y-3">
            {!draft ? (
              <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center text-sm text-zinc-400">
                {busy === "draft" ? <><Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Pembantu AI sedang merangka templat…</> : <>Draf templat akan dipaparkan di sini.</>}
              </div>
            ) : (
              <>
                {draft.notes && <p className="flex items-start gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {draft.notes}</p>}
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Nama templat" className="font-semibold" />
                  <Input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) })} placeholder="KOD" className="font-mono" />
                </div>
                <Input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Penerangan (pilihan)" className="text-sm" />

                <div className="space-y-2">
                  {draft.criterions.map((c, i) => (
                    <div key={i} className="space-y-2 rounded-xl border bg-white p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-center font-mono text-xs text-zinc-400">{i + 1}</span>
                        <Input value={c.name} onChange={e => setC(i, { name: e.target.value })} className="h-8 flex-1 text-sm" />
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", TYPE_CLS[c.type])}>{TYPE_LABEL[c.type]}</span>
                        <button title="Buang kriteria" onClick={() => setDraft({ ...draft, criterions: draft.criterions.filter((_, j) => j !== i) })}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      {c.type === "NUMBER" && (
                        <div className="flex items-center gap-2 pl-7 text-[11px] text-zinc-500">
                          Markah <Input value={c.minScore ?? ""} onChange={e => setC(i, { minScore: n(e.target.value) })} className="h-7 w-16 text-xs" />
                          hingga <Input value={c.maxScore ?? ""} onChange={e => setC(i, { maxScore: n(e.target.value) })} className="h-7 w-16 text-xs" />
                        </div>
                      )}
                      {c.type === "TIME" && (
                        <div className="flex flex-wrap items-center gap-2 pl-7 text-[11px] text-zinc-500">
                          Masa maks (saat) <Input value={c.maxTime ?? ""} onChange={e => setC(i, { maxTime: n(e.target.value) })} className="h-7 w-20 text-xs" />
                          {c.maxTime != null && <span className="font-mono">= {formatTime(c.maxTime, c.timePrecision, true)}</span>}
                          · Markah maks <Input value={c.maxScore ?? ""} onChange={e => setC(i, { maxScore: n(e.target.value) })} placeholder="—" className="h-7 w-16 text-xs" />
                          <select value={c.timePrecision} onChange={e => setC(i, { timePrecision: Number(e.target.value) as 0 | 2 | 3 })} className="h-7 rounded-md border bg-white px-1 text-xs">
                            <option value={0}>saat</option><option value={2}>1/100 saat</option><option value={3}>milisaat</option>
                          </select>
                          <span className="w-full text-zinc-400">{c.maxScore != null ? `Markah ${c.maxScore} pada 0 s, berkurang ke 0 pada masa maks.` : "Tanpa markah maks — masa hanya penentu seri."}</span>
                        </div>
                      )}
                      {(c.type === "SINGLE_OPTION" || c.type === "MULTIPLE_OPTION") && (
                        <div className="space-y-1 pl-7">
                          {c.options.map((o, k) => (
                            <div key={k} className="flex items-center gap-2">
                              <Input value={o.label} onChange={e => setC(i, { options: c.options.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} className="h-7 flex-1 text-xs" />
                              <Input value={String(o.weight)} onChange={e => setC(i, { options: c.options.map((x, m) => (m === k ? { ...x, weight: n(e.target.value) ?? 0 } : x)) })}
                                className={cn("h-7 w-16 text-right font-mono text-xs", o.weight < 0 && "text-red-600")} />
                              <button onClick={() => setC(i, { options: c.options.filter((_, m) => m !== k) })} className="text-zinc-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ))}
                          <button onClick={() => setC(i, { options: [...c.options, { label: "Pilihan baharu", weight: 0 }] })}
                            className="flex items-center gap-1 text-[11px] text-violet-600 hover:underline"><Plus className="h-3 w-3" /> Tambah pilihan</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {draft.criterions.length === 0 && <p className="rounded-xl border border-dashed py-4 text-center text-xs text-zinc-400">Tiada kriteria.</p>}
                </div>
                <p className="text-right text-xs text-zinc-500">{draft.criterions.length} kriteria · markah maksimum <b className="text-zinc-800">{Math.round(total * 100) / 100}</b></p>

                <div className="flex gap-2">
                  <Input value={refine} onChange={e => setRefine(e.target.value)} placeholder="Perhalusi… cth. tambah kriteria keselamatan 10 markah"
                    onKeyDown={e => { if (e.key === "Enter" && refine.trim() && !busy) generate(draft); }} className="text-sm" />
                  <Button variant="outline" className="shrink-0 gap-1.5" disabled={busy !== null || !refine.trim()} onClick={() => generate(draft)}>
                    {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-violet-500" />} Perhalusi
                  </Button>
                </div>
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="outline" onClick={onClose} disabled={busy !== null}>Batal</Button>
                  <Button className="gap-1.5 bg-violet-600 hover:bg-violet-700" disabled={busy !== null || !draft.name.trim() || draft.criterions.length === 0} onClick={create}>
                    {busy === "create" && <Loader2 className="h-4 w-4 animate-spin" />} Cipta & tetapkan templat
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
