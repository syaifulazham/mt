"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, Loader2, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Certificates → Generator → Penyertaan Umum. The organizer only sets the
// template: contingent managers issue these certificates themselves on the
// manager portal (Sijil → School / Contingent Level Cert), per competition, for
// the participants they tick, at Peringkat Sekolah. Stored as a generator job
// with source GENERAL; the newest one is active (src/lib/certificates/general.ts).

type Template = { id: string; name: string; targetType: string; season: { name: string } };
export type GeneralJob = { id: string; templateId: string; templateName: string; created: number; skipped: number; config: { eventNameOverride?: string } };

const API = "/api/v2/organizer/certificates/generator";

async function call(url: string, init: RequestInit) {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (${r.status})`);
  return j;
}

export function GeneralParticipationSection({ templates, job, onSaved }: {
  templates: Template[]; job: GeneralJob | null; onSaved: () => void;
}) {
  const [templateId, setTemplateId] = useState(job?.templateId ?? "");
  const [eventName, setEventName] = useState(job?.config.eventNameOverride ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  // GENERAL templates first, then the rest.
  const sorted = [...templates].sort((a, b) => Number(b.targetType === "GENERAL") - Number(a.targetType === "GENERAL") || a.name.localeCompare(b.name));
  const issued = (job?.created ?? 0) + (job?.skipped ?? 0);
  const dirty = templateId !== (job?.templateId ?? "") || eventName.trim() !== (job?.config.eventNameOverride ?? "");

  async function save() {
    setSaving(true); setErr(""); setSaved(false);
    const body = JSON.stringify({ templateId, source: "GENERAL", config: { eventNameOverride: eventName } });
    try {
      // A generator that has issued certificates keeps its template: a new
      // template starts a new (now active) generator. Certificates already
      // issued stay as they are, and nobody gets a second one.
      if (job && (templateId === job.templateId || issued === 0)) await call(`${API}/${job.id}`, { method: "PUT", body });
      else await call(API, { method: "POST", body });
      setSaved(true); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  const sel = "h-9 rounded-md border bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><School className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-900">Penyertaan Umum (Peringkat Sekolah / Kontinjen)</h2>
          <p className="mt-0.5 max-w-3xl text-xs text-zinc-600">
            Tetapkan templat sahaja. Pengurus kontinjen menjana sijil ini sendiri di Portal Pengurus (Sijil → School / Contingent Level Cert):
            pilih pertandingan, tandakan peserta, dan jana. Sijil dipaparkan di lajur <b>Peringkat Sekolah</b>. Seorang peserta menerima
            satu sijil bagi setiap pertandingan.
          </p>
        </div>
        {job && (
          <Link href={`/organizer/certificates/generator/${job.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-[#085782] hover:bg-sky-50">
            <Eye className="h-3.5 w-3.5" /> Lihat sijil{issued ? ` (${issued.toLocaleString()})` : ""}
          </Link>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3 pl-12">
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-zinc-500">Templat</span>
          <select value={templateId} onChange={e => { setTemplateId(e.target.value); setSaved(false); }} className={cn(sel, "w-80")}>
            {job && !templates.some(t => t.id === job.templateId) && <option value={job.templateId}>{job.templateName}</option>}
            <option value="">Pilih templat…</option>
            {sorted.map(t => <option key={t.id} value={t.id}>{t.name}{t.targetType === "GENERAL" ? "" : ` (${t.targetType})`}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-zinc-500">Nama acara (pilihan)</span>
          <input value={eventName} onChange={e => { setEventName(e.target.value); setSaved(false); }} maxLength={120}
            placeholder="Dicetak pada sijil" className={cn(sel, "w-72")} />
        </label>
        <Button size="sm" onClick={save} disabled={!templateId || saving || (!!job && !dirty)}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} {job ? "Simpan" : "Tetapkan templat"}
        </Button>
        {saved && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Disimpan</span>}
      </div>
      <p className="mt-2 pl-12 text-[11px] text-zinc-500">
        {job ? <>Aktif: <b>{job.templateName}</b> · {issued.toLocaleString()} sijil dijana oleh pengurus.</>
          : "Belum ditetapkan — bahagian ini tidak dipaparkan di Portal Pengurus sehingga templat ditetapkan."}
        {job && issued > 0 && " Menukar templat tidak mengubah sijil yang telah dijana."}
        {" "}Portal Pengurus mesti dihidupkan di Certificates → Distribution.
      </p>
      {err && <p className="mt-2 pl-12 text-xs text-red-600">{err}</p>}
    </section>
  );
}
