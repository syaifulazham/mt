"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Loader2, Square, Play, RotateCcw, ClipboardCheck, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type AiScore = { criterionId: string; name: string; score: number; max: number; reason: string };
export type AiRow = {
  teamId: string; status: "IDLE" | "QUEUED" | "RUNNING" | "DONE" | "ERROR";
  templateId: string | null; scoredTemplateId: string | null;
  projectName: string | null; projectUrl: string | null;
  scores: AiScore[] | null; total: number | null; maxTotal: number | null;
  comment: string | null; error: string | null; judgedAt: string | null;
};
type AiTemplate = { id: string; name: string; code: string; criteria: { id: string; name: string; maxScore: number | null }[]; fit: string | null };
export type AiState = {
  aiConfigured: boolean; webcraftConfigured: boolean; configLocked: boolean; hasDefaultRubric: boolean;
  recordBlocked: string | null;
  templates: AiTemplate[];
  rows: AiRow[];
  progress: { queued: number; running: number; done: number; error: number; active: boolean };
  task: { templateId: string; scores: number; updatedAt: string } | null;
};

/** AI marking state of one competition, polled quickly while marking runs. */
export function useWebcraftAi(eventId: string, ecId: string) {
  const [state, setState] = useState<AiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  const url = `/api/v2/organizer/events/${eventId}/competitions/${ecId}/webcraft-ai`;

  const load = useCallback(async () => {
    if (!ecId) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
      setState(json as AiState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuatkan penilaian AI");
    }
  }, [url, ecId]);

  const busyRef = useRef(false);
  const act = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(action === "start" && Array.isArray(body.teamIds) ? `team:${(body.teamIds as string[])[0]}` : action);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
      setState(json as AiState);
      setError(null);
      return json as AiState & Record<string, unknown>;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Tindakan gagal");
      return null;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [url]);

  const running = !!state && (state.progress.queued > 0 || state.progress.running > 0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, running ? 2000 : 15000);
    return () => clearInterval(t);
  }, [load, running]);

  // Rubric in use: the one picked, else the scorecard task's, else the standard rubric, else the first that fits.
  const usable = state?.templates.filter((t) => !t.fit) ?? [];
  const chosen = usable.find((t) => t.id === picked)
    ?? usable.find((t) => t.id === state?.task?.templateId)
    ?? usable.find((t) => t.code === "WEBCRAFT-RBK")
    ?? usable[0];

  return { state, error, busy, notice, setNotice, act, running, chosen, setPicked };
}

