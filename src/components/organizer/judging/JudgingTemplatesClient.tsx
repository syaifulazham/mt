"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Save, Loader2, ChevronUp, ChevronDown,
  Hash, Timer, ToggleLeft, CheckSquare, X, GripVertical,
  Sparkles, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { OrganizerRole } from "@/types";

function genConfirmCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Types ──────────────────────────────────────────────────────────────────────

type CriterionType = "NUMBER" | "TIME" | "SINGLE_OPTION" | "MULTIPLE_OPTION";

type JudgingOption = {
  id: string;
  label: string;
  weight: number;
  order: number;
};

type JudgingCriterion = {
  id: string;
  name: string;
  order: number;
  type: CriterionType;
  maxScore: number | null;
  minScore: number | null;
  maxTime: number | null;
  options: JudgingOption[];
};

type TemplateListItem = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  _count: { criterions: number };
};

type TemplateDetail = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  criterions: JudgingCriterion[];
};

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const TYPE_META: Record<CriterionType, { label: string; icon: React.ElementType; color: string }> = {
  NUMBER:          { label: "Number",          icon: Hash,        color: "bg-blue-50 text-blue-700 border-blue-200" },
  TIME:            { label: "Time",            icon: Timer,       color: "bg-amber-50 text-amber-700 border-amber-200" },
  SINGLE_OPTION:   { label: "Single Option",   icon: ToggleLeft,  color: "bg-violet-50 text-violet-700 border-violet-200" },
  MULTIPLE_OPTION: { label: "Multiple Option", icon: CheckSquare, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTime(val: string): number {
  const [m, s] = val.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

// ── Criterion card ─────────────────────────────────────────────────────────────

function CriterionCard({
  criterion, templateId, canWrite, isFirst, isLast,
  onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  criterion: JudgingCriterion;
  templateId: string;
  canWrite: boolean;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (c: JudgingCriterion) => void;
  onDelete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [name,     setName]     = useState(criterion.name);
  const [type,     setType]     = useState<CriterionType>(criterion.type);
  const [maxScore, setMaxScore] = useState(String(criterion.maxScore ?? ""));
  const [minScore, setMinScore] = useState(String(criterion.minScore ?? ""));
  const [maxTime,  setMaxTime]  = useState(criterion.maxTime ? fmtTime(criterion.maxTime) : "");
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);

  // Option editing
  const [options,   setOptions]   = useState<JudgingOption[]>(criterion.options);
  const [newLabel,  setNewLabel]  = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [addingOpt, setAddingOpt] = useState(false);

  const meta = TYPE_META[type];
  const Icon = meta.icon;

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v2/organizer/judging/templates/${templateId}/criterions/${criterion.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            type,
            maxScore: maxScore !== "" ? Number(maxScore) : null,
            minScore: minScore !== "" ? Number(minScore) : null,
            maxTime:  maxTime  !== "" ? parseTime(maxTime) : null,
          }),
        }
      );
      const j = await res.json();
      if (res.ok) { onUpdate({ ...j.criterion, options }); setDirty(false); }
    } finally { setSaving(false); }
  }

  async function addOption() {
    if (!newLabel.trim()) return;
    setAddingOpt(true);
    try {
      const res = await fetch(
        `/api/v2/organizer/judging/templates/${templateId}/criterions/${criterion.id}/options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: newLabel.trim(), weight: Number(newWeight) || 0 }),
        }
      );
      const j = await res.json();
      if (res.ok) {
        const updated = [...options, j.option];
        setOptions(updated);
        onUpdate({ ...criterion, name, type, options: updated });
        setNewLabel(""); setNewWeight("");
      }
    } finally { setAddingOpt(false); }
  }

  async function updateOption(opt: JudgingOption, label: string, weight: number) {
    const res = await fetch(
      `/api/v2/organizer/judging/templates/${templateId}/criterions/${criterion.id}/options/${opt.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, weight }),
      }
    );
    if (res.ok) {
      const updated = options.map(o => o.id === opt.id ? { ...o, label, weight } : o);
      setOptions(updated);
      onUpdate({ ...criterion, name, type, options: updated });
    }
  }

  async function deleteOption(optId: string) {
    const res = await fetch(
      `/api/v2/organizer/judging/templates/${templateId}/criterions/${criterion.id}/options/${optId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const updated = options.filter(o => o.id !== optId);
      setOptions(updated);
      onUpdate({ ...criterion, name, type, options: updated });
    }
  }

  async function deleteSelf() {
    if (!confirm(`Padam kriteria "${criterion.name}"?`)) return;
    const res = await fetch(
      `/api/v2/organizer/judging/templates/${templateId}/criterions/${criterion.id}`,
      { method: "DELETE" }
    );
    if (res.ok) onDelete(criterion.id);
  }

  const hasOptions = type === "SINGLE_OPTION" || type === "MULTIPLE_OPTION";
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);

  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 border-b">
        <GripVertical className="h-4 w-4 text-zinc-300 shrink-0" />
        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1", meta.color)}>
          <Icon className="h-3 w-3" />{meta.label}
        </span>
        <span className="text-sm font-medium flex-1 truncate">{name || <span className="text-zinc-300 italic">Tanpa nama</span>}</span>
        {canWrite && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onMoveUp}   disabled={isFirst} className="p-1 rounded hover:bg-zinc-200 disabled:opacity-30"><ChevronUp   className="h-3.5 w-3.5 text-zinc-500" /></button>
            <button onClick={onMoveDown} disabled={isLast}  className="p-1 rounded hover:bg-zinc-200 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5 text-zinc-500" /></button>
            <button onClick={deleteSelf} className="p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
          </div>
        )}
        <button onClick={() => setExpanded(v => !v)} className="p-1 rounded hover:bg-zinc-200 ml-1">
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />}
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nama Kriteria</Label>
              <Input
                value={name}
                onChange={e => { setName(e.target.value); setDirty(true); }}
                className="mt-1 h-8 text-sm"
                disabled={!canWrite}
              />
            </div>
            <div>
              <Label className="text-xs">Jenis</Label>
              <select
                value={type}
                onChange={e => { setType(e.target.value as CriterionType); setDirty(true); }}
                disabled={!canWrite}
                className="mt-1 w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(TYPE_META) as CriterionType[]).map(t => (
                  <option key={t} value={t}>{TYPE_META[t].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Type-specific config */}
          {type === "NUMBER" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Skor Minimum</Label>
                <Input type="number" value={minScore} onChange={e => { setMinScore(e.target.value); setDirty(true); }} className="mt-1 h-8 text-sm" disabled={!canWrite} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Skor Maksimum</Label>
                <Input type="number" value={maxScore} onChange={e => { setMaxScore(e.target.value); setDirty(true); }} className="mt-1 h-8 text-sm" disabled={!canWrite} placeholder="100" />
              </div>
            </div>
          )}

          {type === "TIME" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Masa Maksimum (mm:ss)</Label>
                <Input
                  value={maxTime}
                  onChange={e => { setMaxTime(e.target.value); setDirty(true); }}
                  placeholder="e.g. 3:00"
                  className="mt-1 h-8 text-sm font-mono"
                  disabled={!canWrite}
                />
                <p className="text-[10px] text-zinc-400 mt-1">Skor berkurang dari maks ke 0 apabila masa tamat.</p>
              </div>
              <div>
                <Label className="text-xs">Skor Maksimum</Label>
                <Input type="number" value={maxScore} onChange={e => { setMaxScore(e.target.value); setDirty(true); }} className="mt-1 h-8 text-sm" disabled={!canWrite} placeholder="100" />
              </div>
            </div>
          )}

          {hasOptions && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Pilihan</Label>
                {type === "MULTIPLE_OPTION" && options.length > 0 && (
                  <span className="text-[10px] text-zinc-400">Jumlah maks: <strong>{totalWeight}</strong> pts</span>
                )}
                {type === "SINGLE_OPTION" && options.length > 0 && (
                  <span className="text-[10px] text-zinc-400">{options.length} pilihan (pilih satu)</span>
                )}
              </div>

              {/* Option rows */}
              <div className="space-y-1.5">
                {options.map(opt => (
                  <OptionRow
                    key={opt.id}
                    opt={opt}
                    canWrite={canWrite}
                    onSave={(label, weight) => updateOption(opt, label, weight)}
                    onDelete={() => deleteOption(opt.id)}
                  />
                ))}
              </div>

              {/* Add option */}
              {canWrite && (
                <div className="flex gap-2 items-center mt-2">
                  <Input
                    placeholder="Label pilihan"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addOption()}
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="pts"
                    value={newWeight}
                    onChange={e => setNewWeight(e.target.value)}
                    className="h-7 text-xs w-20 font-mono"
                  />
                  <Button size="sm" onClick={addOption} disabled={addingOpt || !newLabel.trim()} className="h-7 text-xs px-3">
                    {addingOpt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </Button>
                </div>
              )}
            </div>
          )}

          {canWrite && dirty && (
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={saveConfig} disabled={saving} className="h-7 text-xs gap-1.5">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Simpan
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Option row ─────────────────────────────────────────────────────────────────

function OptionRow({
  opt, canWrite, onSave, onDelete,
}: {
  opt: JudgingOption;
  canWrite: boolean;
  onSave: (label: string, weight: number) => void;
  onDelete: () => void;
}) {
  const [label,  setLabel]  = useState(opt.label);
  const [weight, setWeight] = useState(String(opt.weight));
  const [dirty,  setDirty]  = useState(false);

  return (
    <div className="flex items-center gap-2 bg-zinc-50 rounded px-2 py-1.5 group">
      <div className="w-2 h-2 rounded-full bg-zinc-300 shrink-0" />
      <Input
        value={label}
        onChange={e => { setLabel(e.target.value); setDirty(true); }}
        onBlur={() => dirty && onSave(label, Number(weight))}
        className="h-6 text-xs flex-1 border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        disabled={!canWrite}
      />
      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="number"
          value={weight}
          onChange={e => { setWeight(e.target.value); setDirty(true); }}
          onBlur={() => dirty && onSave(label, Number(weight))}
          className="h-6 w-16 text-xs font-mono text-center border-zinc-200"
          disabled={!canWrite}
        />
        <span className="text-[10px] text-zinc-400">pts</span>
        {canWrite && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 transition-opacity"
          >
            <X className="h-3 w-3 text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function JudgingTemplatesClient({ role }: { role: OrganizerRole }) {
  const canWrite = WRITE_ROLES.includes(role);

  const [templates,   setTemplates]   = useState<TemplateListItem[]>([]);
  const [selected,    setSelected]    = useState<TemplateDetail | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New template form
  const [newOpen,  setNewOpen]  = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newCode,  setNewCode]  = useState("");
  const [newDesc,  setNewDesc]  = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // Template header editing
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [headerDirty, setHeaderDirty] = useState(false);
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerErr, setHeaderErr] = useState("");

  // Delete template confirmation dialog
  const [deleteTarget,    setDeleteTarget]    = useState<TemplateListItem | null>(null);
  const [deleteCode,      setDeleteCode]      = useState("");
  const [deleteConfirm,   setDeleteConfirm]   = useState("");
  const [deleting,        setDeleting]        = useState(false);

  function openDeleteDialog(t: TemplateListItem) {
    setDeleteTarget(t);
    setDeleteCode(genConfirmCode());
    setDeleteConfirm("");
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    setDeleteCode("");
    setDeleteConfirm("");
    setDeleting(false);
  }

  async function confirmDeleteTemplate() {
    if (!deleteTarget || deleteConfirm !== deleteCode) return;
    setDeleting(true);
    try {
      await fetch(`/api/v2/organizer/judging/templates/${deleteTarget.id}`, { method: "DELETE" });
      if (selected?.id === deleteTarget.id) setSelected(null);
      await load();
      closeDeleteDialog();
    } finally {
      setDeleting(false);
    }
  }

  // AI generate dialog
  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiPrompt,  setAiPrompt]  = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiErr,     setAiErr]     = useState("");

  async function runAiGenerate() {
    if (!aiPrompt.trim()) return;
    setAiRunning(true); setAiErr("");
    try {
      const res = await fetch("/api/v2/organizer/judging/templates/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Ralat AI");
      setTemplates(prev => [...prev, j.template].sort((a, b) => a.name.localeCompare(b.name)));
      setAiOpen(false); setAiPrompt("");
      selectTemplate(j.template);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Ralat tidak diketahui");
    } finally {
      setAiRunning(false);
    }
  }

  // Replicate template
  const [replicating, setReplicating] = useState<string | null>(null);

  async function replicateTemplate(t: TemplateListItem) {
    setReplicating(t.id);
    try {
      const res = await fetch(`/api/v2/organizer/judging/templates/${t.id}/replicate`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setTemplates(prev => [...prev, j.template].sort((a, b) => a.name.localeCompare(b.name)));
      selectTemplate(j.template);
    } finally {
      setReplicating(null);
    }
  }

  // Adding criterion
  const [addingCriterion, setAddingCriterion] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v2/organizer/judging/templates");
    const j   = await res.json();
    setTemplates(j.templates ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function selectTemplate(t: TemplateListItem) {
    setLoadingDetail(true);
    const res = await fetch(`/api/v2/organizer/judging/templates/${t.id}`);
    const j   = await res.json();
    setSelected(j.template);
    setEditName(j.template.name);
    setEditCode(j.template.code);
    setEditDesc(j.template.description ?? "");
    setHeaderDirty(false);
    setHeaderErr("");
    setLoadingDetail(false);
  }

  async function createTemplate() {
    if (!newName.trim() || !newCode.trim()) return;
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch("/api/v2/organizer/judging/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, code: newCode, description: newDesc }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error === "CODE_TAKEN" ? "Kod sudah digunakan." : j.error);
      setNewOpen(false); setNewName(""); setNewCode(""); setNewDesc("");
      await load();
      await selectTemplate(j.template);
    } catch (e) { setCreateErr(String(e instanceof Error ? e.message : e)); }
    finally { setCreating(false); }
  }

  async function saveHeader() {
    if (!selected) return;
    setHeaderSaving(true); setHeaderErr("");
    try {
      const res = await fetch(`/api/v2/organizer/judging/templates/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, code: editCode, description: editDesc }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error === "CODE_TAKEN" ? "Kod sudah digunakan." : j.error);
      setSelected(s => s ? { ...s, name: j.template.name, code: j.template.code, description: j.template.description } : s);
      setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, name: j.template.name, code: j.template.code } : t));
      setHeaderDirty(false);
    } catch (e) { setHeaderErr(String(e instanceof Error ? e.message : e)); }
    finally { setHeaderSaving(false); }
  }


  async function addCriterion() {
    if (!selected) return;
    setAddingCriterion(true);
    try {
      const res = await fetch(
        `/api/v2/organizer/judging/templates/${selected.id}/criterions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Kriteria Baharu", type: "NUMBER", maxScore: 100, minScore: 0 }),
        }
      );
      const j = await res.json();
      if (res.ok) {
        setSelected(s => s ? { ...s, criterions: [...s.criterions, j.criterion] } : s);
        setTemplates(prev => prev.map(t =>
          t.id === selected.id ? { ...t, _count: { criterions: t._count.criterions + 1 } } : t
        ));
      }
    } finally { setAddingCriterion(false); }
  }

  function updateCriterion(updated: JudgingCriterion) {
    setSelected(s => s
      ? { ...s, criterions: s.criterions.map(c => c.id === updated.id ? updated : c) }
      : s
    );
  }

  function deleteCriterion(id: string) {
    setSelected(s => s ? { ...s, criterions: s.criterions.filter(c => c.id !== id) } : s);
    setTemplates(prev => prev.map(t =>
      t.id === selected?.id ? { ...t, _count: { criterions: t._count.criterions - 1 } } : t
    ));
  }

  async function moveCriterion(idx: number, dir: -1 | 1) {
    if (!selected) return;
    const criterions = [...selected.criterions];
    const target = idx + dir;
    if (target < 0 || target >= criterions.length) return;

    // Swap orders
    const a = { ...criterions[idx] };
    const b = { ...criterions[target] };
    [a.order, b.order] = [b.order, a.order];
    criterions[idx] = b;
    criterions[target] = a;
    setSelected(s => s ? { ...s, criterions } : s);

    // Persist both
    await Promise.all([
      fetch(`/api/v2/organizer/judging/templates/${selected.id}/criterions/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: a.order }),
      }),
      fetch(`/api/v2/organizer/judging/templates/${selected.id}/criterions/${b.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: b.order }),
      }),
    ]);
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: Template list ─────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r bg-white">
        <div className="px-4 py-3 border-b flex items-center gap-1.5">
          <span className="text-sm font-semibold flex-1">Judging Templates</span>
          {canWrite && (
            <>
              <button
                onClick={() => { setAiOpen(true); setNewOpen(false); }}
                title="Jana dengan AI"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-violet-100 text-violet-500"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setNewOpen(v => !v); setAiOpen(false); }}
                title="Template baharu"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {/* New template form */}
        {newOpen && (
          <div className="px-4 py-3 border-b space-y-2 bg-zinc-50">
            <div>
              <Label className="text-[10px]">Nama</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nama template" className="mt-1 h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px]">Kod</Label>
              <Input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="cth. DRONE-STD" className="mt-1 h-7 text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[10px]">Penerangan (pilihan)</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Ringkasan..." className="mt-1 h-7 text-xs" />
            </div>
            {createErr && <p className="text-[10px] text-red-500">{createErr}</p>}
            <div className="flex gap-1.5">
              <Button size="sm" onClick={createTemplate} disabled={creating || !newName.trim() || !newCode.trim()} className="h-7 text-xs px-3">
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cipta"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setNewOpen(false); setCreateErr(""); }} className="h-7 text-xs px-3">Batal</Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Memuatkan...</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Tiada template. Klik + untuk mula.</p>
          ) : (
            templates.map(t => (
              <div
                key={t.id}
                className={cn(
                  "group flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b last:border-0 transition-colors",
                  selected?.id === t.id ? "bg-violet-50" : "hover:bg-zinc-50"
                )}
                onClick={() => selectTemplate(t)}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs font-medium truncate", selected?.id === t.id ? "text-violet-700" : "text-zinc-800")}>{t.name}</p>
                  <p className="text-[10px] text-zinc-400 font-mono">{t.code}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{t._count.criterions} kriteria</p>
                </div>
                {canWrite && (
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); replicateTemplate(t); }}
                      disabled={replicating === t.id}
                      title="Salin template"
                      className="p-1 rounded hover:bg-violet-50"
                    >
                      {replicating === t.id
                        ? <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                        : <Copy className="h-3 w-3 text-violet-400" />
                      }
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); openDeleteDialog(t); }}
                      className="p-1 rounded hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Right: Template editor ──────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-50">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
            {loadingDetail
              ? <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
              : <>
                  <div className="rounded-full bg-zinc-100 p-4"><GripVertical className="h-8 w-8 text-zinc-300" /></div>
                  <p className="text-sm">Pilih template atau cipta yang baharu.</p>
                </>
            }
          </div>
        ) : loadingDetail ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl mx-auto w-full">

            {/* ── Header ── */}
            <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-700">Maklumat Template</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Nama *</Label>
                  <Input
                    value={editName}
                    onChange={e => { setEditName(e.target.value); setHeaderDirty(true); }}
                    className="mt-1 h-8 text-sm"
                    disabled={!canWrite}
                  />
                </div>
                <div>
                  <Label className="text-xs">Kod *</Label>
                  <Input
                    value={editCode}
                    onChange={e => { setEditCode(e.target.value.toUpperCase()); setHeaderDirty(true); }}
                    className="mt-1 h-8 text-sm font-mono"
                    disabled={!canWrite}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Penerangan</Label>
                <Input
                  value={editDesc}
                  onChange={e => { setEditDesc(e.target.value); setHeaderDirty(true); }}
                  placeholder="Penerangan ringkas..."
                  className="mt-1 h-8 text-sm"
                  disabled={!canWrite}
                />
              </div>
              {headerErr && <p className="text-xs text-red-500">{headerErr}</p>}
              {canWrite && headerDirty && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveHeader} disabled={headerSaving} className="h-7 text-xs gap-1.5">
                    {headerSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Simpan
                  </Button>
                </div>
              )}
            </div>

            {/* ── Criterions ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-700">
                  Kriteria Penilaian
                  <span className="ml-2 text-xs font-normal text-zinc-400">({selected.criterions.length})</span>
                </h2>
                {canWrite && (
                  <Button size="sm" variant="outline" onClick={addCriterion} disabled={addingCriterion} className="h-7 text-xs gap-1.5">
                    {addingCriterion ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Tambah Kriteria
                  </Button>
                )}
              </div>

              {selected.criterions.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-zinc-200 py-12 text-center text-zinc-400">
                  <p className="text-sm">Belum ada kriteria.</p>
                  {canWrite && <p className="text-xs mt-1">Klik &quot;Tambah Kriteria&quot; untuk bermula.</p>}
                </div>
              ) : (
                selected.criterions.map((c, idx) => (
                  <CriterionCard
                    key={c.id}
                    criterion={c}
                    templateId={selected.id}
                    canWrite={canWrite}
                    isFirst={idx === 0}
                    isLast={idx === selected.criterions.length - 1}
                    onUpdate={updateCriterion}
                    onDelete={deleteCriterion}
                    onMoveUp={() => moveCriterion(idx, -1)}
                    onMoveDown={() => moveCriterion(idx, 1)}
                  />
                ))
              )}
            </div>

            {/* Scoring summary */}
            {selected.criterions.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="text-xs font-semibold text-zinc-600 mb-3">Ringkasan Skor</h3>
                <div className="space-y-1.5">
                  {selected.criterions.map(c => {
                    const Icon = TYPE_META[c.type].icon;
                    let scoreDesc = "—";
                    if (c.type === "NUMBER") scoreDesc = `${c.minScore ?? 0} – ${c.maxScore ?? "?"} pts`;
                    if (c.type === "TIME")   scoreDesc = `0 – ${c.maxScore ?? "?"} pts (masa maks: ${c.maxTime ? fmtTime(c.maxTime) : "?"})`;
                    if (c.type === "SINGLE_OPTION") {
                      const max = Math.max(...c.options.map(o => o.weight), 0);
                      scoreDesc = `maks ${max} pts (pilih satu)`;
                    }
                    if (c.type === "MULTIPLE_OPTION") {
                      const total = c.options.reduce((s, o) => s + o.weight, 0);
                      scoreDesc = `maks ${total} pts (jumlah pilihan)`;
                    }
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        <Icon className="h-3 w-3 text-zinc-400 shrink-0" />
                        <span className="flex-1 text-zinc-700">{c.name}</span>
                        <span className="text-zinc-400 text-[11px]">{scoreDesc}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* AI generate dialog */}
      <Dialog open={aiOpen} onOpenChange={(open) => { if (!open) { setAiOpen(false); setAiErr(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <Sparkles className="h-4 w-4" /> Jana Template dengan AI
            </DialogTitle>
            <DialogDescription>
              Terangkan pertandingan atau kategori anda. AI akan menjana template penilaian dengan kriteria yang sesuai.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="cth. Pertandingan drone racing peringkat sekolah menengah. Peserta akan dinilai berdasarkan kelajuan, kawalan, dan ketepatan..."
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
              disabled={aiRunning}
            />
            {aiErr && (
              <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{aiErr}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAiOpen(false); setAiErr(""); }} disabled={aiRunning}>
              Batal
            </Button>
            <Button
              onClick={runAiGenerate}
              disabled={!aiPrompt.trim() || aiRunning}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            >
              {aiRunning
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Menjana...</>
                : <><Sparkles className="h-4 w-4" /> Jana Template</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete template confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4" /> Padam Template
            </DialogTitle>
            <DialogDescription>
              Tindakan ini tidak boleh dibatalkan. Template{" "}
              <span className="font-semibold text-zinc-800">&quot;{deleteTarget?.name}&quot;</span> dan
              semua kriteria penilaiannya akan dipadam secara kekal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-center">
              <p className="text-xs text-red-500 mb-1">Taip kod berikut untuk mengesahkan:</p>
              <p className="text-2xl font-bold tracking-[0.3em] text-red-700 font-mono select-all">
                {deleteCode}
              </p>
            </div>
            <Input
              placeholder="Taip kod pengesahan di sini…"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
              className="text-center font-mono tracking-widest"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteTemplate}
              disabled={deleteConfirm !== deleteCode || deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Padam Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
