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
  id: string; // ecId
  competitionId: string;
  competition: { id: string; name: string; code: string; participationType: string };
  judgingTemplates: AssignedTemplate[];
  judgingTasks: TaskItem[];
};

type EventInfo = { id: string; name: string; slug: string; scope: string };

// ── TaskCard ───────────────────────────────────────────────────────────────────

function TaskCard({
  task, ecId, eventId, canWrite,
  onDelete, onStatusChange,
}: {
  task: TaskItem;
  ecId: string;
  eventId: string;
  canWrite: boolean;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: "ACTIVE" | "CLOSED") => void;
}) {
  const [showPass, setShowPass]   = useState(false);
  const [copied,   setCopied]     = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [toggling, setToggling]   = useState(false);

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
    <div className={cn(
      "rounded-lg border bg-white p-4 space-y-3",
      task.status === "CLOSED" && "opacity-60"
    )}>
      {/* Top row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {task.label && <p className="text-xs font-semibold text-zinc-700">{task.label}</p>}
          <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
            Template: {task.judgingTemplate.code}
          </p>
        </div>
        <span className={cn(
          "text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0",
          task.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400"
        )}>
          {task.status}
        </span>
      </div>

      {/* URL row */}
      <div className="flex items-center gap-2 rounded-md bg-zinc-50 border px-3 py-2">
        <span className="text-xs text-zinc-500 font-mono flex-1 truncate">/judging/{task.routeSlug}</span>
        <button onClick={handleCopy} title="Salin URL" className="shrink-0 p-0.5 rounded hover:bg-zinc-200">
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
        </button>
        <Link href={`/judging/${task.routeSlug}`} target="_blank" className="shrink-0 p-0.5 rounded hover:bg-zinc-200">
          <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
        </Link>
      </div>

      {/* Passcode row */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-20 shrink-0">Passcode:</span>
        <span className={cn("text-sm font-mono font-bold tracking-widest flex-1", task.status === "ACTIVE" ? "text-violet-700" : "text-zinc-400")}>
          {showPass ? task.passcode : "••••••"}
        </span>
        <button onClick={() => setShowPass(v => !v)} className="p-0.5 rounded hover:bg-zinc-100">
          {showPass ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
        </button>
      </div>

      {/* Actions */}
      {canWrite && (
        <div className="flex items-center gap-2 pt-1 border-t">
          <button
            onClick={toggleStatus}
            disabled={toggling}
            className="text-xs text-zinc-500 hover:text-zinc-800 font-medium flex items-center gap-1"
          >
            {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {task.status === "ACTIVE" ? "Tutup tugas" : "Buka semula"}
          </button>
          <div className="flex-1" />
          <button onClick={handleDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-400" />}
          </button>
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

  // Create task dialog
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
          <Link href={`/organizer/events`} className="text-xs text-violet-500 hover:underline">
            Pergi ke tetapan acara
          </Link>
        </div>
      )}

      {/* Competitions */}
      <div className="space-y-4">
        {competitions.map(ec => {
          const isExpanded = expanded.has(ec.id);
          const tasksByTemplate = ec.judgingTemplates.map(at => ({
            template: at.judgingTemplate,
            tasks: ec.judgingTasks.filter(t => t.judgingTemplate.id === at.judgingTemplate.id),
          }));

          return (
            <div key={ec.id} className="rounded-xl border bg-white shadow-sm overflow-hidden">
              {/* Competition header */}
              <button
                onClick={() => toggleExpand(ec.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-800">{ec.competition.name}</p>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">
                    {ec.competition.code} · {ec.competition.participationType}
                    {" · "}{ec.judgingTemplates.length} template · {ec.judgingTasks.length} tugas
                  </p>
                </div>
                {isExpanded ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />}
              </button>

              {isExpanded && (
                <div className="border-t divide-y">
                  {ec.judgingTemplates.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-zinc-400">
                      Tiada template penghakiman ditetapkan.{" "}
                      <Link href={`/organizer/events`} className="text-violet-500 hover:underline">Tetapkan template</Link>
                    </div>
                  ) : (
                    tasksByTemplate.map(({ template, tasks }) => (
                      <div key={template.id} className="px-5 py-4 space-y-3">
                        {/* Template header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Tag className="h-3.5 w-3.5 text-violet-400" />
                            <span className="text-sm font-medium text-violet-700">{template.name}</span>
                            <span className="text-[10px] bg-violet-50 text-violet-500 px-1.5 py-0.5 rounded font-mono">
                              {template.code}
                            </span>
                            <span className="text-[10px] text-zinc-400">{template._count.criterions} kriteria</span>
                          </div>
                          {canWrite && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50"
                              onClick={() => { setCreateFor({ ecId: ec.id, template }); setTaskLabel(""); setCreateErr(""); }}
                            >
                              <Plus className="h-3 w-3" /> Cipta Tugas
                            </Button>
                          )}
                        </div>

                        {/* Task cards */}
                        {tasks.length === 0 ? (
                          <p className="text-xs text-zinc-400 italic pl-5">Tiada tugas penghakiman lagi.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5">
                            {tasks.map(task => (
                              <TaskCard
                                key={task.id}
                                task={task}

                                ecId={ec.id}
                                eventId={event.id}
                                canWrite={canWrite}
                                onDelete={id => handleTaskDeleted(ec.id, id)}
                                onStatusChange={(id, status) => handleStatusChange(ec.id, id, status)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
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