export function WebcraftAiPanel({
  ai, canWrite, teamNames, teamsWithProjects,
}: {
  ai: ReturnType<typeof useWebcraftAi>;
  canWrite: boolean;
  teamNames: Map<string, string>;
  /** null while projects are loading */
  teamsWithProjects: number | null;
}) {
  const { state, error, busy, notice, setNotice, act, running, chosen, setPicked } = ai;
  const [confirmAll, setConfirmAll] = useState(false);
  const [showRubric, setShowRubric] = useState(false);

  if (!state) {
    return (
      <div className="px-5 py-3 border-b border-zinc-100 text-xs text-zinc-400 flex items-center gap-1.5">
        {error ? <><AlertTriangle className="h-3.5 w-3.5 text-red-500" /> {error}</> : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuatkan penilaian AI…</>}
      </div>
    );
  }

  const { progress } = state;
  const markedWithChosen = chosen ? state.rows.filter((r) => r.scoredTemplateId === chosen.id).length : 0;
  const runTotal = progress.queued + progress.running + progress.done + progress.error;
  const finished = progress.done + progress.error;
  const pct = runTotal ? Math.round((finished / runTotal) * 100) : 0;
  const runningNames = state.rows.filter((r) => r.status === "RUNNING").map((r) => teamNames.get(r.teamId) ?? r.teamId);
  const errors = state.rows.filter((r) => r.status === "ERROR");
  const maxTotal = chosen?.criteria.reduce((s, c) => s + (c.maxScore ?? 0), 0) ?? 0;

  const start = async (mode: "missing" | "all") => {
    if (!chosen) return;
    const r = await act("start", { templateId: chosen.id, mode });
    if (r) setNotice(
      (r.queued as number) > 0
        ? `${r.queued} dimasukkan ke barisan penilaian.${(r.noProject as number) ? ` ${r.noProject} tiada projek diterbitkan.` : ""}`
        : `Tiada untuk dinilai${(r.noProject as number) ? ` (${r.noProject} tiada projek diterbitkan)` : ""}.`,
    );
  };

  return (
    <div className="border-b border-zinc-100 bg-gradient-to-r from-violet-50/70 to-fuchsia-50/40 px-5 py-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-violet-800">
          <Sparkles className="h-4 w-4" /> Penilaian AI
        </h3>
        {!state.aiConfigured && <span className="text-[11px] text-red-600">GEMINI_API_KEY tidak ditetapkan</span>}
        <div className="flex-1" />
        {state.task && (
          <span className="text-[11px] text-zinc-500">
            Kad skor: {state.task.scores} markah direkod · {new Date(state.task.updatedAt).toLocaleString("ms-MY")}
          </span>
        )}
      </div>

      {/* Rubric */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-600">Rubrik</label>
        <select
          value={chosen?.id ?? ""}
          onChange={(e) => setPicked(e.target.value)}
          disabled={running}
          className="h-8 min-w-[16rem] rounded-md border border-zinc-200 bg-white px-2 text-xs disabled:opacity-60"
        >
          {state.templates.length === 0 && <option value="">Tiada templat ditetapkan</option>}
          {state.templates.map((t) => (
            <option key={t.id} value={t.id} disabled={!!t.fit}>
              {t.name}{t.fit ? ` — ${t.fit}` : ` (/${t.criteria.reduce((s, c) => s + (c.maxScore ?? 0), 0)})`}
            </option>
          ))}
        </select>
        {chosen && (
          <button type="button" onClick={() => setShowRubric((v) => !v)} className="inline-flex items-center gap-0.5 text-[11px] text-violet-700 hover:underline">
            {chosen.criteria.length} kriteria {showRubric ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
        {canWrite && !state.hasDefaultRubric && (
          <button
            type="button"
            disabled={!!busy || state.configLocked}
            title={state.configLocked ? "Konfigurasi penghakiman dikunci" : undefined}
            onClick={async () => { const r = await act("rubric"); if (r?.templateId) setPicked(r.templateId as string); }}
            className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2.5 py-1.5 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            {busy === "rubric" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Guna rubrik Webcraft standard
          </button>
        )}
      </div>
      {showRubric && chosen && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.criteria.map((c) => (
            <span key={c.id} className="rounded-full bg-white border border-violet-100 px-2 py-0.5 text-[11px] text-zinc-700">
              {c.name} <span className="text-zinc-400">/{c.maxScore}</span>
            </span>
          ))}
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800">Jumlah /{maxTotal}</span>
        </div>
      )}

      {/* Actions */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          {!running ? (
            <>
              <button
                type="button"
                disabled={!chosen || !!busy || !state.aiConfigured}
                onClick={() => start("missing")}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Mula penilaian AI
              </button>
              <button
                type="button"
                disabled={!chosen || !!busy || !state.aiConfigured || markedWithChosen === 0}
                onClick={() => setConfirmAll(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Nilai semula semua
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act("stop")}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {busy === "stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Hentikan
            </button>
          )}
          <button
            type="button"
            disabled={!chosen || !!busy || running || markedWithChosen === 0 || !!state.recordBlocked}
            title={state.recordBlocked ?? "Salin markah AI ke kad skor penghakiman (Keputusan)"}
            onClick={async () => {
              const r = await act("record", { templateId: chosen!.id });
              const s = r?.summary as { teams: number; locked: number; written: number; unchanged: number } | undefined;
              if (s) setNotice(`Direkod: ${s.teams} pasukan · ${s.written} markah dikemas kini, ${s.unchanged} tidak berubah${s.locked ? ` · ${s.locked} dikunci (tidak diubah)` : ""}.`);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy === "record" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
            Rekod ke kad skor
          </button>
          <span className="text-[11px] text-zinc-500">
            {markedWithChosen} dinilai dengan rubrik ini{teamsWithProjects !== null && ` · ${teamsWithProjects} ada projek`}
          </span>
        </div>
      )}

      {/* Progress */}
      {runTotal > 0 && (running || progress.error > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-600">
            <span className="flex items-center gap-1.5">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              {running ? "Sedang menilai" : "Penilaian selesai"} — {finished}/{runTotal}
            </span>
            <span>
              <span className="text-emerald-700">{progress.done} selesai</span>
              {progress.running > 0 && <> · <span className="text-violet-700">{progress.running} dinilai</span></>}
              {progress.queued > 0 && <> · {progress.queued} menunggu</>}
              {progress.error > 0 && <> · <span className="text-red-600">{progress.error} ralat</span></>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white border border-violet-100 overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${runTotal ? (progress.done / runTotal) * 100 : 0}%` }} />
            <div className="h-full bg-red-400 transition-all" style={{ width: `${runTotal ? (progress.error / runTotal) * 100 : 0}%` }} />
            <div className="h-full bg-violet-300 animate-pulse transition-all" style={{ width: `${runTotal ? (progress.running / runTotal) * 100 : 0}%` }} />
          </div>
          {runningNames.length > 0 && (
            <p className="text-[11px] text-violet-700 truncate">Menilai: {runningNames.join(" · ")}</p>
          )}
          {!running && errors.length > 0 && canWrite && chosen && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act("start", { templateId: chosen.id, mode: "all", teamIds: errors.map((r) => r.teamId) })}
              className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
            >
              Cuba semula {errors.length} yang ralat
            </button>
          )}
          <span className="sr-only">{pct}%</span>
        </div>
      )}

      {notice && <p className="text-[11px] text-zinc-700 bg-white/70 rounded px-2 py-1">{notice}</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Nilai semula semua?"
        description={`Semua pasukan yang ada projek akan dinilai semula dengan "${chosen?.name ?? ""}". Keputusan AI sedia ada diganti apabila penilaian baharu siap.`}
        confirmLabel="Nilai semula"
        destructive={false}
        onConfirm={async () => { setConfirmAll(false); await start("all"); }}
      />
    </div>
  );
}

/** The "Markah AI" cell for one team. */
export function AiCell({
  row, open, onToggle, onRun, canRun, busy,
}: {
  row: AiRow | undefined; open: boolean; onToggle: () => void; onRun: () => void; canRun: boolean; busy: boolean;
}) {
  const hasResult = row?.scores && row.total != null;
  return (
    <div className="space-y-1">
      {row?.status === "QUEUED" && <span className="text-[11px] text-zinc-500">Menunggu…</span>}
      {row?.status === "RUNNING" && (
        <span className="inline-flex items-center gap-1 text-[11px] text-violet-700"><Loader2 className="h-3 w-3 animate-spin" /> Menilai…</span>
      )}
      {row?.status === "ERROR" && (
        <span className="inline-flex items-start gap-1 text-[11px] text-red-600" title={row.error ?? ""}>
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> <span className="line-clamp-2">{row.error ?? "Ralat"}</span>
        </span>
      )}
      {hasResult && (
        <button type="button" onClick={onToggle} className="flex items-center gap-1 text-left">
          <span className="text-base font-bold text-violet-800 tabular-nums">{fmtNum(row!.total!)}</span>
          <span className="text-[11px] text-zinc-400">/{fmtNum(row!.maxTotal ?? 0)}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />}
        </button>
      )}
      {!row?.status || row.status === "IDLE" ? !hasResult && <span className="text-[11px] text-zinc-400">—</span> : null}
      {canRun && row?.status !== "QUEUED" && row?.status !== "RUNNING" && (
        <button type="button" onClick={onRun} disabled={busy} className="block text-[10px] text-violet-600 hover:underline disabled:opacity-50">
          {busy ? "…" : hasResult ? "Nilai semula" : "Nilai"}
        </button>
      )}
    </div>
  );
}

/** Expanded breakdown under a team row: per-criterion score and reason, and the AI comment. */
export function AiDetail({ row }: { row: AiRow }) {
  return (
    <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3 space-y-2">
      {row.comment && (
        <p className="text-sm text-zinc-800 flex gap-1.5">
          <Sparkles className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" /> <span>{row.comment}</span>
        </p>
      )}
      <table className="w-full text-xs">
        <tbody className="divide-y divide-violet-100">
          {(row.scores ?? []).map((s) => (
            <tr key={s.criterionId} className="align-top">
              <td className="py-1 pr-3 font-medium text-zinc-700 whitespace-nowrap">{s.name}</td>
              <td className="py-1 pr-3 tabular-nums whitespace-nowrap">
                <span className="font-semibold text-violet-800">{fmtNum(s.score)}</span><span className="text-zinc-400">/{fmtNum(s.max)}</span>
                <span className="ml-2 inline-block h-1.5 w-16 rounded-full bg-violet-100 align-middle overflow-hidden">
                  <span className="block h-full bg-violet-500" style={{ width: `${s.max ? (s.score / s.max) * 100 : 0}%` }} />
                </span>
              </td>
              <td className="py-1 text-zinc-600">{s.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-zinc-400">
        Projek dinilai: {row.projectUrl ? <a href={row.projectUrl} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">{row.projectName}</a> : row.projectName}
        {row.judgedAt && ` · ${new Date(row.judgedAt).toLocaleString("ms-MY")}`}
        {" · "}Markah AI ialah cadangan; semak sebelum direkod.
      </p>
    </div>
  );
}

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
