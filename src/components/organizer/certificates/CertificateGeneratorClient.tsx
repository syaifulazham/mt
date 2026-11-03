"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Play, Plus, Trash2, CheckCircle2, AlertTriangle, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Certificates → Generator. A generator = template + recipient data
// (event participants / event winners / all registered / custom) + settings.
// "Jana" issues certificate rows in batches with visible progress; re-running
// skips recipients already issued for the template.

type Template = { id: string; name: string; targetType: string; season: { name: string } };
type EventOpt = { id: string; name: string; slug: string; scope: string };
type Job = {
  id: string; templateId: string; templateName: string; source: Source; status: string;
  total: number; created: number; skipped: number; error: string | null;
  createdBy: string | null; createdAt: string; completedAt: string | null; eventName: string | null;
  config: { eventId?: string; competitionCodes?: string[]; attendedOnly?: boolean; rankFrom?: number; rankTo?: number;
            verifiedOnly?: boolean; contingentType?: string; eventNameOverride?: string; rowCount?: number };
};
type Source = "EVENT_PARTICIPANTS" | "EVENT_WINNERS" | "ALL_REGISTERED" | "CUSTOM";

const API = "/api/v2/organizer/certificates/generator";
const SOURCE_LABEL: Record<Source, string> = {
  EVENT_PARTICIPANTS: "Peserta Acara",
  EVENT_WINNERS:      "Pencapaian Acara",
  ALL_REGISTERED:     "Semua Berdaftar",
  CUSTOM:             "Custom",
};
const CONTINGENT_TYPES = [["", "Semua kontinjen"], ["SCHOOL", "Sekolah"], ["HIGHER", "IPT"], ["INDEPENDENT", "Bebas"], ["INTERNATIONAL", "Antarabangsa"]];
const CUSTOM_COLUMNS = ["nama", "ic", "kontingen", "sekolah", "negeri", "pasukan", "pertandingan", "kod", "anugerah", "kedudukan"];
const fmt = (n: number) => n.toLocaleString();

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (${r.status})`);
  return j as T;
}

/** CSV / tab-separated paste → custom rows. First line may be a header with CUSTOM_COLUMNS names. */
function parseCustom(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(",")).map(c => c.trim().replace(/^"|"$/g, ""));
  const first = split(lines[0]).map(c => c.toLowerCase());
  const hasHeader = first.includes("nama") || first.includes("name");
  const cols = hasHeader ? first.map(c => (c === "name" ? "nama" : c)) : CUSTOM_COLUMNS;
  return (hasHeader ? lines.slice(1) : lines).map(l => {
    const v = split(l);
    const get = (k: string) => { const i = cols.indexOf(k); return i >= 0 ? v[i] || undefined : undefined; };
    const rank = Number(get("kedudukan"));
    return {
      name: get("nama") ?? "", ic: get("ic"), contingent: get("kontingen"), school: get("sekolah"), state: get("negeri"),
      team: get("pasukan"), competition: get("pertandingan"), competitionCode: get("kod"), award: get("anugerah"),
      rank: Number.isFinite(rank) && rank > 0 ? rank : null,
    };
  }).filter(r => r.name);
}

function describe(j: Job) {
  const c = j.config;
  const parts: string[] = [];
  if (j.eventName) parts.push(j.eventName);
  if (j.source === "EVENT_WINNERS") parts.push(`Kedudukan ${c.rankFrom ?? 1} – ${c.rankTo ?? 3}${c.verifiedOnly === false ? " · termasuk belum disahkan" : ""}`);
  if (j.source === "EVENT_PARTICIPANTS" && c.attendedOnly) parts.push("Hadir sahaja");
  if (c.competitionCodes?.length) parts.push(`${c.competitionCodes.length} pertandingan`);
  if (j.source === "ALL_REGISTERED") parts.push(CONTINGENT_TYPES.find(t => t[0] === (c.contingentType ?? ""))?.[1] ?? "");
  if (j.source === "CUSTOM") parts.push(`${fmt(c.rowCount ?? 0)} baris`);
  if (c.eventNameOverride) parts.push(`Nama acara: "${c.eventNameOverride}"`);
  return parts.filter(Boolean);
}

// ── New generator form ───────────────────────────────────────────────────────
function NewGenerator({ templates, events, onCreated, onCancel }: {
  templates: Template[]; events: EventOpt[]; onCreated: () => void; onCancel: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [source, setSource] = useState<Source | "">("");
  const [eventId, setEventId] = useState("");
  const [competitions, setCompetitions] = useState<{ code: string; name: string }[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [attendedOnly, setAttendedOnly] = useState(false);
  const [rankFrom, setRankFrom] = useState(1);
  const [rankTo, setRankTo] = useState(3);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [contingentType, setContingentType] = useState("");
  const [customText, setCustomText] = useState("");
  const [eventNameOverride, setOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const needsEvent = source === "EVENT_PARTICIPANTS" || source === "EVENT_WINNERS";
  const customRows = source === "CUSTOM" ? parseCustom(customText) : [];
  const chosen = templates.find(t => t.id === templateId);

  async function pickEvent(id: string) {
    setEventId(id); setCodes([]); setCompetitions([]);
    if (id) call<{ competitions: { code: string; name: string }[] }>(`${API}?eventId=${id}`).then(j => setCompetitions(j.competitions)).catch(() => {});
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      await call(API, { method: "POST", body: JSON.stringify({
        templateId, source,
        config: { eventId: eventId || undefined, competitionCodes: codes, attendedOnly, rankFrom, rankTo, verifiedOnly, contingentType, eventNameOverride,
                  rows: source === "CUSTOM" ? customRows : undefined },
      }) });
      onCreated();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  const sel = "h-9 rounded-md border bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";
  const ready = templateId && source && (!needsEvent || eventId) && (source !== "CUSTOM" || customRows.length > 0) && (source !== "EVENT_WINNERS" || rankTo >= rankFrom);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">Template</p>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} className={cn(sel, "w-72")}>
            <option value="">Pilih templat…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {chosen && <p className="text-[11px] text-zinc-400">{chosen.season.name} · {chosen.targetType}</p>}
        </div>
        <ArrowRight className="mt-8 h-4 w-4 text-zinc-300" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-zinc-500">Data Penerima</p>
          <select value={source} onChange={e => setSource(e.target.value as Source)} className={cn(sel, "w-56")}>
            <option value="">Pilih…</option>
            {(Object.keys(SOURCE_LABEL) as Source[]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>

          {source && (
            <div className="mt-2 space-y-3 rounded-lg border bg-zinc-50/60 p-3 text-sm">
              {needsEvent && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-28 text-xs text-zinc-500">Acara</span>
                  <select value={eventId} onChange={e => pickEvent(e.target.value)} className={cn(sel, "w-80")}>
                    <option value="">Pilih acara…</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.name} ({e.scope})</option>)}
                  </select>
                </div>
              )}
              {needsEvent && competitions.length > 0 && (
                <div className="flex flex-wrap items-start gap-2">
                  <span className="w-28 pt-1 text-xs text-zinc-500">Pertandingan</span>
                  <div className="flex max-w-xl flex-1 flex-wrap gap-1">
                    <button type="button" onClick={() => setCodes([])}
                      className={cn("rounded-full border px-2 py-0.5 text-[11px]", codes.length === 0 ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600")}>Semua</button>
                    {competitions.map(c => {
                      const on = codes.includes(c.code);
                      return (
                        <button key={c.code} type="button" title={c.name}
                          onClick={() => setCodes(on ? codes.filter(x => x !== c.code) : [...codes, c.code])}
                          className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", on ? "border-[#085782] bg-sky-50 text-[#085782]" : "bg-white text-zinc-600")}>
                          {c.code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {source === "EVENT_PARTICIPANTS" && (
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <span className="w-28 text-zinc-500">Kehadiran</span>
                  <input type="checkbox" checked={attendedOnly} onChange={e => setAttendedOnly(e.target.checked)} /> Pasukan yang hadir sahaja
                </label>
              )}
              {source === "EVENT_WINNERS" && (
                <>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-zinc-500">Kedudukan</span>
                    <input type="number" min={1} value={rankFrom} onChange={e => setRankFrom(Number(e.target.value) || 1)} className={cn(sel, "h-8 w-16")} />
                    <span>–</span>
                    <input type="number" min={1} value={rankTo} onChange={e => setRankTo(Number(e.target.value) || 1)} className={cn(sel, "h-8 w-16")} />
                    <span className="text-zinc-400">Anugerah: 1 Tempat Pertama · 2+ Tempat Ke-n</span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <span className="w-28 text-zinc-500">Keputusan</span>
                    <input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} /> Pertandingan yang telah disahkan (VERIFIED) sahaja
                  </label>
                </>
              )}
              {source === "ALL_REGISTERED" && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-zinc-500">Kontinjen</span>
                  <select value={contingentType} onChange={e => setContingentType(e.target.value)} className={cn(sel, "w-56")}>
                    {CONTINGENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              )}
              {source === "CUSTOM" && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">
                    Tampal dari Excel / CSV. Baris pertama boleh menjadi tajuk: <span className="font-mono text-[11px]">{CUSTOM_COLUMNS.join(", ")}</span>.
                    Tanpa tajuk, lajur dibaca dalam susunan itu.
                  </p>
                  <textarea value={customText} onChange={e => setCustomText(e.target.value)} rows={5}
                    placeholder={"nama,ic,kontingen,pertandingan,anugerah\nAli bin Abu,080101-01-0101,SMK Bukit Jalil,Cabaran EZBOT,Tempat Pertama"}
                    className="w-full rounded-md border bg-white p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-200" />
                  <p className="text-[11px] text-zinc-400">{fmt(customRows.length)} baris dikesan.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-28 text-xs text-zinc-500">Nama acara</span>
                <input value={eventNameOverride} onChange={e => setOverride(e.target.value)} maxLength={120}
                  placeholder={needsEvent ? "Kosongkan untuk guna nama acara asal" : "Pilihan — dicetak pada sijil"}
                  className={cn(sel, "w-80")} />
              </div>
            </div>
          )}
        </div>
      </div>
      {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Batal</Button>
        <Button size="sm" onClick={save} disabled={!ready || saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Simpan penjana
        </Button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function CertificateGeneratorClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<{ id: string; processed: number; total: number; created: number; skipped: number } | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await call<{ jobs: Job[]; templates: Template[]; events: EventOpt[] }>(API);
      setJobs(j.jobs); setTemplates(j.templates); setEvents(j.events);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  const [confirmRun, setConfirmRun] = useState<Job | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null);

  async function run(job: Job) {
    setConfirmRun(null);
    setErr("");
    let offset: number | null = 0, created = 0, skipped = 0;
    setRunning({ id: job.id, processed: 0, total: job.total, created: 0, skipped: 0 });
    try {
      while (offset !== null) {
        const r: { created: number; skipped: number; processed: number; total: number; nextOffset: number | null } =
          await call(`${API}/${job.id}`, { method: "POST", body: JSON.stringify({ offset }) });
        created += r.created; skipped += r.skipped;
        setRunning({ id: job.id, processed: r.processed, total: r.total, created, skipped });
        offset = r.nextOffset;
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menjana"); }
    finally { setRunning(null); load(); }
  }

  async function remove(job: Job) {
    setConfirmDelete(null);
    await call(`${API}/${job.id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Certificate Generator</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Jana rekod sijil daripada templat untuk peserta acara, pemenang acara, semua peserta berdaftar atau senarai sendiri.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} disabled={!templates.length}>
            <Plus className="mr-1.5 h-4 w-4" /> Create New Generator
          </Button>
        )}
      </div>

      {!loading && !templates.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Tiada templat yang telah diterbitkan. Terbitkan templat di <Link href="/organizer/certificates" className="underline">Templates</Link> dahulu.
        </p>
      )}

      {creating && (
        <NewGenerator templates={templates} events={events}
          onCreated={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      )}

      {err && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {err}</p>}

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
      ) : jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white py-12 text-center text-sm text-zinc-400">Belum ada penjana. Klik “Create New Generator”.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map(j => {
            const isRunning = running?.id === j.id;
            const pct = isRunning && running.total ? Math.round((running.processed / running.total) * 100) : j.status === "DONE" ? 100 : 0;
            return (
              <div key={j.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-64 min-w-0">
                    <p className="text-[11px] font-medium text-zinc-400">Template</p>
                    <p className="truncate rounded-md border bg-zinc-50 px-2.5 py-1.5 text-sm" title={j.templateName}>{j.templateName}</p>
                  </div>
                  <ArrowRight className="mt-6 h-4 w-4 shrink-0 text-zinc-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-zinc-400">Data Penerima</p>
                    <p className="rounded-md border bg-zinc-50 px-2.5 py-1.5 text-sm font-medium">{SOURCE_LABEL[j.source]}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {describe(j).map(d => <span key={d} className="rounded border bg-white px-1.5 py-0.5 text-[11px] text-zinc-600">{d}</span>)}
                    </div>
                  </div>
                  <ArrowRight className="mt-6 h-4 w-4 shrink-0 text-zinc-300" />
                  <div className="w-64">
                    <p className="text-[11px] font-medium text-zinc-400">Tindakan</p>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" className="h-8 flex-1" onClick={() => setConfirmRun(j)} disabled={!!running}>
                        {isRunning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          : j.status === "DONE" ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                        {isRunning ? "Menjana…" : j.status === "DONE" ? "Jana semula" : "Jana"}
                      </Button>
                      <button onClick={() => setConfirmDelete(j)} disabled={!!running} title="Padam penjana"
                        className="rounded p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className={cn("h-full rounded-full transition-all duration-300", j.status === "FAILED" && !isRunning ? "bg-red-500" : "bg-[#085782]")}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {isRunning
                        ? `${fmt(running.processed)} / ${fmt(running.total)} · ${fmt(running.created)} baharu · ${fmt(running.skipped)} dilangkau`
                        : j.status === "DONE"
                          ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> {fmt(j.created)} dijana · {fmt(j.skipped)} sedia ada · {fmt(j.total)} penerima</span>
                          : j.status === "FAILED"
                            ? <span className="inline-flex items-center gap-1 text-red-600"><X className="h-3 w-3" /> {j.error}</span>
                            : `${fmt(j.total)} penerima · belum dijana`}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-zinc-400">
                  Dicipta {new Date(j.createdAt).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}{j.createdBy && ` oleh ${j.createdBy}`}
                  {j.status === "DONE" && <> · <Link href="/organizer/certificates/issued" className="text-[#085782] hover:underline">Lihat sijil dikeluarkan</Link></>}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm: generate */}
      <Dialog open={!!confirmRun} onOpenChange={o => { if (!o) setConfirmRun(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmRun?.total ? "Jana sijil?" : "Tiada penerima"}</DialogTitle>
            <DialogDescription>
              {confirmRun?.total
                ? <>Sijil <b>{confirmRun.templateName}</b> akan dijana untuk <b>{fmt(confirmRun.total)}</b> penerima. Penerima yang sudah mempunyai sijil templat ini akan dilangkau.</>
                : <>Tiada penerima yang sepadan dengan tetapan penjana ini{confirmRun?.source === "EVENT_WINNERS" && confirmRun.config.verifiedOnly !== false
                    ? " — keputusan pertandingan acara ini mungkin belum disahkan (VERIFIED). Sahkan keputusan dahulu, atau cipta penjana baharu tanpa pilihan “disahkan sahaja”."
                    : "."} Jumlah penerima dikira semula setiap kali dijana.</>}
            </DialogDescription>
          </DialogHeader>
          {confirmRun && (
            <div className="space-y-1 rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              <p><span className="text-zinc-400">Data Penerima:</span> {SOURCE_LABEL[confirmRun.source]}</p>
              {describe(confirmRun).map(d => <p key={d}>{d}</p>)}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRun(null)}>Batal</Button>
            <Button onClick={() => confirmRun && run(confirmRun)}>
              <Play className="mr-1.5 h-3.5 w-3.5" /> {confirmRun?.total ? "Jana" : "Cuba jana juga"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: delete */}
      <Dialog open={!!confirmDelete} onOpenChange={o => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Padam penjana?</DialogTitle>
            <DialogDescription>
              Penjana <b>{confirmDelete?.templateName}</b> ({confirmDelete && SOURCE_LABEL[confirmDelete.source]}) akan dipadam.
              Sijil yang telah dijana <b>tidak</b> dipadam — urus di halaman Issued.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => confirmDelete && remove(confirmDelete)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Padam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
