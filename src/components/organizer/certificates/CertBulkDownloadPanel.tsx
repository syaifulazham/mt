"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Download, Loader2, RotateCcw, Sparkles, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ZipFormat = "single" | "competition" | "state" | "contingent";
type ChunkBy = "none" | "state" | "contingent" | "competition" | "targetGroup";
type CertSort = "competition" | "contingent" | "name" | "serial";
type Count = { name: string; certs: number };
type Chunk = { key: string; label: string; certs: number; files: number };
type Plan = {
  total: number; files: number; chunks: Chunk[];
  facets: { states: Count[]; targetGroups: Count[]; competitions: Count[]; contingents: number };
};
type Advice = { format: ZipFormat; chunkBy: ChunkBy; sort: CertSort; reason: string; tips: string[]; source: "ai" | "rules" };
/** One ZIP of a download; `part`/`parts` when a failed ZIP was split further. */
type Run = Chunk & { state: "waiting" | "running" | "done" | "failed"; done: number; total: number; error?: string; split?: { part: number; parts: number }[] };

const FORMATS: { key: ZipFormat; label: string; hint: string }[] = [
  { key: "single",      label: "Setiap sijil",      hint: "Satu PDF bagi setiap sijil (dalam folder pertandingan). Fail besar — setiap PDF membawa latar templat sendiri." },
  { key: "competition", label: "Ikut pertandingan", hint: "Satu PDF berbilang halaman bagi setiap pertandingan." },
  { key: "state",       label: "Ikut negeri",       hint: "Satu PDF berbilang halaman bagi setiap negeri." },
  { key: "contingent",  label: "Ikut kontinjen",    hint: "Satu PDF berbilang halaman bagi setiap kontinjen, dalam folder negeri." },
];
const CHUNKS: { key: ChunkBy; label: string }[] = [
  { key: "none", label: "Satu ZIP" }, { key: "state", label: "Negeri" }, { key: "contingent", label: "Kontinjen" },
  { key: "competition", label: "Pertandingan" }, { key: "targetGroup", label: "Kumpulan sasaran" },
];
const SORT_OPTS: { key: CertSort; label: string; hint: string }[] = [
  { key: "competition", label: "Pertandingan", hint: "Ikut pertandingan, kemudian negeri, kedudukan dan kontinjen — susunan keputusan." },
  { key: "contingent",  label: "Kontinjen",    hint: "Ikut negeri dan kontinjen — sijil setiap sekolah berturutan, sedia untuk diserahkan." },
  { key: "name",        label: "Nama",         hint: "Ikut nama penerima A–Z — mudah mencari sijil seseorang." },
  { key: "serial",      label: "No. siri",     hint: "Ikut nombor siri — susunan pengeluaran, untuk rekod." },
];
const PURPOSES: { key: string; label: string; hint: string }[] = [
  { key: "PRINT",    label: "Percetakan",            hint: "Fail dihantar kepada pencetak." },
  { key: "SOFTCOPY", label: "Edaran salinan lembut", hint: "Fail dihantar kepada penerima / sekolah." },
  { key: "ARCHIVE",  label: "Simpanan fail",         hint: "Rekod lengkap untuk disimpan." },
  { key: "OTHER",    label: "Lain-lain",             hint: "Terangkan tujuannya." },
];
const btn = (on: boolean) => cn("rounded-md border px-2.5 py-1 font-medium transition-colors",
  on ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50");

/** A multi-select filter: a chip that opens a checklist with counts. */
function FilterMenu({ label, options, value, onChange }: { label: string; options: Count[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter(x => x !== n) : [...value, n]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn("flex items-center gap-1 rounded-md border px-2.5 py-1 font-medium", value.length ? "border-sky-300 bg-sky-50 text-sky-800" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
        {label}{value.length > 0 && <span className="rounded-full bg-sky-600 px-1.5 text-[10px] text-white">{value.length}</span>}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-30 max-h-72 w-72 overflow-y-auto rounded-xl border bg-white py-1 shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-1.5 text-[11px] text-zinc-500">
            <span>{options.length} pilihan</span>
            {value.length > 0 && <button onClick={() => onChange([])} className="text-sky-700 hover:underline">Kosongkan</button>}
          </div>
          {options.map(o => (
            <label key={o.name} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-50">
              <input type="checkbox" checked={value.includes(o.name)} onChange={() => toggle(o.name)} className="accent-sky-600" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="font-mono text-[10px] text-zinc-400">{o.certs.toLocaleString()}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bulk ZIP download of a generator's certificates: filters (states, target
 * groups, competitions, plus the page's search), how PDFs are grouped inside a
 * ZIP, and an optional split into several ZIPs downloaded one after another —
 * with live progress per ZIP. Pembantu AI suggests the settings for the numbers.
 */
export function CertBulkDownloadPanel({ jobId, query }: { jobId: string; query: string }) {
  const api = `/api/v2/organizer/certificates/generator/${jobId}/download`;
  const [format, setFormat] = useState<ZipFormat>("competition");
  const [chunkBy, setChunkBy] = useState<ChunkBy>("none");
  const [sort, setSort] = useState<CertSort>("competition");
  const [states, setStates] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [comps, setComps] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [advising, setAdvising] = useState(false);
  // Pembantu AI asks what the download is for before advising.
  const [asking, setAsking] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [runs, setRuns] = useState<Run[] | null>(null);
  const cancelRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const params = (extra: Record<string, string> = {}) => new URLSearchParams({
    format, chunkBy, sort, ...(query && { q: query }),
    ...(states.length && { states: states.join("|") }), ...(groups.length && { targetGroups: groups.join("|") }),
    ...(comps.length && { competitions: comps.join("|") }), ...extra,
  }).toString();
  const key = params();

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetch(`${api}/plan?${key}`, { cache: "no-store" }).then(r => r.json()).then(j => { if (alive && j.chunks) setPlan(j); }).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [api, key]);

  async function askAi() {
    setAdvising(true); setAdvice(null);
    try {
      const res = await fetch(`${api}/advice?${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, note }),
      });
      const j = await res.json();
      if (res.ok) { setAdvice(j.advice); setAsking(false); }
    } finally { setAdvising(false); }
  }

  const running = !!runs?.some(r => r.state === "running" || r.state === "waiting");

  // The settings the current list of ZIPs was made with, so a retry downloads
  // exactly the same part even if the form has been changed since.
  const runQueryRef = useRef<{ query: (extra: Record<string, string>) => string; chunked: boolean } | null>(null);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const patch = (i: number, p: Partial<Run>) => setRuns(rs => rs && rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  /** Downloads one ZIP of the list and follows its progress; returns how it ended. */
  async function downloadOne(i: number, run: Run): Promise<Partial<Run>> {
    const q = runQueryRef.current!;
    const token = crypto.randomUUID();
    patch(i, { state: "running", done: 0, error: undefined });
    // A hidden frame per ZIP: the browser saves it as a normal download (nothing held in memory).
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.src = `${api}?${q.query({
      token, ...(q.chunked && { chunk: run.key }),
      ...(run.split?.length && { split: run.split.map(x => `${x.part}/${x.parts}`).join(",") }),
    })}`;
    frameRef.current?.appendChild(frame);

    const began = Date.now();
    let seen = false, result: Partial<Run> = { state: "failed", error: "Tiada respons daripada pelayan." };
    for (;;) {
      await sleep(1000);
      if (cancelRef.current) { result = { state: "failed", error: "Dibatalkan." }; break; }
      const p = await fetch(`${api}/progress?token=${token}`, { cache: "no-store" }).then(r => r.json()).then(j => j.progress).catch(() => null);
      if (p) {
        seen = true;
        patch(i, { done: p.done, total: p.total || run.files });
        if (p.finished) { result = p.error ? { state: "failed", error: p.error } : { state: "done", done: p.total, total: p.total }; break; }
      } else if (!seen && Date.now() - began > 45_000) break;
    }
    patch(i, result);
    // Let the browser finish receiving the file before the next one starts.
    await sleep(800);
    if (cancelRef.current) frame.remove();
    // The frame's file has been handed to the browser; drop it so frames don't pile up.
    setTimeout(() => frame.remove(), 60_000);
    return result;
  }

  /** Downloads the given ZIPs of the list one after another. */
  async function runQueue(list: Run[], indices: number[]) {
    cancelRef.current = false;
    setRuns(rs => rs && rs.map((r, j) => (indices.includes(j) ? { ...r, state: "waiting", done: 0, error: undefined } : r)));
    for (const i of indices) {
      if (cancelRef.current) break;
      await downloadOne(i, list[i]);
    }
    setRuns(rs => rs && rs.map(r => (r.state === "waiting" ? { ...r, state: "failed", error: "Dibatalkan." } : r)));
  }

  async function start() {
    if (!plan?.chunks.length) return;
    const snapshot = params;
    runQueryRef.current = { query: (extra) => snapshot(extra), chunked: chunkBy !== "none" };
    const queue: Run[] = plan.chunks.map(c => ({ ...c, state: "waiting", done: 0, total: c.files }));
    setRuns(queue);
    await runQueue(queue, queue.map((_, i) => i));
  }

  /**
   * Splits a failed ZIP into `n` smaller ZIPs (whole PDFs, or runs of pages
   * when it holds fewer PDFs than parts) and downloads them. A part that fails
   * can be split again.
   */
  async function splitRun(index: number, n: number) {
    if (!runs || !runQueryRef.current) return;
    const r = runs[index];
    const name = r.label.replace(/ \(bahagian [^)]*\)$/, "");
    const path = (r.split ?? []).map(x => `${x.part}/${x.parts}`);
    const subs: Run[] = Array.from({ length: n }, (_, k) => ({
      ...r,
      split: [...(r.split ?? []), { part: k + 1, parts: n }],
      label: `${name} (bahagian ${[...path, `${k + 1}/${n}`].join(" › ")})`,
      certs: Math.ceil(r.certs / n), files: Math.max(1, Math.ceil(r.files / n)),
      state: "waiting", done: 0, total: Math.max(1, Math.ceil(r.files / n)), error: undefined,
    }));
    const list = [...runs.slice(0, index), ...subs, ...runs.slice(index + 1)];
    setRuns(list);
    await runQueue(list, subs.map((_, k) => index + k));
  }

  /** Retries one failed ZIP, or (no index) every failed one. */
  async function retry(index?: number) {
    if (!runs || !runQueryRef.current) return;
    const indices = index !== undefined ? [index] : runs.flatMap((r, i) => (r.state === "failed" ? [i] : []));
    if (indices.length) await runQueue(runs, indices);
  }

  const failedCount = runs?.filter(r => r.state === "failed").length ?? 0;
  const totalFiles = runs?.reduce((a, r) => a + r.total, 0) ?? 0;
  const doneFiles = runs?.reduce((a, r) => a + r.done, 0) ?? 0;
  const zips = plan?.chunks.length ?? 0;
  const warn = !plan ? null
    : zips > 60 ? `${zips} fail ZIP adalah banyak — pelayar akan meminta kebenaran muat turun berbilang; pertimbang pecahan yang lebih kasar.`
    : chunkBy === "none" && (plan.total > 2500 || (format === "single" && plan.total > 800)) ? `${plan.total.toLocaleString()} sijil dalam satu ZIP mengambil masa lama dan boleh terputus — pertimbang untuk memecahkannya.`
    : null;

  return (
    <div className="space-y-2.5 rounded-xl border bg-white px-3 py-3 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-800">Muat turun ZIP</span>
        <span className="text-zinc-400">Tapis</span>
        <FilterMenu label="Negeri" options={plan?.facets.states ?? []} value={states} onChange={setStates} />
        <FilterMenu label="Kumpulan sasaran" options={plan?.facets.targetGroups ?? []} value={groups} onChange={setGroups} />
        <FilterMenu label="Pertandingan" options={plan?.facets.competitions ?? []} value={comps} onChange={setComps} />
        {(states.length > 0 || groups.length > 0 || comps.length > 0) && (
          <button onClick={() => { setStates([]); setGroups([]); setComps([]); }} className="text-zinc-500 hover:underline">Kosongkan tapisan</button>
        )}
        {query && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">carian “{query}”</span>}
        <button type="button" onClick={() => setAsking(a => !a)} disabled={advising || !plan?.total}
          className="ml-auto flex items-center gap-1 rounded-full border border-violet-300 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-2.5 py-1 font-medium text-violet-700 disabled:opacity-50">
          {advising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Pembantu AI
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-zinc-500">Fail dalam ZIP</span>
        {FORMATS.map(f => <button key={f.key} type="button" title={f.hint} disabled={running} onClick={() => setFormat(f.key)} className={btn(format === f.key)}>{f.label}</button>)}
        <span className="text-zinc-400">{FORMATS.find(f => f.key === format)!.hint}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-zinc-500">Pecah ZIP ikut</span>
        {CHUNKS.map(c => <button key={c.key} type="button" disabled={running} onClick={() => setChunkBy(c.key)} className={btn(chunkBy === c.key)}>{c.label}</button>)}
        <span className="text-zinc-400">{chunkBy === "none" ? "Semua dalam satu fail ZIP." : "Beberapa fail ZIP, dimuat turun satu demi satu."}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-zinc-500">Susunan</span>
        {SORT_OPTS.map(o => <button key={o.key} type="button" title={o.hint} disabled={running} onClick={() => setSort(o.key)} className={btn(sort === o.key)}>{o.label}</button>)}
        <span className="text-zinc-400">{SORT_OPTS.find(o => o.key === sort)!.hint}</span>
      </div>

      {asking && (
        <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-medium text-violet-900"><Sparkles className="h-3.5 w-3.5" /> Muat turun ini untuk tujuan apa?</p>
          <div className="flex flex-wrap gap-2">
            {PURPOSES.map(p => (
              <button key={p.key} type="button" title={p.hint} onClick={() => setPurpose(p.key)}
                className={cn("rounded-md border px-2.5 py-1 font-medium transition-colors",
                  purpose === p.key ? "border-violet-600 bg-violet-600 text-white" : "bg-white text-zinc-600 hover:bg-violet-50")}>
                {p.label}
              </button>
            ))}
          </div>
          {purpose && (
            <div className="flex flex-wrap items-center gap-2">
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={400}
                onKeyDown={e => { if (e.key === "Enter" && !advising && (purpose !== "OTHER" || note.trim())) void askAi(); }}
                placeholder={purpose === "OTHER" ? "Terangkan tujuan muat turun…" : "Butiran tambahan (pilihan) — cth. dicetak oleh vendor, diedar melalui penyelaras negeri"}
                className="h-8 min-w-64 flex-1 rounded-md border bg-white px-2 focus:outline-none focus:ring-2 focus:ring-violet-200" />
              <button type="button" onClick={askAi} disabled={advising || (purpose === "OTHER" && !note.trim())}
                className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                {advising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Dapatkan cadangan
              </button>
            </div>
          )}
        </div>
      )}

      {advice && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg bg-violet-50 px-3 py-2 text-violet-900">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <p>
              <b>Cadangan untuk {PURPOSES.find(p => p.key === purpose)?.label.toLowerCase() ?? "muat turun ini"}{advice.source === "rules" && " (peraturan asas — AI tidak tersedia)"}:</b>{" "}
              fail <b>{FORMATS.find(f => f.key === advice.format)?.label}</b>, pecah <b>{CHUNKS.find(c => c.key === advice.chunkBy)?.label}</b>, susun ikut <b>{SORT_OPTS.find(o => o.key === advice.sort)?.label.toLowerCase()}</b>. {advice.reason}
            </p>
            {advice.tips.length > 0 && <ul className="list-disc pl-4 text-violet-800">{advice.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
          </div>
          <button type="button" disabled={running} onClick={() => { setFormat(advice.format); setChunkBy(advice.chunkBy); setSort(advice.sort ?? "competition"); }}
            className="shrink-0 rounded-md bg-violet-600 px-2.5 py-1 font-medium text-white hover:bg-violet-700 disabled:opacity-50">Guna cadangan</button>
          <button type="button" onClick={() => setAdvice(null)} className="shrink-0 text-violet-500 hover:text-violet-800"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-2.5">
        <span className="text-zinc-600">
          {!plan ? <Loader2 className="inline h-3 w-3 animate-spin" /> : plan.total === 0 ? "Tiada sijil sepadan dengan tapisan." : (
            <><b className="text-zinc-900">{plan.total.toLocaleString()}</b> sijil → <b className="text-zinc-900">{plan.files.toLocaleString()}</b> PDF dalam <b className="text-zinc-900">{zips}</b> fail ZIP</>
          )}
          <span className="text-zinc-400"> · sijil dibatalkan tidak disertakan</span>
        </span>
        {warn && <span className="flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {warn}</span>}
        {running ? (
          <button type="button" onClick={() => { cancelRef.current = true; }} className="ml-auto rounded-md border px-3 py-1.5 font-medium text-red-600 hover:bg-red-50">Batal</button>
        ) : (
          <button type="button" onClick={start} disabled={!plan?.total}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#085782] px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Muat turun{plan?.total ? ` (${plan.total.toLocaleString()})` : ""}
          </button>
        )}
      </div>

      {runs && (
        <div className="space-y-2 rounded-lg border bg-zinc-50 p-2.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-700">
              {running ? "Menjana…" : runs.every(r => r.state === "done") ? "Selesai" : "Tamat dengan ralat"} · {runs.filter(r => r.state === "done").length}/{runs.length} ZIP · {doneFiles.toLocaleString()}/{totalFiles.toLocaleString()} PDF
            </span>
            {!running && failedCount > 0 && (
              <button type="button" onClick={() => void retry()}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-[#085782] px-2.5 py-1 font-medium text-[#085782] hover:bg-sky-50">
                <RotateCcw className="h-3 w-3" /> Cuba semula yang gagal ({failedCount})
              </button>
            )}
            {!running && <button onClick={() => setRuns(null)} className={cn("text-zinc-400 hover:text-zinc-700", failedCount === 0 && "ml-auto")}><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full bg-[#085782] transition-all" style={{ width: `${totalFiles ? Math.round((doneFiles / totalFiles) * 100) : 0}%` }} />
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {runs.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                {r.state === "done" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  : r.state === "failed" ? <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  : r.state === "running" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#085782]" />
                  : <Check className="h-3.5 w-3.5 shrink-0 text-zinc-300" />}
                <span className="min-w-0 flex-1 truncate text-zinc-700">{r.label}</span>
                <span className="w-28 shrink-0">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-zinc-200">
                    <span className={cn("block h-full", r.state === "failed" ? "bg-red-400" : "bg-emerald-500")} style={{ width: `${r.total ? Math.round((r.done / r.total) * 100) : 0}%` }} />
                  </span>
                </span>
                <span className={cn("w-40 shrink-0 text-right font-mono text-[10px]", r.state === "failed" ? "text-red-600" : "text-zinc-500")} title={r.error}>
                  {r.state === "failed" ? r.error : r.state === "waiting" ? "menunggu" : `${r.done}/${r.total} PDF · ${r.certs.toLocaleString()} sijil`}
                </span>
                <span className="w-44 shrink-0 text-right">
                  {r.state === "failed" && !running && (
                    <span className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => void retry(i)} title={`Muat turun semula ${r.label}`}
                        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium text-[#085782] hover:bg-sky-50">
                        <RotateCcw className="h-3 w-3" /> Cuba semula
                      </button>
                      {r.certs > 1 && (
                        <select value="" onChange={e => { const n = Number(e.target.value); if (n) void splitRun(i, n); }}
                          title="Pecahkan ZIP ini kepada bahagian yang lebih kecil dan muat turun semula"
                          className="h-5 rounded border bg-white px-1 text-[10px] font-medium text-[#085782] hover:bg-sky-50">
                          <option value="">Pecah…</option>
                          {[2, 4, 8].filter(n => n <= r.certs).map(n => <option key={n} value={n}>{n} bahagian</option>)}
                        </select>
                      )}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div ref={frameRef} className="hidden" />
    </div>
  );
}
