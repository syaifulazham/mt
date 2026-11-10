"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Eye, Loader2, Play, Plus, Trash2, CheckCircle2, AlertTriangle, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GENERATOR_GROUP_COOKIE } from "./generatorCookie";

// Certificates → Generator. A generator = template + recipient data
// (event participants / event winners / all registered / custom) + settings.
// "Jana" issues certificate rows in batches with visible progress; re-running
// skips recipients already issued for the template.

type Template = { id: string; name: string; targetType: string; season: { name: string } };
type EventOpt = { id: string; name: string; slug: string; scope: string };
type Job = {
  id: string; templateId: string; templateName: string; templateType: string | null; source: Source; status: string;
  total: number; created: number; skipped: number; error: string | null;
  createdBy: string | null; createdAt: string; completedAt: string | null; eventName: string | null;
  config: { eventId?: string; competitionCodes?: string[]; attendedOnly?: boolean; rankFrom?: number; rankTo?: number;
            verifiedOnly?: boolean; contingentType?: string; eventNameOverride?: string; rowCount?: number;
            resultsBy?: ResultsBy;
            distributionLevel?: DistLevel };
};
type ResultsBy = "CONFIG" | "NATIONAL" | "STATE" | "INTERNATIONAL";
const RESULTS_BY_LABEL: Record<ResultsBy, string> = {
  CONFIG: "Ikut konfigurasi keputusan", STATE: "State (ikut negeri)",
  NATIONAL: "National (kebangsaan)", INTERNATIONAL: "International (antarabangsa)",
};
const RESULTS_BY_SHORT: Record<ResultsBy, string> = {
  CONFIG: "Keputusan ikut konfigurasi", STATE: "Keputusan ikut negeri",
  NATIONAL: "Keputusan kebangsaan", INTERNATIONAL: "Keputusan antarabangsa",
};
type Source = "EVENT_PARTICIPANTS" | "EVENT_WINNERS" | "ALL_REGISTERED" | "TRAINERS" | "MANAGERS" | "CUSTOM";
type DistLevel = "NONE" | "SCHOOL" | "STATE" | "NATIONAL";
const DIST_LABEL: Record<DistLevel, string> = {
  NONE: "Tiada", SCHOOL: "Peringkat Sekolah", STATE: "Peringkat Negeri", NATIONAL: "Peringkat Kebangsaan",
};

const API = "/api/v2/organizer/certificates/generator";
const SOURCE_LABEL: Record<Source, string> = {
  EVENT_PARTICIPANTS: "Peserta Acara",
  EVENT_WINNERS:      "Pencapaian Acara",
  ALL_REGISTERED:     "Semua Berdaftar",
  TRAINERS:           "Jurulatih",
  MANAGERS:           "Pengurus Kontinjen",
  CUSTOM:             "Custom",
};
const CONTINGENT_TYPES = [["", "Semua kontinjen"], ["SCHOOL", "Sekolah"], ["HIGHER", "IPT"], ["INDEPENDENT", "Bebas"], ["INTERNATIONAL", "Antarabangsa"]];
const CUSTOM_COLUMNS = ["nama", "ic", "kontingen", "sekolah", "negeri", "pasukan", "pertandingan", "kod", "anugerah", "kedudukan"];
const fmt = (n: number) => n.toLocaleString();

export type GroupBy = "none" | "event" | "type" | "template";
const GROUP_BY: { key: GroupBy; label: string }[] = [
  { key: "none", label: "Tiada" }, { key: "event", label: "Acara" },
  { key: "type", label: "Jenis Templat" }, { key: "template", label: "Templat" },
];
const TYPE_LABEL: Record<string, string> = {
  GENERAL: "Umum", EVENT_PARTICIPANT: "Penyertaan Acara", EVENT_WINNER: "Pencapaian Acara",
  NON_CONTEST_PARTICIPANT: "Penyertaan Bukan Pertandingan", QUIZ_PARTICIPANT: "Penyertaan Kuiz",
  QUIZ_WINNER: "Pencapaian Kuiz", TRAINER: "Jurulatih", CONTINGENT: "Kontinjen", SCHOOL_WINNER: "Pencapaian Sekolah",
};

