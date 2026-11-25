"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Loader2, Lock, Plus, RefreshCw, Sparkles, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  quizAiPrompt, quizDefaultDraft, quizDraftCriteria, quizSourceLabel, quizTemplateMapping, type QuizTemplateDraft,
} from "@/lib/quiz-score-template";
import type { QuizSyncSummary } from "@/lib/quiz-score-sync";

// Asia Spark Quizzes → per competition: the MT judging template that stores the
// quiz results (pick an existing one, or draft one with the AI helper) and
// "Sync ke penghakiman MT", which copies the results into judging scores
// (src/lib/quiz-score-sync.ts).

type TemplateRow = { id: string; name: string; code: string; criteria: number; fit: string | null; assigned: boolean };
type Status = {
  competition: { code: string; name: string };
  quizzes: { id: string; title: string; label: string }[];
  templates: TemplateRow[];
  assigned: string[];
  templateId: string | null;
  syncLabel: string;
  task: {
    id: string; templateId: string; template: { id: string; name: string; code: string };
    scores: number; teamsScored: number; updatedAt: string; completedAt: string | null;
  } | null;
  configLocked: boolean;
  judgingStatus: string;
  blocked: string | null;
  canManage: boolean;
};

const fmtWhen = (d: string) => new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" });

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.message ?? (typeof j.error === "string" ? j.error : "Permintaan gagal")), { code: j.error, status: res.status });
  return j;
}

const errText = (e: unknown) =>
  (e as { code?: string }).code === "CONFIG_LOCKED" ? "Konfigurasi penghakiman pertandingan ini dikunci." : e instanceof Error ? e.message : "Gagal";

