"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Gavel, Plus, Trash2, Loader2, Copy, Check,
  Eye, EyeOff, ChevronDown, ChevronRight, Tag, ExternalLink,
  ShieldCheck, Lock, LockOpen, ClipboardCheck, Megaphone, CheckCircle2, CircleDashed, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EventJudgingProgress } from "@/lib/judgingStatus";

/** How often the page re-reads judging status and progress. */
const STATUS_POLL_MS = 3_000;

// ── Types ──────────────────────────────────────────────────────────────────────

type TemplateSummary = {
  id: string; name: string; code: string; description: string | null;
  _count: { criterions: number };
};

type TaskItem = {
  id: string; label: string | null; routeSlug: string; passcode: string;
  status: "ACTIVE" | "CLOSED";
  judgingTemplate: { id: string; name: string; code: string };
  /** Teams with at least one score in this task (0 for a new task). */
  judgedTeams?: number;
  /** When the judge announced this task complete from the judging page. */
  completedAt?: Date | string | null;
};

type AssignedTemplate = {
  judgingTemplate: TemplateSummary;
};

/** Judging lifecycle — see lib/judgingStatus.ts. */
type JudgingState = {
  judgingStatus: string; // OPEN | COMPLETED | VERIFIED
  judgingCompletedAt: Date | string | null;
  judgingCompletedBy: string | null;
  judgingVerifiedAt: Date | string | null;
  judgingVerifiedBy: string | null;
};

type CompetitionBlock = JudgingState & {
  id: string;
  competitionId: string;
  competition: {
    id: string; name: string; code: string; participationType: string;
    targetGroups: { targetGroup: { schoolLevel: string } }[];
  };
  judgingTemplates: AssignedTemplate[];
  judgingTasks: TaskItem[];
  /** ACTIVE teams entered in the event for this competition. */
  teamCount: number;
};

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  OPEN:      { label: "DIBUKA",   cls: "bg-sky-50 text-sky-700 border-sky-200" },
  COMPLETED: { label: "SELESAI",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  VERIFIED:  { label: "VERIFIED", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
};

/**
 * Matcher for the competition filter, case-insensitive. Without * or ? it's a
 * substring match; with them, a wildcard pattern over the whole value
 * (* = any run of characters, ? = exactly one). Empty matches everything.
 */
function competitionFilter(raw: string): (value: string) => boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return () => true;
  if (!/[*?]/.test(q)) return v => v.toLowerCase().includes(q);
  const re = new RegExp(
    "^" + q.split("").map(ch => ch === "*" ? ".*" : ch === "?" ? "." : ch.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("") + "$",
  );
  return v => re.test(v.toLowerCase());
}

function fmtWhen(d: Date | string | null) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "";
}

// ── JudgingStatusPanel ─────────────────────────────────────────────────────────
// The "announce completeness" subsection of a competition card.
//   OPEN       Admin / Super Admin: "Umumkan Selesai" (locks every judging form)
//   COMPLETED  Super Admin: "Verify" (results marked VERIFIED) or "Buka Semula"
//   VERIFIED   Super Admin: "Buka Semula"

