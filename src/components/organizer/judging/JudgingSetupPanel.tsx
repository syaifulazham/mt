"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Gavel, Loader2, Lock, LockOpen, Plus, Search, Swords, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DUEL_DEFAULTS, parseDuelConfig, type DuelConfig } from "@/lib/duel";
import { RESULT_SCOPE_LABEL, type ResultScope } from "@/lib/resultScope";

export type ResultConfig = {
  resultScope: ResultScope;
  configLockedAt: string | Date | null;
  configLockedBy: string | null;
};

export type SetupTemplate = {
  id: string; name: string; code: string; description: string | null;
  _count: { criterions: number };
};

/**
 * Top of a competition card on Penghakiman: the judging method (Skor / Duel),
 * assigned templates (add/remove here), for Duel the duel settings, and the
 * result configuration (Kebangsaan / Negeri) with the lock for all of it.
 */
export function JudgingSetupPanel({
  eventId, eventSlug, ecId, canWrite: canWriteRole, canLock, isSuperAdmin, method, duelConfig, templates, templateTaskCount,
  resultConfig, defaultScope, onTemplatesChange, onMethodChange, onResultConfigChange,
}: {
  eventId: string;
  eventSlug: string;
  ecId: string;
  /** May edit the setup (role, and judging still open). */
  canWrite: boolean;
  /** May lock the configuration (Admins); unlocking is Super Admin only. */
  canLock: boolean;
  isSuperAdmin: boolean;
  resultConfig: ResultConfig;
  /** The event scope's default result scope, shown as a hint. */
  defaultScope: ResultScope;
  onResultConfigChange: (patch: Partial<ResultConfig> & { duelConfig?: DuelConfig | null }) => void;
  method: string;
  duelConfig: unknown;
  templates: SetupTemplate[];
  /** Tasks per template id — a template with tasks cannot be removed. */
  templateTaskCount: Record<string, number>;
  onTemplatesChange: (templates: SetupTemplate[]) => void;
  onMethodChange: (method: string, config: DuelConfig) => void;
}) {
  const base = `/api/v2/organizer/events/${eventId}/competitions/${ecId}`;
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const isDuel = method === "DUEL";
  const locked = !!resultConfig.configLockedAt;
  const canWrite = canWriteRole && !locked;

  async function patchResultConfig(body: { resultScope?: ResultScope; locked?: boolean }, key: string) {
    setBusy(key); setErr("");
    try {
      const res = await fetch(`${base}/result-config`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      onResultConfigChange(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(null); }
  }

  async function setMethod(next: "SCORE" | "DUEL") {
    if (next === method || !canWrite) return;
    setBusy("method"); setErr("");
    try {
      const res = await fetch(`${base}/duel-config`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgingMethod: next, ...(next === "DUEL" && !duelConfig && { duelConfig: DUEL_DEFAULTS }) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      onMethodChange(j.judgingMethod, j.duelConfig);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(null); }
  }

  async function removeTemplate(t: SetupTemplate) {
    setBusy(t.id); setErr("");
    try {
      const res = await fetch(`${base}/judging-templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal");
      onTemplatesChange(templates.filter(x => x.id !== t.id));
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(null); }
  }

  async function addTemplate(t: SetupTemplate) {
    setBusy("add"); setErr("");
    try {
      const res = await fetch(`${base}/judging-templates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgingTemplateId: t.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error === "ALREADY_ASSIGNED" ? "Templat ini sudah ditetapkan." : j.error ?? "Gagal");
      onTemplatesChange([...templates, t]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(null); }
  }

  return (
    <div className="px-5 py-4 bg-zinc-50/60 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-zinc-500">Kaedah penghakiman</span>
        <div className="inline-flex rounded-lg border bg-white p-0.5">
          {([["SCORE", "Skor", Gavel], ["DUEL", "Duel", Swords]] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              disabled={!canWrite || busy === "method"}
              onClick={() => setMethod(m)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                method === m ? (m === "DUEL" ? "bg-rose-600 text-white" : "bg-violet-600 text-white") : "text-zinc-500 hover:bg-zinc-100",
                !canWrite && "cursor-default",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        {busy === "method" && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
        {isDuel && (
          <Link
            href={`/organizer/events/${eventSlug}/manage/scoreboard/${ecId}`}
            className="ml-auto text-xs font-semibold text-rose-600 hover:underline"
          >
            Urus duel →
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-zinc-500">Konfigurasi keputusan</span>
        <div className="inline-flex rounded-lg border bg-white p-0.5">
          {(["NATIONAL", "STATE"] as const).map(k => (
            <button
              key={k}
              type="button"
              disabled={!canWrite || busy === "scope"}
              onClick={() => k !== resultConfig.resultScope && patchResultConfig({ resultScope: k }, "scope")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                resultConfig.resultScope === k ? "bg-zinc-800 text-white" : "text-zinc-500 hover:bg-zinc-100",
                !canWrite && "cursor-default",
              )}
            >
              {RESULT_SCOPE_LABEL[k]}
            </button>
          ))}
        </div>
        {busy === "scope" && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
        <span className="text-[11px] text-zinc-400">
          {resultConfig.resultScope === "STATE"
            ? isDuel ? "Setiap negeri dicabut dan bertanding berasingan, dengan kedudukan sendiri." : "Kedudukan berasingan bagi setiap negeri."
            : isDuel ? "Semua pasukan dalam satu cabutan dan satu kedudukan akhir." : "Satu kedudukan bagi semua negeri."}
          {resultConfig.resultScope !== defaultScope && <> (lalai acara: {RESULT_SCOPE_LABEL[defaultScope]})</>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {locked ? (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                title={resultConfig.configLockedBy ? `Dikunci oleh ${resultConfig.configLockedBy}` : undefined}
              >
                <Lock className="h-3 w-3" /> Konfigurasi dikunci
              </span>
              {isSuperAdmin && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy === "lock"}
                  onClick={() => patchResultConfig({ locked: false }, "lock")}>
                  {busy === "lock" ? <Loader2 className="h-3 w-3 animate-spin" /> : <LockOpen className="h-3 w-3" />} Buka kunci
                </Button>
              )}
            </>
          ) : canLock && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy === "lock"}
              title="Bekukan kaedah, templat, tetapan duel dan konfigurasi keputusan"
              onClick={() => patchResultConfig({ locked: true, resultScope: resultConfig.resultScope }, "lock")}>
              {busy === "lock" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />} Kunci konfigurasi
            </Button>
          )}
        </div>
      </div>

      {isDuel ? (
        <DuelConfigForm base={base} canWrite={canWrite} config={parseDuelConfig(duelConfig)}
          onSaved={cfg => onMethodChange("DUEL", cfg)} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 mr-1">Templat</span>
          {templates.length === 0 && <span className="text-xs text-zinc-400 italic">Belum ada templat.</span>}
          {templates.map(t => {
            const tasks = templateTaskCount[t.id] ?? 0;
            return (
              <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white pl-2.5 pr-1 py-0.5 text-xs text-violet-700">
                <Tag className="h-3 w-3 text-violet-400" />
                {t.name}
                <span className="font-mono text-[10px] text-violet-400">{t.code}</span>
                {canWrite && (
                  <button
                    type="button"
                    title={tasks ? `Ada ${tasks} tugas — padam tugas dahulu` : "Buang templat"}
                    disabled={!!tasks || busy === t.id}
                    onClick={() => removeTemplate(t)}
                    className="rounded-full p-0.5 text-violet-400 hover:bg-violet-100 hover:text-violet-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    {busy === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                )}
              </span>
            );
          })}
          {canWrite && <TemplatePicker exclude={templates.map(t => t.id)} busy={busy === "add"} onPick={addTemplate} />}
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function TemplatePicker({ exclude, busy, onPick }: { exclude: string[]; busy: boolean; onPick: (t: SetupTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [all, setAll] = useState<SetupTemplate[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || all) return;
    fetch("/api/v2/organizer/judging/templates", { cache: "no-store" })
      .then(r => r.json()).then(j => setAll(j.templates ?? [])).catch(() => setAll([]));
  }, [open, all]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (all ?? []).filter(t => !exclude.includes(t.id) && (!s || t.name.toLowerCase().includes(s) || t.code.toLowerCase().includes(s)));
  }, [all, q, exclude]);

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" variant="outline" className="h-6 gap-1 rounded-full border-dashed border-violet-300 px-2.5 text-xs text-violet-600" onClick={() => setOpen(o => !o)} disabled={busy}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Tambah templat
      </Button>
      {open && (
        <div className="absolute left-0 top-8 z-30 w-80 rounded-xl border bg-white shadow-lg">
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau kod…" className="h-8 pl-7 text-xs" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {!all && <p className="px-3 py-3 text-xs text-zinc-400"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Memuatkan…</p>}
            {all && list.length === 0 && <p className="px-3 py-3 text-xs text-zinc-400">Tiada templat sepadan.</p>}
            {list.map(t => (
              <button key={t.id} type="button" onClick={() => { onPick(t); setOpen(false); setQ(""); }}
                className="block w-full px-3 py-2 text-left hover:bg-violet-50">
                <p className="text-xs font-medium text-zinc-800">{t.name}</p>
                <p className="text-[10px] text-zinc-400"><span className="font-mono">{t.code}</span> · {t._count.criterions} kriteria</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const parseMmss = (s: string) => {
  const m = s.trim().match(/^(\d+)(?::(\d{1,2}))?$/);
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : NaN;
};

function DuelConfigForm({ base, canWrite, config, onSaved }: {
  base: string; canWrite: boolean; config: DuelConfig; onSaved: (c: DuelConfig) => void;
}) {
  const [f, setF] = useState({
    perSession: String(config.perSession), advance: String(config.advance), arenas: String(config.arenas),
    duration: mmss(config.durationSec), brk: mmss(config.breakSec),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const next = {
    scope: config.scope,
    perSession: Number(f.perSession), advance: Number(f.advance), arenas: Number(f.arenas),
    durationSec: parseMmss(f.duration), breakSec: parseMmss(f.brk),
  };
  const invalid =
    !(next.perSession >= 2) ? "Peserta/sesi sekurang-kurangnya 2." :
    !(next.advance >= 1 && next.advance < next.perSession) ? "Bilangan mara mesti kurang daripada peserta/sesi." :
    !(next.arenas >= 1) ? "Arena sekurang-kurangnya 1." :
    !(next.durationSec >= 10) ? "Masa duel tidak sah (mm:ss)." :
    !(next.breakSec >= 0) ? "Masa rehat tidak sah (mm:ss)." : "";
  const dirty = next.perSession !== config.perSession || next.advance !== config.advance || next.arenas !== config.arenas
    || next.durationSec !== config.durationSec || next.breakSec !== config.breakSec;

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${base}/duel-config`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ duelConfig: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      onSaved(j.duelConfig);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  const field = (key: keyof typeof f, label: string, hint?: string) => (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium text-zinc-500">{label}</span>
      <Input value={f[key]} disabled={!canWrite} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))}
        className="h-8 w-full bg-white text-sm" inputMode={hint ? "text" : "numeric"} placeholder={hint} />
    </label>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {field("perSession", "Peserta maks / sesi")}
        {field("advance", "Bilangan mara / sesi")}
        {field("arenas", "Arena maks serentak")}
        {field("duration", "Masa maks / duel", "mm:ss")}
        {field("brk", "Rehat antara gelombang", "mm:ss")}
      </div>
      <div className="flex items-center gap-3">
        {canWrite && (
          <Button size="sm" className="h-7 bg-rose-600 text-xs hover:bg-rose-700" disabled={!dirty || !!invalid || saving} onClick={save}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : null} Simpan tetapan duel
          </Button>
        )}
        <p className="text-[11px] text-zinc-400">
          Mata setiap sesi: tempat pertama = n, terakhir = 1. Kedudukan akhir = jumlah mata semua pusingan.
        </p>
      </div>
      {(invalid && dirty ? invalid : err) && <p className="text-xs text-red-600">{invalid && dirty ? invalid : err}</p>}
    </div>
  );
}