export function QuizJudgingPanel({ eventId, ecId }: { eventId: string; ecId: string }) {
  const base = `/api/v2/organizer/events/${eventId}/competitions/${ecId}`;
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<QuizSyncSummary | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const reload = useCallback(async () => { setStatus(await call(`${base}/quiz-results`)); }, [base]);

  useEffect(() => {
    let alive = true;
    call(`${base}/quiz-results`)
      .then(s => { if (alive) setStatus(s); })
      .catch(e => { if (alive) setErr(errText(e)); });
    return () => { alive = false; };
  }, [base]);

  /** Assign (unless already assigned) and make the sync task use the template. */
  const applyTemplate = useCallback(async (templateId: string) => {
    try {
      await call(`${base}/judging-templates`, { method: "POST", body: JSON.stringify({ judgingTemplateId: templateId }) });
    } catch (e) {
      if ((e as { code?: string }).code !== "ALREADY_ASSIGNED") throw e;
    }
    await call(`${base}/quiz-results`, { method: "POST", body: JSON.stringify({ action: "prepare", templateId }) });
  }, [base]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setErr("");
    try { await fn(); }
    catch (e) { setErr(errText(e)); }
    finally { setBusy(null); }
  }

  function pick(templateId: string) {
    if (!templateId || templateId === status?.templateId) return;
    // Synced scores on the old template are dropped (and re-synced on the new one).
    if (status?.task && status.task.scores > 0 && status.task.templateId !== templateId) { setSwitchTo(templateId); return; }
    run("pick", async () => { await applyTemplate(templateId); await reload(); });
  }

  if (!status) {
    return (
      <div className="px-5 py-3 border-b text-xs text-zinc-400 flex items-center gap-2">
        {err ? <><AlertTriangle className="h-3.5 w-3.5 text-red-500" /><span className="text-red-600">{err}</span></> : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuatkan konfigurasi penghakiman…</>}
      </div>
    );
  }

  const byId = new Map(status.templates.map(t => [t.id, t]));
  const locked = status.configLocked;
  const manage = status.canManage;
  // Config locked: only already-assigned templates can be chosen (assigning is refused).
  const choosable = status.templates.filter(t => !locked || t.assigned);
  const fitting = choosable.filter(t => !t.fit);
  const notFitting = choosable.filter(t => t.fit);
  const assignedRows = status.assigned.map(id => byId.get(id)).filter((t): t is TemplateRow => !!t);
  const frozen = status.judgingStatus !== "OPEN";

  return (
    <div className="px-5 py-3 border-b bg-white space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <ClipboardCheck className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-xs font-semibold text-zinc-700">Templat penghakiman MT</span>
        <select value={status.templateId ?? ""} onChange={e => pick(e.target.value)} aria-label="Templat penghakiman MT"
          disabled={!manage || !!busy || frozen}
          className={cn("py-1.5 pl-2 pr-7 text-xs border rounded-lg bg-white max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-50 disabled:text-zinc-500",
            !status.templateId && "text-zinc-400")}>
          <option value="">{status.templateId ? "" : "— Pilih templat —"}</option>
          {fitting.length > 0 && (
            <optgroup label="Sesuai untuk keputusan kuiz">
              {fitting.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code}){t.assigned ? " · ditetapkan" : ""}</option>)}
            </optgroup>
          )}
          {notFitting.length > 0 && (
            <optgroup label="Tidak boleh diisi daripada kuiz">
              {notFitting.map(t => <option key={t.id} value={t.id} disabled>{t.name} ({t.code}) — {t.fit}</option>)}
            </optgroup>
          )}
        </select>
        {manage && (
          <Button size="sm" variant="outline" onClick={() => setAiOpen(true)} disabled={!!busy || locked || frozen}
            title={locked ? "Konfigurasi dikunci" : "Draf templat baharu dengan AI daripada penerangan pertandingan / kuiz"}
            className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50">
            <Sparkles className="h-3.5 w-3.5" /> Cipta dengan AI
          </Button>
        )}
        <div className="flex-1" />
        {manage && (
          <Button size="sm"
            onClick={() => run("sync", async () => { setSummary(await call(`${base}/quiz-results`, { method: "POST", body: JSON.stringify({ action: "sync" }) })); await reload(); })}
            disabled={!!busy || !status.templateId || !!status.blocked || !!status.task?.completedAt}
            title={status.blocked ?? (!status.templateId ? "Pilih templat yang sesuai dahulu" : "Salin keputusan kuiz ke markah penghakiman MT")}
            className="h-7 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
            {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync ke penghakiman MT
          </Button>
        )}
      </div>

      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-zinc-500">
        {status.task ? (
          <span>
            Tugas <b className="text-zinc-700">{status.syncLabel}</b> · templat {status.task.template.name} · {status.task.teamsScored} peserta bermarkah · dikemas kini {fmtWhen(status.task.updatedAt)}
            {status.task.completedAt && <span className="ml-1 text-amber-700">(diumumkan selesai — dikunci)</span>}
          </span>
        ) : status.templateId ? (
          <span>Belum disync — markah akan ditulis melalui tugas <b className="text-zinc-700">{status.syncLabel}</b>.</span>
        ) : (
          <span>Pilih templat yang sesuai (atau cipta dengan AI) sebelum sync. Semua kuiz pertandingan ini menggunakan templat yang sama; skor dibawa sebagai peratus.</span>
        )}
        {!manage && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Hanya ADMIN / SUPER_ADMIN boleh mengubah atau sync</span>}
        {locked && <span className="inline-flex items-center gap-1 text-amber-700"><Lock className="h-3 w-3" /> Konfigurasi dikunci</span>}
        {status.blocked && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" /> {status.blocked}</span>}
        {busy === "pick" && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Menetapkan templat…</span>}
      </div>

      {assignedRows.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-zinc-400">Ditetapkan:</span>
          {assignedRows.map(t => (
            <span key={t.id} title={t.fit ? `Tidak boleh diisi daripada kuiz: ${t.fit}` : "Sesuai untuk keputusan kuiz"}
              className={cn("inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full border",
                t.id === status.templateId ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-zinc-50 text-zinc-600")}>
              {!t.fit && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
              {t.name}
              {manage && !locked && (
                <button disabled={!!busy} title="Nyahtetapkan templat" aria-label={`Nyahtetapkan ${t.name}`}
                  onClick={() => run(`rm-${t.id}`, async () => { await call(`${base}/judging-templates/${t.id}`, { method: "DELETE" }); await reload(); })}
                  className="ml-0.5 rounded-full p-0.5 text-zinc-400 hover:text-red-600 hover:bg-red-50">
                  {busy === `rm-${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {err && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{err}</p>}
      {summary && <SyncSummary summary={summary} onClose={() => setSummary(null)} />}

      <ConfirmDialog open={!!switchTo} onOpenChange={o => { if (!o) setSwitchTo(null); }}
        title="Tukar templat sync?"
        description={`${status.task?.scores ?? 0} markah yang disync pada templat "${status.task?.template.name}" akan dipadam. Tekan "Sync ke penghakiman MT" selepas itu untuk menulisnya semula pada templat baharu.`}
        confirmLabel="Tukar" loading={busy === "pick"}
        onConfirm={() => run("pick", async () => { await applyTemplate(switchTo!); setSwitchTo(null); await reload(); })} />

      {aiOpen && (
        <AiTemplateDialog base={base} competition={status.competition} quizzes={status.quizzes}
          onClose={() => setAiOpen(false)}
          onSaved={async () => { setAiOpen(false); await reload(); }}
          applyTemplate={applyTemplate} />
      )}
    </div>
  );
}

function Section({ k, label, count, tone, open, toggle, children }: {
  k: string; label: string; count: number; tone: string; open: string | null; toggle: (k: string) => void; children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <button onClick={() => toggle(k)} className={cn("flex items-center gap-1 text-[11px] font-medium", tone)}>
        {open === k ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {label} · {count}
      </button>
      {open === k && <div className="mt-1 ml-4 max-h-48 overflow-y-auto rounded border bg-white">{children}</div>}
    </div>
  );
}

function SyncSummary({ summary: s, onClose }: { summary: QuizSyncSummary; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const sec = { open, toggle: (k: string) => setOpen(open === k ? null : k) };
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 space-y-1.5 relative">
      <button onClick={onClose} aria-label="Tutup" className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600"><X className="h-3.5 w-3.5" /></button>
      <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> Disync {fmtWhen(s.syncedAt)} · templat {s.template.name}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-zinc-600">
        <span><b>{s.created}</b> dicipta</span>
        <span><b>{s.updated}</b> dikemas kini</span>
        <span><b>{s.unchanged}</b> tiada perubahan</span>
        <span><b>{s.cleared}</b> dipadam</span>
        <span><b>{s.skipped}</b> peserta dilangkau</span>
      </div>
      <div className="flex flex-wrap gap-x-4 text-[11px] text-zinc-500">
        <span>{s.teamsScored}/{s.teamsInCompetition} peserta bermarkah</span>
        {s.quizzes.map(q => <span key={q.id}>{q.title}: {q.submitted}/{q.registered} selesai</span>)}
        {s.averaged > 0 && <span className="text-amber-700">{s.averaged} pasukan berbilang ahli — purata ahli digunakan</span>}
      </div>
      <Section {...sec} k="locked" label="Dikunci — tidak dikemas kini" count={s.locked.length} tone="text-amber-700">
        {s.locked.map(t => <p key={t.teamId} className="px-2 py-1 text-[11px] border-b last:border-0">{t.teamName} · <span className="text-zinc-400">{t.contingentName}</span></p>)}
      </Section>
      <Section {...sec} k="noresult" label="Belum menghantar kuiz" count={s.noResult.length} tone="text-zinc-600">
        {s.noResult.map(t => <p key={t.teamId} className="px-2 py-1 text-[11px] border-b last:border-0">{t.teamName} · <span className="text-zinc-400">{t.contingentName}</span></p>)}
      </Section>
    </div>
  );
}

type AiDraft = {
  name: string; code: string; description: string; notes?: string;
  criterions: { name: string; type: string; minScore: number | null; maxScore: number | null; maxTime: number | null; timePrecision?: number }[];
};

/** The AI's draft cut to what the quiz sync can fill (option criteria dropped). */
function toQuizDraft(d: AiDraft): { draft: QuizTemplateDraft; dropped: string[] } {
  const dropped = d.criterions.filter(c => c.type !== "NUMBER" && c.type !== "TIME").map(c => c.name);
  return {
    dropped,
    draft: {
      name: d.name, code: d.code, description: d.description,
      criterions: d.criterions.filter(c => c.type === "NUMBER" || c.type === "TIME").map(c => ({
        name: c.name, type: c.type as "NUMBER" | "TIME",
        minScore: c.type === "NUMBER" ? (c.minScore ?? 0) : null,
        maxScore: c.maxScore, maxTime: c.type === "TIME" ? (c.maxTime ?? 7200) : null,
        timePrecision: c.timePrecision === 2 || c.timePrecision === 3 ? c.timePrecision : 0,
      })),
    },
  };
}

function AiTemplateDialog({ base, competition, quizzes, onClose, onSaved, applyTemplate }: {
  base: string; competition: { code: string; name: string }; quizzes: { id: string; title: string; label: string }[];
  onClose: () => void; onSaved: () => Promise<void>; applyTemplate: (id: string) => Promise<void>;
}) {
  const [extra, setExtra] = useState("");
  const [draft, setDraft] = useState<QuizTemplateDraft | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const generate = useCallback(async (instructions: string, previous: QuizTemplateDraft | null) => {
    setLoading(true); setErr("");
    try {
      const form = new FormData();
      form.set("prompt", quizAiPrompt({ quizzes, extra: instructions }));
      if (previous) form.set("previous", JSON.stringify({ ...previous, criterions: previous.criterions.map(c => ({ ...c, options: [] })) }));
      const res = await fetch(`${base}/judging-templates/ai`, { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "Pembantu AI gagal.");
      const { draft: d, dropped } = toQuizDraft(j.draft as AiDraft);
      setDraft(d);
      setNote([(j.draft as AiDraft).notes, dropped.length ? `Kriteria pilihan dibuang (tidak boleh diisi daripada kuiz): ${dropped.join(", ")}.` : ""].filter(Boolean).join(" "));
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setLoading(false); }
  }, [base, quizzes]);

  useEffect(() => {
    // Draft once when the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void generate("", null);
  }, [generate]);

  const mapping = draft ? quizTemplateMapping(quizDraftCriteria(draft)) : null;
  const setCrit = (i: number, patch: Partial<QuizTemplateDraft["criterions"][number]>) =>
    setDraft(d => d && { ...d, criterions: d.criterions.map((c, j) => j === i ? { ...c, ...patch } : c) });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const weightTotal = mapping?.ok
    ? mapping.criteria.reduce((s, c) => s + (c.source.kind === "percent" ? c.source.max : c.source.kind === "correct" ? (c.source.max ?? 0) : 0), 0)
    : 0;

  async function save() {
    if (!draft) return;
    setSaving(true); setErr("");
    try {
      const r = await call(`${base}/judging-templates/ai`, {
        method: "POST",
        body: JSON.stringify({ action: "create", draft: { ...draft, criterions: draft.criterions.map(c => ({ ...c, options: [] })) } }),
      });
      await applyTemplate(r.template.id);
      await onSaved();
    } catch (e) { setErr(errText(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2 text-violet-700">
            <Sparkles className="h-4 w-4" /> Cipta templat dengan AI — {competition.code} {competition.name}
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 py-2 space-y-3 text-sm max-h-[65vh] overflow-y-auto">
          <p className="text-[11px] text-zinc-500">
            AI mendraf kriteria dan wajaran daripada penerangan pertandingan dan kuiz ({quizzes.map(q => q.title).join(" · ") || "tiada kuiz"}).
            Semak dan ubah sebelum menyimpan — tiada apa disimpan sehingga anda menekan &ldquo;Cipta &amp; guna templat&rdquo;.
          </p>
          <div className="flex gap-2 items-start">
            <textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2} aria-label="Arahan tambahan untuk AI"
              placeholder={'Arahan tambahan (pilihan), cth. "Skor 80%, jawapan betul 20%"'}
              className="flex-1 px-2 py-1.5 text-xs border rounded-lg" />
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" onClick={() => generate(extra, draft)} disabled={loading || saving}
                className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {draft ? "Perhalusi" : "Jana"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setDraft(quizDefaultDraft({ competitionCode: competition.code, competitionName: competition.name })); setNote(""); setErr(""); }}
                disabled={loading || saving} className="h-7 text-[11px]" title="Skor Kuiz /100 + Masa Menjawab, tanpa AI">
                Draf asas
              </Button>
            </div>
          </div>
          {loading && !draft && <p className="py-8 flex items-center justify-center gap-2 text-zinc-400 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> AI sedang mendraf templat…</p>}
          {note && <p className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-900">{note}</p>}

          {draft && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 text-[11px] text-zinc-500">Nama
                  <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="mt-0.5 w-full px-2 py-1.5 text-xs border rounded-lg" />
                </label>
                <label className="text-[11px] text-zinc-500">Kod
                  <input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) })} className="mt-0.5 w-full px-2 py-1.5 text-xs font-mono border rounded-lg" />
                </label>
              </div>
              <label className="block text-[11px] text-zinc-500">Penerangan
                <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2} className="mt-0.5 w-full px-2 py-1.5 text-xs border rounded-lg" />
              </label>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-zinc-500 border-b">
                    <th className="py-1 text-left">Kriteria</th><th className="py-1 text-left w-24">Jenis</th>
                    <th className="py-1 text-left w-24" title="Skor: markah maksimum (wajaran). Masa: saat.">Maks / wajaran</th>
                    <th className="py-1 text-left">Diisi daripada kuiz</th><th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {draft.criterions.map((c, i) => {
                    const src = mapping?.ok ? mapping.criteria[i]?.source : null;
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-2">
                          <input value={c.name} onChange={e => setCrit(i, { name: e.target.value })} aria-label={`Nama kriteria ${i + 1}`} className="w-full px-1.5 py-1 border rounded" />
                        </td>
                        <td className="py-1 pr-2">
                          <select value={c.type} aria-label={`Jenis kriteria ${i + 1}`}
                            onChange={e => setCrit(i, e.target.value === "TIME"
                              ? { type: "TIME", minScore: null, maxScore: null, maxTime: 7200 } : { type: "NUMBER", minScore: 0, maxScore: 100, maxTime: null })}
                            className="w-full px-1 py-1 border rounded">
                            <option value="NUMBER">Skor</option><option value="TIME">Masa</option>
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <input type="number" value={(c.type === "TIME" ? c.maxTime : c.maxScore) ?? ""} aria-label={`Maksimum kriteria ${i + 1}`}
                            onChange={e => setCrit(i, c.type === "TIME" ? { maxTime: num(e.target.value) } : { maxScore: num(e.target.value) })}
                            className="w-full px-1.5 py-1 border rounded" title={c.type === "TIME" ? "Saat" : undefined} />
                        </td>
                        <td className="py-1 text-[11px] text-zinc-500">{src ? `← ${quizSourceLabel(src)}` : "—"}</td>
                        <td className="py-1 text-right">
                          <button onClick={() => setDraft({ ...draft, criterions: draft.criterions.filter((_, j) => j !== i) })}
                            aria-label={`Buang kriteria ${i + 1}`} className="text-zinc-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center gap-3">
                <button onClick={() => setDraft({ ...draft, criterions: [...draft.criterions, { name: "", type: "NUMBER", minScore: 0, maxScore: 100, maxTime: null, timePrecision: 0 }] })}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Tambah kriteria
                </button>
                {mapping?.ok && <span className="text-[11px] text-zinc-400">Jumlah wajaran skor: {weightTotal}</span>}
              </div>
              {mapping && !mapping.ok && (
                <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Tidak boleh diisi daripada kuiz: {mapping.reason}</p>
              )}
            </>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={save}
            disabled={loading || saving || !draft || !mapping?.ok || !draft.name.trim() || !draft.code.trim() || draft.criterions.some(c => !c.name.trim())}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cipta &amp; guna templat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