function JudgingStatusPanel({
  ec, eventId, canWrite, isSuperAdmin, onChanged,
}: {
  ec: CompetitionBlock;
  eventId: string;
  canWrite: boolean;
  isSuperAdmin: boolean;
  onChanged: (ecId: string, judging: JudgingState) => void;
}) {
  const [confirm, setConfirm] = useState<"complete" | "verify" | "reopen" | null>(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");

  const status   = ec.judgingStatus;
  const tasks    = ec.judgingTasks;
  const pending  = tasks.filter(t => (t.judgedTeams ?? 0) < ec.teamCount);
  const allDone  = tasks.length > 0 && ec.teamCount > 0 && pending.length === 0;

  async function run(action: "complete" | "verify" | "reopen") {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${ec.id}/judging-status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      onChanged(ec.id, j.judging);
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally { setBusy(false); }
  }

  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.OPEN;

  return (
    <div className={cn(
      "px-5 py-4 space-y-3",
      status === "VERIFIED" ? "bg-emerald-50/50" : status === "COMPLETED" ? "bg-amber-50/40" : "bg-white",
    )}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {status === "VERIFIED" ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
              : status === "COMPLETED" ? <Lock className="h-4 w-4 text-amber-600" />
              : <ClipboardCheck className="h-4 w-4 text-zinc-400" />}
            <span className="text-sm font-semibold text-zinc-800">Status Penghakiman</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", chip.cls)}>{chip.label}</span>
          </div>
          <p className="text-xs text-zinc-500">
            {status === "OPEN" && "Borang penghakiman dibuka. Umumkan selesai apabila semua pasukan telah dinilai — borang akan dikunci."}
            {status === "COMPLETED" && <>Penghakiman diumumkan selesai oleh <b>{ec.judgingCompletedBy}</b> pada {fmtWhen(ec.judgingCompletedAt)}. Borang penghakiman dikunci; menunggu pengesahan Super Admin.</>}
            {status === "VERIFIED" && <>Keputusan disahkan (<b>VERIFIED</b>) oleh <b>{ec.judgingVerifiedBy}</b> pada {fmtWhen(ec.judgingVerifiedAt)}. Diumumkan selesai oleh {ec.judgingCompletedBy} pada {fmtWhen(ec.judgingCompletedAt)}.</>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "OPEN" && canWrite && (
            <Button size="sm" onClick={() => setConfirm("complete")} disabled={tasks.length === 0}
              title={tasks.length === 0 ? "Tiada tugas penghakiman" : undefined}
              className="h-7 text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-white">
              <Megaphone className="h-3.5 w-3.5" /> Umumkan Selesai
            </Button>
          )}
          {status === "COMPLETED" && isSuperAdmin && (
            <Button size="sm" onClick={() => setConfirm("verify")}
              className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
              <ShieldCheck className="h-3.5 w-3.5" /> Verify
            </Button>
          )}
          {status !== "OPEN" && isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => setConfirm("reopen")}
              className="h-7 text-xs gap-1 border-zinc-300 text-zinc-700">
              <LockOpen className="h-3.5 w-3.5" /> Buka Semula
            </Button>
          )}
        </div>
      </div>

      {/* Completeness: teams scored per task, out of the teams entered */}
      {tasks.length > 0 && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {tasks.map(t => {
            const n = t.judgedTeams ?? 0;
            const done = ec.teamCount > 0 && n >= ec.teamCount;
            return (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                {done
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <CircleDashed className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <span className="truncate text-zinc-700">{t.label ?? t.judgingTemplate.name}</span>
                {t.completedAt && (
                  <span title={`Hakim mengumumkan selesai pada ${fmtWhen(t.completedAt)}`}
                    className="shrink-0 text-[9px] font-bold px-1.5 py-px rounded bg-amber-100 text-amber-700">
                    HAKIM: SELESAI
                  </span>
                )}
                <span className={cn("ml-auto tabular-nums", done ? "text-emerald-700" : "text-amber-700")}>
                  {n}/{ec.teamCount} pasukan dinilai
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}

      <Dialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {confirm === "complete" ? "Umumkan penghakiman selesai?" : confirm === "verify" ? "Sahkan keputusan (VERIFIED)?" : "Buka semula penghakiman?"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-2 space-y-2 text-xs text-zinc-600">
            <p className="font-medium text-zinc-800">
              <span className="font-mono text-zinc-400 mr-1">{ec.competition.code}</span>{ec.competition.name}
            </p>
            {confirm === "complete" && (
              <>
                <p>Semua borang penghakiman bagi pertandingan ini akan <b>dikunci</b> — hakim tidak lagi boleh menambah atau mengubah markah. Hanya Super Admin boleh membuka semula.</p>
                {!allDone && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
                    {ec.teamCount === 0
                      ? "Tiada pasukan didaftarkan untuk pertandingan ini."
                      : `${pending.length} daripada ${tasks.length} tugas belum menilai kesemua ${ec.teamCount} pasukan.`}
                  </p>
                )}
              </>
            )}
            {confirm === "verify" && <p>Keputusan pertandingan ini akan ditanda <b>VERIFIED</b>. Borang kekal dikunci.</p>}
            {confirm === "reopen" && <p>Borang penghakiman akan dibuka semula dan hakim boleh mengubah markah. {status === "VERIFIED" && "Status VERIFIED akan dibatalkan."}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button>
            <Button onClick={() => confirm && run(confirm)} disabled={busy}
              className={cn("gap-1.5 text-white",
                confirm === "verify" ? "bg-emerald-600 hover:bg-emerald-700"
                : confirm === "complete" ? "bg-amber-500 hover:bg-amber-600"
                : "bg-zinc-700 hover:bg-zinc-800")}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirm === "complete" ? "Umumkan Selesai" : confirm === "verify" ? "Verify" : "Buka Semula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type EventInfo = { id: string; name: string; slug: string; scope: string };

// ── School level grouping ──────────────────────────────────────────────────────

const LEVEL_ORDER = ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH"] as const;
type SchoolLevel = typeof LEVEL_ORDER[number];

const LEVEL_LABEL: Record<SchoolLevel, string> = {
  KINDERGARTEN: "TADIKA",
  PRIMARY:      "SEKOLAH RENDAH",
  SECONDARY:    "SEKOLAH MENENGAH",
  YOUTH:        "BELIA",
};

const LEVEL_COLOR: Record<SchoolLevel, string> = {
  KINDERGARTEN: "bg-pink-100 text-pink-700 border-pink-200",
  PRIMARY:      "bg-sky-100 text-sky-700 border-sky-200",
  SECONDARY:    "bg-violet-100 text-violet-700 border-violet-200",
  YOUTH:        "bg-amber-100 text-amber-700 border-amber-200",
};

function getSchoolLevels(ec: CompetitionBlock): SchoolLevel[] {
  const levels = ec.competition.targetGroups
    .map(tg => tg.targetGroup.schoolLevel)
    .filter((l): l is SchoolLevel => LEVEL_ORDER.includes(l as SchoolLevel));
  return [...new Set(levels)];
}

// ── TaskRow ────────────────────────────────────────────────────────────────────

function TaskRow({
  task, ecId, eventId, canWrite, isSuperAdmin, onDelete, onStatusChange, onReopened,
}: {
  task: TaskItem;
  ecId: string;
  eventId: string;
  canWrite: boolean;
  isSuperAdmin: boolean;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: "ACTIVE" | "CLOSED") => void;
  onReopened: (id: string) => void;
}) {
  const [reopening, setReopening] = useState(false);
  // Undo a judge's "Penghakiman Selesai" for this task (Super Admin only).
  async function reopenTask() {
    setReopening(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${ecId}/judging-tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reopenCompletion: true }),
      });
      if (res.ok) onReopened(task.id);
    } finally { setReopening(false); }
  }
  const [showPass,   setShowPass]   = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [toggling,   setToggling]   = useState(false);

  const judgeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/judging/${task.routeSlug}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(judgeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyPass() {
    await navigator.clipboard.writeText(task.passcode);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/v2/organizer/events/${eventId}/competitions/${ecId}/judging-tasks/${task.id}`, { method: "DELETE" });
      onDelete(task.id);
    } finally { setDeleting(false); }
  }

  async function toggleStatus() {
    setToggling(true);
    const next = task.status === "ACTIVE" ? "CLOSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${ecId}/judging-tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
      });
      if (res.ok) onStatusChange(task.id, next);
    } finally { setToggling(false); }
  }

  return (
    <tr className={cn("border-b last:border-0 hover:bg-zinc-50/60 transition-colors", task.status === "CLOSED" && "opacity-50")}>
      <td className="px-4 py-3 text-sm">
        {task.label
          ? <span className="font-medium text-zinc-800">{task.label}</span>
          : <span className="text-zinc-300 italic text-xs">—</span>
        }
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">
          {task.judgingTemplate.code}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-mono text-zinc-500 truncate max-w-[180px]">
            /judging/{task.routeSlug}
          </span>
          <button onClick={handleCopy} title="Salin URL" className="p-0.5 rounded hover:bg-zinc-200 shrink-0">
            {copied
              ? <Check className="h-3.5 w-3.5 text-green-500" />
              : <Copy className="h-3.5 w-3.5 text-zinc-400" />
            }
          </button>
          <Link href={`/judging/${task.routeSlug}`} target="_blank" className="p-0.5 rounded hover:bg-zinc-200 shrink-0">
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </Link>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {showPass ? (
            <button
              onClick={handleCopyPass}
              title="Salin passcode"
              className="font-mono font-bold tracking-widest text-sm text-violet-700 hover:text-violet-500 transition-colors cursor-pointer"
            >
              {copiedPass ? <span className="text-green-600">Disalin!</span> : task.passcode}
            </button>
          ) : (
            <span className="font-mono font-bold tracking-widest text-sm text-zinc-400">••••••</span>
          )}
          <button onClick={() => setShowPass(v => !v)} className="p-0.5 rounded hover:bg-zinc-100 shrink-0">
            {showPass ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full",
            task.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400"
          )}>
            {task.status}
          </span>
          {task.completedAt && (
            <span
              title={`Diumumkan selesai oleh hakim pada ${fmtWhen(task.completedAt)}`}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
            >
              <Lock className="h-2.5 w-2.5" /> SELESAI
            </span>
          )}
        </div>
      </td>
      {canWrite && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            {task.completedAt && isSuperAdmin && (
              <button
                onClick={reopenTask}
                disabled={reopening}
                title="Buka semula borang tugas ini"
                className="text-[11px] text-amber-600 hover:text-amber-800 font-medium whitespace-nowrap flex items-center gap-1"
              >
                {reopening ? <Loader2 className="h-3 w-3 animate-spin" /> : <LockOpen className="h-3 w-3" />}
                Buka semula
              </button>
            )}
            <button
              onClick={toggleStatus}
              disabled={toggling}
              className="text-[11px] text-zinc-400 hover:text-zinc-700 font-medium whitespace-nowrap flex items-center gap-1"
            >
              {toggling && <Loader2 className="h-3 w-3 animate-spin" />}
              {task.status === "ACTIVE" ? "Tutup" : "Buka"}
            </button>
            <button onClick={handleDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50">
              {deleting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                : <Trash2 className="h-3.5 w-3.5 text-red-400" />
              }
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// ── CompetitionCard ────────────────────────────────────────────────────────────

function CompetitionCard({
  ec, isExpanded, event, canWrite: canWriteRole, isSuperAdmin,
  onToggle, onCreateTask, onTaskDeleted, onStatusChange, onJudgingChanged, onTaskReopened,
}: {
  ec: CompetitionBlock;
  isExpanded: boolean;
  event: EventInfo;
  canWrite: boolean;
  isSuperAdmin: boolean;
  onToggle: (id: string) => void;
  onCreateTask: (ecId: string, template: TemplateSummary) => void;
  onTaskDeleted: (ecId: string, taskId: string) => void;
  onStatusChange: (ecId: string, taskId: string, status: "ACTIVE" | "CLOSED") => void;
  onJudgingChanged: (ecId: string, judging: JudgingState) => void;
  onTaskReopened: (ecId: string, taskId: string) => void;
}) {
  // Tasks are frozen once judging is announced complete (the API refuses too).
  const locked   = ec.judgingStatus !== "OPEN";
  const canWrite = canWriteRole && !locked;
  const chip     = STATUS_CHIP[ec.judgingStatus] ?? STATUS_CHIP.OPEN;
  const tasksByTemplate = ec.judgingTemplates.map(at => ({
    template: at.judgingTemplate,
    tasks: ec.judgingTasks.filter(t => t.judgingTemplate.id === at.judgingTemplate.id),
  }));

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => onToggle(ec.id)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-800 flex items-center gap-2">
            <span>
              <span className="font-mono text-zinc-400 mr-1.5">{ec.competition.code}</span>
              {ec.competition.name}
            </span>
            {locked && (
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", chip.cls)}>{chip.label}</span>
            )}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {ec.competition.participationType}
            {" · "}{ec.judgingTemplates.length} template · {ec.judgingTasks.length} tugas
          </p>
        </div>
        {isExpanded
          ? <ChevronDown  className="h-4 w-4 text-zinc-400 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
        }
      </button>

      {isExpanded && (
        <div className="border-t divide-y">
          {ec.judgingTemplates.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-zinc-400">
              Tiada template penghakiman ditetapkan.{" "}
              <Link href="/organizer/events" className="text-violet-500 hover:underline">
                Tetapkan template
              </Link>
            </div>
          ) : (
            tasksByTemplate.map(({ template, tasks }) => (
              <div key={template.id}>
                <div className="flex items-center justify-between px-5 py-3 bg-zinc-50/70 border-b">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-sm font-medium text-violet-700">{template.name}</span>
                    <span className="text-[10px] bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded font-mono">
                      {template.code}
                    </span>
                    <span className="text-[10px] text-zinc-400">{template._count.criterions} kriteria</span>
                  </div>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50"
                      onClick={() => onCreateTask(ec.id, template)}
                    >
                      <Plus className="h-3 w-3" /> Cipta Tugas
                    </Button>
                  )}
                </div>

                {tasks.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-zinc-400 italic">Tiada tugas penghakiman lagi.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-zinc-50/40">
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-40">Label</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-32">Template</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">URL</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-36">Passcode</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-24">Status</th>
                          {canWrite && <th className="px-4 py-2 w-28" />}
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            ecId={ec.id}
                            eventId={event.id}
                            canWrite={canWrite}
                            isSuperAdmin={isSuperAdmin}
                            onDelete={id => onTaskDeleted(ec.id, id)}
                            onStatusChange={(id, status) => onStatusChange(ec.id, id, status)}
                            onReopened={id => onTaskReopened(ec.id, id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Announce completeness / verify / reopen */}
          {ec.judgingTemplates.length > 0 && (
            <JudgingStatusPanel
              ec={ec}
              eventId={event.id}
              canWrite={canWriteRole}
              isSuperAdmin={isSuperAdmin}
              onChanged={onJudgingChanged}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EventJudgingClient({
  event, competitions: initialCompetitions, canWrite, isSuperAdmin = false,
}: {
  event: EventInfo;
  competitions: CompetitionBlock[];
  canWrite: boolean;
  isSuperAdmin?: boolean;
}) {
  const [competitions, setCompetitions] = useState(initialCompetitions);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set(initialCompetitions.map(c => c.id)));
  const [filter,       setFilter]       = useState("");

  // Live status: re-read every competition's judging status and progress every
  // STATUS_POLL_MS, so judges' "Penghakiman Selesai", the automatic completion
  // and new scores appear without a reload. Skipped while the tab is hidden,
  // and never overlapping a request still in flight.
  useEffect(() => {
    let inFlight = false;
    const tick = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/v2/organizer/events/${event.id}/judging-progress`, { cache: "no-store" });
        if (!res.ok) return;
        const { competitions: live } = await res.json() as { competitions: EventJudgingProgress };
        const byEc = new Map(live.map(p => [p.id, p]));
        setCompetitions(prev => prev.map(ec => {
          const p = byEc.get(ec.id);
          if (!p) return ec;
          const byTask = new Map(p.tasks.map(t => [t.id, t]));
          return {
            ...ec,
            judgingStatus:      p.judgingStatus,
            judgingCompletedAt: p.judgingCompletedAt,
            judgingCompletedBy: p.judgingCompletedBy,
            judgingVerifiedAt:  p.judgingVerifiedAt,
            judgingVerifiedBy:  p.judgingVerifiedBy,
            teamCount:          p.teamCount,
            judgingTasks: ec.judgingTasks.map(t => {
              const lt = byTask.get(t.id);
              return lt ? { ...t, status: lt.status, completedAt: lt.completedAt, judgedTeams: lt.judgedTeams } : t;
            }),
          };
        }));
      } catch { /* transient — next tick retries */ }
      finally { inFlight = false; }
    };
    const t = setInterval(tick, STATUS_POLL_MS);
    return () => clearInterval(t);
  }, [event.id]);

  const [createFor, setCreateFor] = useState<{ ecId: string; template: TemplateSummary } | null>(null);
  const [taskLabel, setTaskLabel] = useState("");
  const [creating,  setCreating]  = useState(false);
  const [createErr, setCreateErr] = useState("");

  function toggleExpand(ecId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ecId)) { next.delete(ecId); } else { next.add(ecId); }
      return next;
    });
  }

  async function handleCreateTask() {
    if (!createFor) return;
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/competitions/${createFor.ecId}/judging-tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ judgingTemplateId: createFor.template.id, label: taskLabel }),
        }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal");
      setCompetitions(prev => prev.map(ec =>
        ec.id === createFor.ecId
          ? { ...ec, judgingTasks: [...ec.judgingTasks, j.task] }
          : ec
      ));
      setCreateFor(null); setTaskLabel("");
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Gagal");
    } finally { setCreating(false); }
  }

  function handleTaskDeleted(ecId: string, taskId: string) {
    setCompetitions(prev => prev.map(ec =>
      ec.id === ecId ? { ...ec, judgingTasks: ec.judgingTasks.filter(t => t.id !== taskId) } : ec
    ));
  }

  function handleStatusChange(ecId: string, taskId: string, status: "ACTIVE" | "CLOSED") {
    setCompetitions(prev => prev.map(ec =>
      ec.id === ecId
        ? { ...ec, judgingTasks: ec.judgingTasks.map(t => t.id === taskId ? { ...t, status } : t) }
        : ec
    ));
  }

  // Competition filter (code or name): plain text matches anywhere; with * or ?
  // it is a wildcard pattern over the whole code or name, e.g. "3.*", "*Dron*", "?.1R".
  const matchesFilter = competitionFilter(filter);
  const visible = competitions.filter(ec => matchesFilter(ec.competition.code) || matchesFilter(ec.competition.name));

  // Build groups
  const grouped = new Map<SchoolLevel, CompetitionBlock[]>();
  const ungrouped: CompetitionBlock[] = [];
  for (const ec of visible) {
    const levels = getSchoolLevels(ec);
    if (levels.length === 0) {
      ungrouped.push(ec);
    } else {
      for (const lvl of levels) {
        if (!grouped.has(lvl)) grouped.set(lvl, []);
        grouped.get(lvl)!.push(ec);
      }
    }
  }
  const orderedLevels = LEVEL_ORDER.filter(l => grouped.has(l));

  const byCode = (a: CompetitionBlock, b: CompetitionBlock) =>
    a.competition.code.localeCompare(b.competition.code);
  grouped.forEach(list => list.sort(byCode));
  ungrouped.sort(byCode);

  function handleJudgingChanged(ecId: string, judging: JudgingState) {
    setCompetitions(prev => prev.map(ec => ec.id !== ecId ? ec : {
      ...ec, ...judging,
      // Reopening the competition also reopens the judges' task announcements.
      ...(judging.judgingStatus === "OPEN" && { judgingTasks: ec.judgingTasks.map(t => ({ ...t, completedAt: null })) }),
    }));
  }

  function handleTaskReopened(ecId: string, taskId: string) {
    setCompetitions(prev => prev.map(ec => ec.id !== ecId ? ec : {
      ...ec, judgingTasks: ec.judgingTasks.map(t => t.id === taskId ? { ...t, completedAt: null } : t),
    }));
  }

  const cardProps = {
    event, canWrite, isSuperAdmin,
    onJudgingChanged: handleJudgingChanged,
    onTaskReopened: handleTaskReopened,
    onToggle: toggleExpand,
    onCreateTask: (ecId: string, template: TemplateSummary) => {
      setCreateFor({ ecId, template }); setTaskLabel(""); setCreateErr("");
    },
    onTaskDeleted: handleTaskDeleted,
    onStatusChange: handleStatusChange,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/organizer/events/${event.slug}/manage`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-amber-500" />
            <h1 className="text-xl font-bold text-zinc-900">Penghakiman</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">{event.name}</p>
        </div>
      </div>

      {/* Wildcard filter on competition code / name */}
      {competitions.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-56 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Tapis kod atau nama pertandingan… (cth. 3.*, *Dron*, ?.1R)"
              title="Teks biasa sepadan di mana-mana. * = sebarang aksara, ? = satu aksara."
              className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            {filter && (
              <button onClick={() => setFilter("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600" title="Kosongkan">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {filter && (
            <span className="text-xs text-zinc-500">{visible.length} / {competitions.length} pertandingan</span>
          )}
        </div>
      )}

      {competitions.length > 0 && visible.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-400">Tiada pertandingan sepadan dengan &ldquo;{filter}&rdquo;.</p>
      )}

      {competitions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
          <Gavel className="h-8 w-8 text-zinc-200" />
          <p className="text-sm">Tiada pertandingan dihubungkan ke acara ini.</p>
          <Link href="/organizer/events" className="text-xs text-violet-500 hover:underline">
            Pergi ke tetapan acara
          </Link>
        </div>
      )}

      {/* Grouped sections */}
      <div className="space-y-8">
        {orderedLevels.map(level => (
          <div key={level}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${LEVEL_COLOR[level]}`}>
                {LEVEL_LABEL[level]}
              </span>
              <div className="flex-1 h-px bg-zinc-100" />
            </div>
            <div className="space-y-4">
              {grouped.get(level)!.map(ec => (
                <CompetitionCard
                  key={ec.id}
                  ec={ec}
                  isExpanded={expanded.has(ec.id)}
                  {...cardProps}
                />
              ))}
            </div>
          </div>
        ))}

        {ungrouped.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold px-3 py-1 rounded-full border bg-zinc-100 text-zinc-500 border-zinc-200">
                LAIN-LAIN
              </span>
              <div className="flex-1 h-px bg-zinc-100" />
            </div>
            <div className="space-y-4">
              {ungrouped.map(ec => (
                <CompetitionCard
                  key={ec.id}
                  ec={ec}
                  isExpanded={expanded.has(ec.id)}
                  {...cardProps}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create task dialog */}
      <Dialog open={!!createFor} onOpenChange={open => { if (!open) setCreateFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <Gavel className="h-4 w-4" /> Cipta Tugas Penghakiman
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 px-4">
            <div className="rounded-md bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-700">
              Template: <span className="font-semibold">{createFor?.template.name}</span>
            </div>
            <div>
              <Label className="text-xs">Label (pilihan)</Label>
              <Input
                value={taskLabel}
                onChange={e => setTaskLabel(e.target.value)}
                placeholder="cth. Pusingan 1, Separuh Akhir…"
                className="mt-1 h-8 text-sm"
                onKeyDown={e => e.key === "Enter" && handleCreateTask()}
              />
              <p className="text-[10px] text-zinc-400 mt-1">URL unik dan passcode akan dijana secara automatik.</p>
            </div>
            {createErr && <p className="text-xs text-red-500">{createErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFor(null)} disabled={creating}>Batal</Button>
            <Button onClick={handleCreateTask} disabled={creating} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
              Jana Tugas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