/** Jobs grouped under headings, in order of each group's newest job. */
function groupJobs(jobs: Job[], by: GroupBy): { key: string; label: string; jobs: Job[] }[] {
  if (by === "none") return [{ key: "all", label: "", jobs }];
  const groups = new Map<string, { key: string; label: string; jobs: Job[] }>();
  for (const j of jobs) {
    const [key, label] =
      by === "event"    ? [j.config.eventId ?? "-", j.eventName ?? (j.config.eventNameOverride ? `"${j.config.eventNameOverride}"` : "Tanpa acara")]
      : by === "type"   ? [j.templateType ?? "-", TYPE_LABEL[j.templateType ?? ""] ?? j.templateType ?? "Tidak diketahui"]
      :                   [j.templateId, j.templateName];
    const g = groups.get(key) ?? { key, label, jobs: [] };
    g.jobs.push(j);
    groups.set(key, g);
  }
  return [...groups.values()];
}

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

function describe(j: Job, withResultsBy = true) {
  const c = j.config;
  const parts: string[] = [];
  if (j.eventName) parts.push(j.eventName);
  if (j.source === "EVENT_WINNERS") {
    if (withResultsBy) parts.push(RESULTS_BY_SHORT[c.resultsBy ?? "NATIONAL"]);
    parts.push(`Kedudukan ${c.rankFrom ?? 1} – ${c.rankTo ?? 3}${c.verifiedOnly === false ? " · termasuk belum disahkan" : ""}`);
  }
  if (j.source === "EVENT_PARTICIPANTS" && c.attendedOnly) parts.push("Hadir sahaja");
  if (c.competitionCodes?.length) parts.push(`${c.competitionCodes.length} pertandingan`);
  if (j.source === "ALL_REGISTERED") parts.push(CONTINGENT_TYPES.find(t => t[0] === (c.contingentType ?? ""))?.[1] ?? "");
  if (j.source === "CUSTOM") parts.push(`${fmt(c.rowCount ?? 0)} baris`);
  if (c.eventNameOverride) parts.push(`Nama acara: "${c.eventNameOverride}"`);
  return parts.filter(Boolean);
}

