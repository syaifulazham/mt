"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Gavel, Plus, Trash2, Loader2, Copy, Check,
  Eye, EyeOff, ChevronDown, ChevronRight, Tag, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type TemplateSummary = {
  id: string; name: string; code: string; description: string | null;
  _count: { criterions: number };
};

type TaskItem = {
  id: string; label: string | null; routeSlug: string; passcode: string;
  status: "ACTIVE" | "CLOSED";
  judgingTemplate: { id: string; name: string; code: string };
};

type AssignedTemplate = {
  judgingTemplate: TemplateSummary;
};

type CompetitionBlock = {
  id: string;
  competitionId: string;
  competition: {
    id: string; name: string; code: string; participationType: string;
    targetGroups: { targetGroup: { schoolLevel: string } }[];
  };
  judgingTemplates: AssignedTemplate[];
  judgingTasks: TaskItem[];
};

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
  task, ecId, eventId, canWrite, onDelete, onStatusChange,
}: {
  task: TaskItem;
  ecId: string;
  eventId: string;
  canWrite: boolean;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: "ACTIVE" | "CLOSED") => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const judgeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/judging/${task.routeSlug}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(judgeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <span className={cn(
            "font-mono font-bold tracking-widest text-sm",
            task.status === "ACTIVE" ? "text-violet-700" : "text-zinc-400"
          )}>
            {showPass ? task.passcode : "••••••"}
          </span>
          <button onClick={() => setShowPass(v => !v)} className="p-0.5 rounded hover:bg-zinc-100 shrink-0">
            {showPass ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-full",
          task.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400"
        )}>
          {task.status}
        </span>
      </td>
      {canWrite && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
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
  ec, isExpanded, event, canWrite,
  onToggle, onCreateTask, onTaskDeleted, onStatusChange,
}: {
  ec: CompetitionBlock;
  isExpanded: boolean;
  event: EventInfo;
  canWrite: boolean;
  onToggle: (id: string) => void;
  onCreateTask: (ecId: string, template: TemplateSummary) => void;
  onTaskDeleted: (ecId: string, taskId: string) => void;
  onStatusChange: (ecId: string, taskId: string, status: "ACTIVE" | "CLOSED") => void;
}) {
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
          <p className="font-semibold text-zinc-800">
            <span className="font-mono text-zinc-400 mr-1.5">{ec.competition.code}</span>
            {ec.competition.name}
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
                            onDelete={id => onTaskDeleted(ec.id, id)}
                            onStatusChange={(id, status) => onStatusChange(ec.id, id, status)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EventJudgingClient({
  event, competitions: initialCompetitions, canWrite,
}: {
  event: EventInfo;
  competitions: CompetitionBlock[];
  canWrite: boolean;
}) {
  const [competitions, setCompetitions] = useState(initialCompetitions);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set(initialCompetitions.map(c => c.id)));

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

  // Build groups
  const grouped = new Map<SchoolLevel, CompetitionBlock[]>();
  const ungrouped: CompetitionBlock[] = [];
  for (const ec of competitions) {
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

  const cardProps = {
    event, canWrite,
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
          <div className="space-y-4 py-2">
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
