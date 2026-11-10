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
  csiSourceLabel, csiTemplateMapping, draftCriteria, type CsiCaseInfo, type CsiTemplateDraft,
} from "@/lib/csi-score-template";
import type { CsiSyncSummary } from "@/lib/csi-score-sync";

// Eptim CSI page → per competition: the judging template that stores the CSI
// results (with an AI helper) and "Selaraskan keputusan" that copies them into
// judging scores (src/lib/csi-score-sync.ts).

type TemplateRow = { id: string; name: string; code: string; criteria: number; fit: string | null; assigned: boolean };
type Status = {
  cases: (CsiCaseInfo & { inCompetition: boolean })[];
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
type Suggestion =
  | { kind: "match"; templateId: string; reason: string; ai: boolean; note?: string }
  | { kind: "draft"; draft: CsiTemplateDraft; reason: string; ai: boolean; note?: string };

const fmtWhen = (d: string) => new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" });

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.message ?? (typeof j.error === "string" ? j.error : "Permintaan gagal")), { code: j.error, status: res.status });
  return j;
}

export function CsiJudgingPanel({ eventId, ecId }: { eventId: string; ecId: string }) {
  const base = `/api/v2/organizer/events/${eventId}/competitions/${ecId}`;
  const [status, setStatus] = useState<Status | null>(null);
  const [allTemplates, setAllTemplates] = useState<{ id: string; name: string; code: string }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<CsiSyncSummary | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const reload = useCallback(async () => {
    const [s, t] = await Promise.all([call(`${base}/csi-results`), call("/api/v2/organizer/judging/templates")]);
    setStatus(s);
    setAllTemplates(t.templates ?? []);
  }, [base]);

  useEffect(() => {
    let alive = true;
    Promise.all([call(`${base}/csi-results`), call("/api/v2/organizer/judging/templates")])
      .then(([s, t]) => { if (alive) { setStatus(s); setAllTemplates(t.templates ?? []); } })
      .catch(e => { if (alive) setErr(e instanceof Error ? e.message : "Gagal"); });
    return () => { alive = false; };
  }, [base]);

  /** Assign (unless already assigned) and make the sync task use the template. */
  const applyTemplate = useCallback(async (templateId: string) => {
    if (!status?.assigned.includes(templateId)) {
      try {
        await call(`${base}/judging-templates`, { method: "POST", body: JSON.stringify({ judgingTemplateId: templateId }) });
      } catch (e) {
        if ((e as { code?: string }).code !== "ALREADY_ASSIGNED") throw e;
      }
    }
    await call(`${base}/csi-results`, { method: "POST", body: JSON.stringify({ action: "prepare", templateId }) });
  }, [base, status?.assigned]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setErr("");
    try { await fn(); }
    catch (e) {
      const code = (e as { code?: string }).code;
      setErr(code === "CONFIG_LOCKED" ? "Konfigurasi penghakiman pertandingan ini dikunci." : e instanceof Error ? e.message : "Gagal");
    }
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
  const choosable = allTemplates.map(t => byId.get(t.id)).filter((t): t is TemplateRow => !!t && (!locked || t.assigned));
  const fitting = choosable.filter(t => !t.fit);
  const notFitting = choosable.filter(t => t.fit);
  const current = status.templateId ? byId.get(status.templateId) : null;
  const assignedRows = status.assigned.map(id => byId.get(id)).filter((t): t is TemplateRow => !!t);
  const frozen = status.judgingStatus !== "OPEN";

  return (
    <div className="px-5 py-3 border-b bg-white space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <ClipboardCheck className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-xs font-semibold text-zinc-700">Templat penghakiman</span>
        <select value={status.templateId ?? ""} onChange={e => pick(e.target.value)}
          disabled={!manage || !!busy || frozen}
          className={cn("py-1.5 pl-2 pr-7 text-xs border rounded-lg bg-white max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-50 disabled:text-zinc-500",
            !status.templateId && "text-zinc-400")}>
          <option value="">{current ? "" : "— Pilih templat —"}</option>
          {fitting.length > 0 && (
            <optgroup label="Sesuai untuk keputusan CSI">
              {fitting.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code}){t.assigned ? " · ditetapkan" : ""}</option>)}
            </optgroup>
          )}
          {notFitting.length > 0 && (
            <optgroup label="Tidak boleh diisi daripada CSI">
              {notFitting.map(t => <option key={t.id} value={t.id} disabled>{t.name} ({t.code}) — {t.fit}</option>)}
            </optgroup>
          )}
        </select>
        {manage && (
          <Button size="sm" variant="outline" onClick={() => setAiOpen(true)} disabled={!!busy || locked || frozen}
            title={locked ? "Konfigurasi dikunci" : "Cari templat terbaik atau draf templat baharu untuk kes CSI ini"}
            className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50">
            <Sparkles className="h-3.5 w-3.5" /> Bantuan AI
          </Button>
        )}
        <div className="flex-1" />
        {manage && (
          <Button size="sm" onClick={() => run("sync", async () => { setSummary(await call(`${base}/csi-results`, { method: "POST", body: JSON.stringify({ action: "sync" }) })); await reload(); })}
            disabled={!!busy || !status.templateId || !!status.blocked || !!status.task?.completedAt}
            title={status.blocked ?? (!status.templateId ? "Pilih templat yang sesuai dahulu" : "Salin keputusan Eptim CSI ke markah penghakiman")}
            className="h-7 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
            {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Selaraskan keputusan
          </Button>
        )}
      </div>

      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-zinc-500">
        {status.task ? (
          <span>
            Tugas <b className="text-zinc-700">{status.syncLabel}</b> · {status.task.teamsScored} pasukan bermarkah · dikemas kini {fmtWhen(status.task.updatedAt)}
            {status.task.completedAt && <span className="ml-1 text-amber-700">(diumumkan selesai — dikunci)</span>}
          </span>
        ) : status.templateId ? (
          <span>Belum diselaraskan — markah akan ditulis melalui tugas <b className="text-zinc-700">{status.syncLabel}</b>.</span>
        ) : (
          <span>Pilih templat yang sesuai (atau gunakan Bantuan AI) sebelum menyelaraskan keputusan.</span>
        )}
        {locked && <span className="inline-flex items-center gap-1 text-amber-700"><Lock className="h-3 w-3" /> Konfigurasi dikunci</span>}
        {status.blocked && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" /> {status.blocked}</span>}
        {busy === "pick" && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Menetapkan templat…</span>}
      </div>

      {assignedRows.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-zinc-400">Ditetapkan:</span>
          {assignedRows.map(t => (
            <span key={t.id} title={t.fit ? `Tidak boleh diisi daripada CSI: ${t.fit}` : "Sesuai untuk keputusan CSI"}
              className={cn("inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full border",
                t.id === status.templateId ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-zinc-50 text-zinc-600")}>
              {!t.fit && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
              {t.name}
              {manage && !locked && (
                <button disabled={!!busy} title="Nyahtetapkan templat"
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
        description={`${status.task?.scores ?? 0} markah yang diselaraskan pada templat "${status.task?.template.name}" akan dipadam. Tekan "Selaraskan keputusan" selepas itu untuk menulisnya semula pada templat baharu.`}
        confirmLabel="Tukar" loading={busy === "pick"}
        onConfirm={() => run("pick", async () => { await applyTemplate(switchTo!); setSwitchTo(null); await reload(); })} />

      {aiOpen && (
        <AiTemplateDialog base={base} cases={status.cases} templates={byId}
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

function SyncSummary({ summary: s, onClose }: { summary: CsiSyncSummary; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(s.unmatched.some(u => u.reason === "unknown") ? "unmatched" : null);
  const unknown = s.unmatched.filter(u => u.reason === "unknown");
  const other = s.unmatched.filter(u => u.reason === "other");
  const toggle = (k: string) => setOpen(open === k ? null : k);
  const sec = { open, toggle };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 space-y-1.5 relative">
      <button onClick={onClose} className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600"><X className="h-3.5 w-3.5" /></button>
      <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> Diselaraskan {fmtWhen(s.syncedAt)} · templat {s.template.name}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-zinc-600">
        <span><b>{s.teamsScored}</b> pasukan bermarkah</span>
        <span><b>{s.teamsRegistered}</b>/{s.teamsInCompetition} pasukan berdaftar di CSI</span>
        <span>Markah: <b>{s.created}</b> baharu · <b>{s.updated}</b> dikemas kini · <b>{s.unchanged}</b> tiada perubahan · <b>{s.cleared}</b> dipadam</span>
      </div>
      <div className="flex flex-wrap gap-x-4 text-[11px] text-zinc-500">
        {s.cases.map(c => <span key={c.id}>{c.title}: {c.scored}/{c.registered} selesai</span>)}
      </div>
      <Section {...sec} k="unmatched" label="Pemain CSI tidak sepadan dengan pasukan" count={unknown.length} tone="text-rose-700">
        <table className="w-full text-[11px]">
          <tbody>
            {unknown.map(u => (
              <tr key={u.userId} className="border-b last:border-0">
                <td className="px-2 py-1 text-zinc-700">{u.alias ?? "—"}</td>
                <td className="px-2 py-1 font-mono text-[10px] text-zinc-400">{u.userId}</td>
                <td className="px-2 py-1 text-zinc-500">{u.cases.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section {...sec} k="other" label="Pasukan acara / pertandingan lain (diabaikan)" count={other.length} tone="text-zinc-500">
        <p className="px-2 py-1 text-[11px] text-zinc-500">
          Pemain ini ialah pasukan MT yang tidak didaftarkan dalam pertandingan ini bagi acara ini — biasanya acara lain yang berkongsi pertandingan CSI yang sama.
        </p>
      </Section>
      <Section {...sec} k="locked" label="Dikunci — tidak dikemas kini" count={s.locked.length} tone="text-amber-700">
        {s.locked.map(t => <p key={t.teamId} className="px-2 py-1 text-[11px] border-b last:border-0">{t.teamName} · <span className="text-zinc-400">{t.contingentName}</span></p>)}
      </Section>
      <Section {...sec} k="noresult" label="Berdaftar tetapi belum selesai mana-mana kes" count={s.noResult.length} tone="text-zinc-600">
        {s.noResult.map(t => <p key={t.teamId} className="px-2 py-1 text-[11px] border-b last:border-0">{t.teamName} · <span className="text-zinc-400">{t.contingentName}</span></p>)}
      </Section>
    </div>
  );
}

function AiTemplateDialog({ base, cases, templates, onClose, onSaved, applyTemplate }: {
  base: string; cases: CsiCaseInfo[]; templates: Map<string, TemplateRow>;
  onClose: () => void; onSaved: () => Promise<void>; applyTemplate: (id: string) => Promise<void>;
}) {
  const [sugg, setSugg] = useState<Suggestion | null>(null);
  const [draft, setDraft] = useState<CsiTemplateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [matchCriteria, setMatchCriteria] = useState<{ name: string; type: string; order: number; minScore: number | null; maxScore: number | null; maxTime: number | null }[] | null>(null);

  const ask = useCallback(async (mode: "auto" | "draft") => {
    setLoading(true); setErr(""); setSugg(null); setDraft(null); setMatchCriteria(null);
    try {
      const s: Suggestion = await call(`${base}/csi-results/suggest`, { method: "POST", body: JSON.stringify({ action: "suggest", mode }) });
      setSugg(s);
      if (s.kind === "draft") setDraft(s.draft);
      else {
        const t = await call(`/api/v2/organizer/judging/templates/${s.templateId}`).catch(() => null);
        setMatchCriteria(t?.template?.criterions ?? null);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setLoading(false); }
  }, [base]);

  useEffect(() => {
    // Ask once when the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void ask("auto");
  }, [ask]);

  const mapping = draft ? csiTemplateMapping(draftCriteria(draft), cases)
    : matchCriteria ? csiTemplateMapping(matchCriteria as Parameters<typeof csiTemplateMapping>[0], cases) : null;
  const setCrit = (i: number, patch: Partial<CsiTemplateDraft["criterions"][number]>) =>
    setDraft(d => d && { ...d, criterions: d.criterions.map((c, j) => j === i ? { ...c, ...patch } : c) });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    if (!sugg) return;
    setSaving(true); setErr("");
    try {
      let templateId = sugg.kind === "match" ? sugg.templateId : null;
      if (sugg.kind === "draft") {
        const r = await call(`${base}/csi-results/suggest`, { method: "POST", body: JSON.stringify({ action: "create", draft }) });
        templateId = r.template.id;
      }
      await applyTemplate(templateId!);
      await onSaved();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(code === "CONFIG_LOCKED" ? "Konfigurasi penghakiman pertandingan ini dikunci." : e instanceof Error ? e.message : "Gagal");
    } finally { setSaving(false); }
  }

  const match = sugg?.kind === "match" ? templates.get(sugg.templateId) : null;

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2 text-violet-700">
            <Sparkles className="h-4 w-4" /> Bantuan AI — templat keputusan CSI
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 py-2 space-y-3 text-sm max-h-[65vh] overflow-y-auto">
          <p className="text-[11px] text-zinc-500">
            Kes: {cases.map(c => `${c.title}${c.maxScore != null ? ` (/${c.maxScore})` : ""}`).join(" · ")}
          </p>
          {loading && <p className="py-8 flex items-center justify-center gap-2 text-zinc-400 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Menganalisis templat sedia ada…</p>}
          {sugg && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-900 space-y-0.5">
              <p className="font-semibold">{sugg.kind === "match" ? "Templat sedia ada yang paling sesuai" : "Tiada templat sedia ada yang sesuai — draf templat baharu"}</p>
              {sugg.reason && <p>{sugg.reason}</p>}
              {sugg.note && <p className="text-amber-700">{sugg.note}</p>}
            </div>
          )}

          {match && (
            <div className="rounded-lg border px-3 py-2">
              <p className="text-sm font-semibold text-zinc-800">{match.name} <span className="font-mono text-xs text-zinc-400">{match.code}</span></p>
              {match.assigned && <p className="text-[11px] text-emerald-700">Sudah ditetapkan pada pertandingan ini.</p>}
            </div>
          )}

          {draft && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 text-[11px] text-zinc-500">Nama
                  <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="mt-0.5 w-full px-2 py-1.5 text-xs border rounded-lg" />
                </label>
                <label className="text-[11px] text-zinc-500">Kod
                  <input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="mt-0.5 w-full px-2 py-1.5 text-xs font-mono border rounded-lg" />
                </label>
              </div>
              <label className="block text-[11px] text-zinc-500">Penerangan
                <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2} className="mt-0.5 w-full px-2 py-1.5 text-xs border rounded-lg" />
              </label>
            </div>
          )}

          {(draft || matchCriteria) && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-zinc-500 border-b">
                  <th className="py-1 text-left">Kriteria</th><th className="py-1 text-left w-24">Jenis</th>
                  <th className="py-1 text-left w-24">Maks</th><th className="py-1 text-left">Diisi daripada CSI</th>{draft && <th className="w-6" />}
                </tr>
              </thead>
              <tbody>
                {(draft ? draft.criterions : [...matchCriteria!].sort((a, b) => a.order - b.order)).map((c, i) => {
                  const src = mapping?.ok ? mapping.criteria[i]?.source : null;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-2">
                        {draft ? <input value={c.name} onChange={e => setCrit(i, { name: e.target.value })} className="w-full px-1.5 py-1 border rounded" /> : c.name}
                      </td>
                      <td className="py-1 pr-2">
                        {draft ? (
                          <select value={c.type} onChange={e => setCrit(i, e.target.value === "TIME"
                            ? { type: "TIME", minScore: null, maxScore: null, maxTime: 3600 } : { type: "NUMBER", minScore: 0, maxTime: null })}
                            className="w-full px-1 py-1 border rounded">
                            <option value="NUMBER">Skor</option><option value="TIME">Masa</option>
                          </select>
                        ) : c.type === "TIME" ? "Masa" : c.type === "NUMBER" ? "Skor" : c.type}
                      </td>
                      <td className="py-1 pr-2">
                        {draft ? (
                          <input type="number" value={(c.type === "TIME" ? c.maxTime : c.maxScore) ?? ""}
                            onChange={e => setCrit(i, c.type === "TIME" ? { maxTime: num(e.target.value) } : { maxScore: num(e.target.value) })}
                            className="w-full px-1.5 py-1 border rounded" title={c.type === "TIME" ? "Saat" : undefined} />
                        ) : (c.type === "TIME" ? (c.maxTime != null ? `${c.maxTime}s` : "—") : (c.maxScore ?? "—"))}
                      </td>
                      <td className="py-1 text-[11px] text-zinc-500">{src ? `← ${csiSourceLabel(src)}` : "—"}</td>
                      {draft && (
                        <td className="py-1 text-right">
                          <button onClick={() => setDraft({ ...draft, criterions: draft.criterions.filter((_, j) => j !== i) })}
                            className="text-zinc-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {draft && (
            <button onClick={() => setDraft({ ...draft, criterions: [...draft.criterions, { name: "", type: "NUMBER", minScore: 0, maxScore: null, maxTime: null }] })}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1">
              <Plus className="h-3 w-3" /> Tambah kriteria
            </button>
          )}
          {mapping && !mapping.ok && (
            <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Tidak boleh diisi daripada CSI: {mapping.reason}</p>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {sugg?.kind === "match" && (
            <Button variant="ghost" size="sm" onClick={() => ask("draft")} disabled={loading || saving} className="mr-auto text-violet-700">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Draf templat baharu
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={save} disabled={loading || saving || !sugg || !mapping?.ok || (!!draft && (!draft.name.trim() || !draft.code.trim()))}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {sugg?.kind === "draft" ? "Cipta & guna templat" : "Guna templat ini"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