// ── New generator form ───────────────────────────────────────────────────────
function NewGenerator({ templates, events, onCreated, onCancel, initial }: {
  templates: Template[]; events: EventOpt[]; onCreated: () => void; onCancel: () => void;
  /** Duplicate: start from an existing generator's settings (saved as a new generator). */
  initial?: Job | null;
}) {
  const c = initial?.config;
  const [templateId, setTemplateId] = useState(initial && templates.some(t => t.id === initial.templateId) ? initial.templateId : "");
  const [source, setSource] = useState<Source | "">(initial?.source ?? "");
  const [eventId, setEventId] = useState(c?.eventId ?? "");
  const [competitions, setCompetitions] = useState<{ code: string; name: string }[]>([]);
  const [codes, setCodes] = useState<string[]>(c?.competitionCodes ?? []);
  const [attendedOnly, setAttendedOnly] = useState(c?.attendedOnly ?? false);
  const [rankFrom, setRankFrom] = useState(c?.rankFrom ?? 1);
  const [rankTo, setRankTo] = useState(c?.rankTo ?? 3);
  const [verifiedOnly, setVerifiedOnly] = useState(c?.verifiedOnly ?? true);
  const [resultsBy, setResultsBy] = useState<ResultsBy>(c?.resultsBy ?? "CONFIG");
  const [contingentType, setContingentType] = useState(c?.contingentType ?? "");
  const [customText, setCustomText] = useState("");
  const [eventNameOverride, setOverride] = useState(c?.eventNameOverride ?? "");
  const [distributionLevel, setDistributionLevel] = useState<DistLevel>(c?.distributionLevel ?? "NONE");

  // Duplicating a generator with an event: load that event's competitions for the filter
  useEffect(() => {
    if (!initial?.config.eventId) return;
    let alive = true;
    call<{ competitions: { code: string; name: string }[] }>(`${API}?eventId=${initial.config.eventId}`)
      .then(j => { if (alive) setCompetitions(j.competitions); }).catch(() => {});
    return () => { alive = false; };
  }, [initial]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const needsEvent = source === "EVENT_PARTICIPANTS" || source === "EVENT_WINNERS";
  // Trainers / Contingent Manager Portal users: no event, no portal distribution
  const personSource = source === "TRAINERS" || source === "MANAGERS";
  const customRows = source === "CUSTOM" ? parseCustom(customText) : [];
  const chosen = templates.find(t => t.id === templateId);

  async function pickEvent(id: string) {
    setEventId(id); setCodes([]); setCompetitions([]);
    // Zone events rank by state by default; national (and other) events nationally
    const scope = events.find(e => e.id === id)?.scope ?? "";
    setResultsBy(scope === "ZONE" || scope === "ONLINE_ZONE" ? "STATE" : "NATIONAL");
    if (id) call<{ competitions: { code: string; name: string }[] }>(`${API}?eventId=${id}`).then(j => setCompetitions(j.competitions)).catch(() => {});
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      await call(API, { method: "POST", body: JSON.stringify({
        templateId, source,
        config: { eventId: eventId || undefined, competitionCodes: codes, attendedOnly, rankFrom, rankTo, verifiedOnly, resultsBy, contingentType, eventNameOverride, distributionLevel,
                  rows: source === "CUSTOM" ? customRows : undefined },
      }) });
      onCreated();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  const sel = "h-9 rounded-md border bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";
  const ready = templateId && source && (!needsEvent || eventId) && (source !== "CUSTOM" || customRows.length > 0) && (source !== "EVENT_WINNERS" || rankTo >= rankFrom);

  return (
    <div className={cn("rounded-xl border bg-white p-5 shadow-sm", initial && "border-sky-300 ring-2 ring-sky-100")}>
      {initial && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-sky-800">
          <Copy className="h-3.5 w-3.5" /> Salinan tetapan daripada penjana &ldquo;{initial.templateName}&rdquo; ({SOURCE_LABEL[initial.source]}).
          Ubah suai, kemudian simpan sebagai penjana baharu.
          {initial.source === "CUSTOM" && " Senarai Custom perlu ditampal semula."}
        </p>
      )}
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
              {personSource && (
                <p className="text-[11px] text-zinc-400">
                  {source === "TRAINERS"
                    ? "Semua jurulatih berdaftar — satu sijil setiap jurulatih, dengan kontinjen masing-masing."
                    : "Semua pengguna Portal Pengurus Kontinjen — satu sijil setiap pengurus, dengan kontinjen pertama yang diurus."}
                  {" "}Tidak terikat kepada acara dan tidak diedarkan ke portal.
                </p>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-28 text-zinc-500">Results by</span>
                    {(Object.entries(RESULTS_BY_LABEL) as [ResultsBy, string][]).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setResultsBy(v)}
                        className={cn("rounded-md border px-2.5 py-1 font-medium transition-colors",
                          resultsBy === v ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
                        {l}
                      </button>
                    ))}
                    <span className="text-zinc-400">
                      {resultsBy === "CONFIG" ? "Setiap pertandingan mengikut Penghakiman → Konfigurasi keputusan (Kebangsaan / Negeri), sama seperti halaman Keputusan."
                        : resultsBy === "STATE" ? "Kedudukan dikira semula dalam setiap negeri."
                        : resultsBy === "INTERNATIONAL" ? "2 teratas setiap negara (termasuk Malaysia), disusun bersama."
                        : "Kedudukan merentas semua negeri."}
                    </span>
                  </div>
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
              {!personSource && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-28 text-xs text-zinc-500">Edaran</span>
                <select value={distributionLevel} onChange={e => setDistributionLevel(e.target.value as DistLevel)} className={cn(sel, "w-56")}>
                  {(Object.keys(DIST_LABEL) as DistLevel[]).map(l => <option key={l} value={l}>{DIST_LABEL[l]}</option>)}
                </select>
                <span className="text-[11px] text-zinc-400">Lajur sijil di portal pengurus / peserta (Certificates → Distribution). “Tiada” = tidak diedarkan.</span>
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

/** Remember the grouping for a year; "none" clears it. */
function saveGroupCookie(g: GroupBy) {
  document.cookie = g === "none"
    ? `${GENERATOR_GROUP_COOKIE}=; path=/organizer/certificates/generator; max-age=0; samesite=lax`
    : `${GENERATOR_GROUP_COOKIE}=${g}; path=/organizer/certificates/generator; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function CertificateGeneratorClient({ initialGroupBy = "none" }: { initialGroupBy?: GroupBy }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<Job | null>(null);
  const [running, setRunning] = useState<{ id: string; processed: number; total: number; created: number; skipped: number; updated: number } | null>(null);
  const [refresh, setRefresh] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [groupBy, setGroupByState] = useState<GroupBy>(initialGroupBy);
  const setGroupBy = (g: GroupBy) => { setGroupByState(g); saveGroupCookie(g); };

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
    let offset: number | null = 0, created = 0, skipped = 0, updated = 0;
    setRunning({ id: job.id, processed: 0, total: job.total, created: 0, skipped: 0, updated: 0 });
    try {
      while (offset !== null) {
        const r: { created: number; skipped: number; updated: number; processed: number; total: number; nextOffset: number | null } =
          await call(`${API}/${job.id}`, { method: "POST", body: JSON.stringify({ offset, refresh }) });
        created += r.created; skipped += r.skipped; updated += r.updated ?? 0;
        setRunning({ id: job.id, processed: r.processed, total: r.total, created, skipped, updated });
        offset = r.nextOffset;
      }
      if (updated) setErr("");
      setNotice(updated ? `${fmt(updated)} sijil sedia ada dikemas kini · ${fmt(created)} baharu`
        : skipped ? `${fmt(created)} sijil baharu · ${fmt(skipped)} sijil sedia ada tidak diubah (anugerah/kedudukan lama kekal). Untuk mengemas kininya, klik Jana semula dan tandakan "Kemas kini sijil sedia ada".`
        : "");
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menjana"); }
    finally { setRunning(null); setRefresh(false); load(); }
  }

  async function setResultsBy(job: Job, resultsBy: ResultsBy) {
    setErr(""); setNotice("");
    try {
      await call(`${API}/${job.id}`, { method: "PATCH", body: JSON.stringify({ resultsBy }) });
      setNotice(`Kedudukan ditukar ke "${RESULTS_BY_LABEL[resultsBy]}" · klik Jana semula dan tandakan "Kemas kini sijil sedia ada" untuk mengemas kini sijil yang telah dijana`);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
  }

  async function setDistribution(job: Job, level: DistLevel) {
    setErr(""); setNotice("");
    try {
      const r = await call<{ applied: number }>(`${API}/${job.id}`, { method: "PATCH", body: JSON.stringify({ distributionLevel: level }) });
      setNotice(`Edaran ditukar ke "${DIST_LABEL[level]}" · ${fmt(r.applied)} sijil sedia ada dikemas kini`);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
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
          <Button onClick={() => { setDuplicateFrom(null); setCreating(true); }} disabled={!templates.length}>
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
        <NewGenerator key={duplicateFrom?.id ?? "new"} templates={templates} events={events} initial={duplicateFrom}
          onCreated={() => { setCreating(false); setDuplicateFrom(null); load(); }}
          onCancel={() => { setCreating(false); setDuplicateFrom(null); }} />
      )}

      {err && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {err}</p>}
      {notice && <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {notice}</p>}

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
      ) : jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white py-12 text-center text-sm text-zinc-400">Belum ada penjana. Klik “Create New Generator”.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Kumpulkan ikut</span>
            {GROUP_BY.map(g => (
              <button key={g.key} onClick={() => setGroupBy(g.key)}
                className={cn("rounded-md border px-2.5 py-1 font-medium transition-colors",
                  groupBy === g.key ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
                {g.label}
              </button>
            ))}
          </div>
          {groupJobs(jobs, groupBy).map(group => (
          <div key={group.key} className="space-y-3">
            {group.label && (
              <h2 className="flex items-baseline gap-2 border-b pb-1 text-sm font-semibold text-zinc-800">
                {group.label}
                <span className="text-[11px] font-normal text-zinc-400">
                  {group.jobs.length} penjana · {fmt(group.jobs.reduce((s, j) => s + j.created + j.skipped, 0))} sijil
                </span>
              </h2>
            )}
          {group.jobs.map(j => {
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
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {j.source === "EVENT_WINNERS" && (
                        <select value={j.config.resultsBy ?? "NATIONAL"} disabled={!!running} title="Kedudukan dikira"
                          onChange={e => setResultsBy(j, e.target.value as ResultsBy)}
                          className="h-6 rounded border bg-white px-1 text-[11px] text-zinc-600">
                          {(Object.keys(RESULTS_BY_SHORT) as ResultsBy[]).map(v => <option key={v} value={v}>{RESULTS_BY_SHORT[v]}</option>)}
                        </select>
                      )}
                      {describe(j, false).map(d => <span key={d} className="rounded border bg-white px-1.5 py-0.5 text-[11px] text-zinc-600">{d}</span>)}
                      {j.source !== "TRAINERS" && j.source !== "MANAGERS" && (
                      <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
                        Edaran
                        <select value={j.config.distributionLevel ?? "NONE"} disabled={!!running}
                          onChange={e => setDistribution(j, e.target.value as DistLevel)}
                          className={cn("h-6 rounded border bg-white px-1 text-[11px]",
                            (j.config.distributionLevel ?? "NONE") === "NONE" ? "text-zinc-500" : "border-emerald-300 text-emerald-700")}>
                          {(Object.keys(DIST_LABEL) as DistLevel[]).map(l => <option key={l} value={l}>{DIST_LABEL[l]}</option>)}
                        </select>
                      </label>
                      )}
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
                      <button onClick={() => { setDuplicateFrom(j); setCreating(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                        disabled={!!running} title="Duplikasi tetapan ke penjana baharu"
                        className="rounded p-1.5 text-zinc-400 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-40">
                        <Copy className="h-4 w-4" />
                      </button>
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
                        ? `${fmt(running.processed)} / ${fmt(running.total)} · ${fmt(running.created)} baharu${running.updated ? ` · ${fmt(running.updated)} dikemas kini` : ""} · ${fmt(running.skipped)} dilangkau`
                        : j.status === "DONE"
                          ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> {fmt(j.created)} dijana · {fmt(j.skipped)} sedia ada · {fmt(j.total)} penerima</span>
                          : j.status === "FAILED"
                            ? <span className="inline-flex items-center gap-1 text-red-600"><X className="h-3 w-3" /> {j.error}</span>
                            : `${fmt(j.total)} penerima · belum dijana`}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-zinc-400">
                    Dicipta {new Date(j.createdAt).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}{j.createdBy && ` oleh ${j.createdBy}`}
                  </p>
                  {/* This generator's issued certificates: review + download */}
                  <Link href={`/organizer/certificates/generator/${j.id}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-[#085782] hover:bg-sky-50">
                    <Eye className="h-3.5 w-3.5" /> Lihat sijil{j.created + j.skipped > 0 ? ` (${fmt(j.created + j.skipped)})` : ""}
                  </Link>
                </div>
              </div>
            );
          })}
          </div>
          ))}
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
          {confirmRun && confirmRun.created + confirmRun.skipped > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <input type="checkbox" className="mt-0.5" checked={refresh} onChange={e => setRefresh(e.target.checked)} />
              <span>
                <b>Kemas kini sijil sedia ada</b> — sijil yang telah dijana untuk penerima ini diperbaharui mengikut data
                dan istilah semasa (cth. anugerah, nama, kontinjen, nama acara). Nombor siri, kod pengesahan dan tarikh kekal.
                Sijil yang dibatalkan tidak diubah.
              </span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmRun(null); setRefresh(false); }}>Batal</Button>
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
