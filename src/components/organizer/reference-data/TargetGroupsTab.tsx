"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Loader2, CalendarDays, GraduationCap, Lock, LockOpen } from "lucide-react";
import { PushKbButton } from "./PushKbButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "./DeleteDialog";
import { LockConfirmDialog } from "./LockConfirmDialog";

type TargetGroup = {
  id: string;
  code: string;
  name: string;
  schoolLevel: string;
  ageGroup: string;
  minAge: number;
  maxAge: number;
  classGrades: string[];
  ppki: boolean;
};

type GroupBy = "age" | "grades";

const SCHOOL_LEVELS = ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH", "HIGHER"] as const;

const GRADE_OPTIONS: Record<string, string[]> = {
  KINDERGARTEN: ["Prasekolah 5thn", "Prasekolah 6thn"],
  PRIMARY:      ["Darjah 1", "Darjah 2", "Darjah 3", "Darjah 4", "Darjah 5", "Darjah 6"],
  SECONDARY:    ["Tingkatan 1", "Tingkatan 2", "Tingkatan 3", "Tingkatan 4", "Tingkatan 5"],
  YOUTH:        [],
  HIGHER:       [],
};

const LEVEL_STYLES: Record<string, string> = {
  KINDERGARTEN: "bg-pink-50 text-pink-700",
  PRIMARY:      "bg-blue-50 text-blue-700",
  SECONDARY:    "bg-purple-50 text-purple-700",
  YOUTH:        "bg-amber-50 text-amber-700",
  HIGHER:       "bg-green-50 text-green-700",
};

const PAGE_SIZE = 20;

const EMPTY_FORM = {
  code: "",
  name: "",
  schoolLevel: "PRIMARY" as string,
  ageGroup: "",
  minAge: "",
  maxAge: "",
  classGrades: [] as string[],
  ppki: false,
};

function derivedAgeGroup(grades: string[]): string {
  if (grades.length === 0) return "";
  if (grades.length === 1) return grades[0];
  return `${grades[0]} – ${grades[grades.length - 1]}`;
}

export function TargetGroupsTab() {
  const [data, setData]       = useState<TargetGroup[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<TargetGroup | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [groupBy, setGroupBy]     = useState<GroupBy>("age");
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<TargetGroup | null>(null);
  const [sectionLocked, setSectionLocked] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockError, setLockError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
      if (levelFilter) params.set("schoolLevel", levelFilter);
      const res = await fetch(`/api/v2/organizer/reference-data/target-groups?${params}`);
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch {
      // server not ready yet (e.g. Prisma client restart needed)
    } finally {
      setLoading(false);
    }
  }, [page, q, levelFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/section-lock/target-groups")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((j) => setSectionLocked(j.locked === true))
      .catch(() => {});
  }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setGroupBy("age");
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(tg: TargetGroup) {
    setEditing(tg);
    const mode: GroupBy = tg.classGrades.length > 0 ? "grades" : "age";
    setForm({
      code:        tg.code,
      name:        tg.name,
      schoolLevel: tg.schoolLevel,
      ageGroup:    tg.ageGroup,
      minAge:      String(tg.minAge || ""),
      maxAge:      String(tg.maxAge || ""),
      classGrades: tg.classGrades,
      ppki:        tg.ppki,
    });
    setGroupBy(mode);
    setFormError("");
    setFormOpen(true);
  }

  function handleGroupByChange(next: GroupBy) {
    setGroupBy(next);
    if (next === "age") {
      setForm(f => ({ ...f, classGrades: [] }));
    } else {
      setForm(f => ({ ...f, minAge: "", maxAge: "", ageGroup: "" }));
    }
  }

  function handleLevelChange(level: string) {
    const hasGrades = (GRADE_OPTIONS[level] ?? []).length > 0;
    setForm(f => ({ ...f, schoolLevel: level, classGrades: [] }));
    if (!hasGrades) setGroupBy("age");
  }

  function toggleGrade(grade: string) {
    setForm((f) => ({
      ...f,
      classGrades: f.classGrades.includes(grade)
        ? f.classGrades.filter((g) => g !== grade)
        : [...f.classGrades, grade],
    }));
  }

  function handleAgeBlur() {
    const min = parseInt(form.minAge);
    const max = parseInt(form.maxAge);
    if (min > 0 && max > 0 && !form.ageGroup) {
      setForm((f) => ({ ...f, ageGroup: `${min}–${max}` }));
    }
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim() || !form.schoolLevel) {
      setFormError("Code, name, and school level are required.");
      return;
    }
    if (groupBy === "age" && !form.ageGroup.trim()) {
      setFormError("Age Group Label is required.");
      return;
    }
    if (groupBy === "grades" && form.classGrades.length === 0) {
      setFormError("Select at least one class grade.");
      return;
    }

    const ageGroup = groupBy === "grades"
      ? derivedAgeGroup(form.classGrades)
      : form.ageGroup;

    setSaving(true);
    setFormError("");
    try {
      const url    = editing
        ? `/api/v2/organizer/reference-data/target-groups/${editing.id}`
        : `/api/v2/organizer/reference-data/target-groups`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code:        form.code,
          name:        form.name,
          schoolLevel: form.schoolLevel,
          ageGroup,
          minAge:      groupBy === "age" ? (parseInt(form.minAge) || 0) : 0,
          maxAge:      groupBy === "age" ? (parseInt(form.maxAge) || 0) : 0,
          classGrades: groupBy === "grades" ? form.classGrades : [],
          ppki:        form.ppki,
        }),
      });
      if (!res.ok) {
        let msg = `Save failed (${res.status})`;
        try { const j = await res.json(); msg = j.error === "CODE_TAKEN" ? "Code already exists." : (j.error ?? msg); } catch { /* */ }
        throw new Error(msg);
      }
      setFormOpen(false);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/reference-data/target-groups/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      throw new Error(j.error === "HAS_DEPENDENTS" ? "Cannot delete: used by contests." : j.error);
    }
    load();
  }

  async function handleToggleLock() {
    const next = !sectionLocked;
    setLockError("");
    try {
      const res = await fetch("/api/v2/organizer/reference-data/section-lock/target-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSectionLocked(next);
    } catch (e: unknown) {
      setLockError(e instanceof Error ? e.message : "Gagal menyimpan status kunci.");
    }
  }

  const pages = Math.ceil(total / PAGE_SIZE);
  const gradeOptions = GRADE_OPTIONS[form.schoolLevel] ?? [];
  const canUseGrades = gradeOptions.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={levelFilter}
          onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All levels</option>
          {SCHOOL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="relative flex-1 min-w-32">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or code…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>
        <Button size="sm" onClick={openAdd} disabled={sectionLocked}>
          <Plus className="h-4 w-4 mr-1" />Add Target Group
        </Button>
        <button
          onClick={() => setLockDialogOpen(true)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
            sectionLocked
              ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          {sectionLocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {sectionLocked ? "Buka Kunci" : "Kunci"}
        </button>
      </div>

      {sectionLocked && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Seksyen ini dikunci. Tiada penambahan, pengeditan atau pemadaman dibenarkan.
        </div>
      )}

      {lockError && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
          {lockError}
        </div>
      )}

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Code</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Name</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Level</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Group By</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Value</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">PPKI</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            )}
            {!loading && data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-400">No target groups found.</td></tr>
            )}
            {!loading && data.map((tg) => (
              <tr key={tg.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">{tg.code}</td>
                <td className="px-3 py-2 font-medium">{tg.name}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_STYLES[tg.schoolLevel] ?? "bg-zinc-100 text-zinc-600"}`}>
                    {tg.schoolLevel}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {tg.classGrades.length > 0
                    ? <span className="flex items-center gap-1 text-xs text-purple-600"><GraduationCap className="h-3 w-3" />Class Grade</span>
                    : <span className="flex items-center gap-1 text-xs text-blue-600"><CalendarDays className="h-3 w-3" />Age Range</span>}
                </td>
                <td className="px-3 py-2 text-zinc-500 text-xs">
                  {tg.classGrades.length > 0
                    ? tg.classGrades.join(", ")
                    : tg.ageGroup
                      ? `${tg.ageGroup}${tg.minAge > 0 ? ` (${tg.minAge}–${tg.maxAge} yrs)` : ""}`
                      : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2">
                  {tg.ppki
                    ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700">Yes</span>
                    : <span className="text-xs text-zinc-300">No</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(tg)} disabled={sectionLocked} className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed">
                      <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                    </button>
                    <button onClick={() => setDeleteTarget(tg)} disabled={sectionLocked} className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-zinc-500">
          <span>{total} target groups</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 py-1">{page}/{pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Target Group" : "Add Target Group"}</DialogTitle>
          </DialogHeader>

          <div className="px-6 space-y-4">
            {/* Row 1: Code + Level */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. PRI-LOWER"
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label>School Level</Label>
                <select
                  value={form.schoolLevel}
                  onChange={(e) => handleLevelChange(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {SCHOOL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Name */}
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Primary School Lower"
                className="mt-1"
              />
            </div>

            {/* PPKI Students */}
            <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-zinc-50">
              <div>
                <p className="text-sm font-medium leading-none">PPKI Students</p>
                <p className="text-xs text-zinc-500 mt-1">This target group is for PPKI (special needs) students only.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.ppki}
                onClick={() => setForm(f => ({ ...f, ppki: !f.ppki }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                  form.ppki ? "bg-[#085782]" : "bg-zinc-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                    form.ppki ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Group By toggle */}
            <div>
              <Label className="mb-2 block">Group By</Label>
              <div className="flex rounded-lg border overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => handleGroupByChange("age")}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                    groupBy === "age"
                      ? "bg-[#085782] text-white"
                      : "bg-white text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  <CalendarDays className="h-4 w-4" />
                  Age Range
                </button>
                <button
                  type="button"
                  onClick={() => canUseGrades && handleGroupByChange("grades")}
                  disabled={!canUseGrades}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                    groupBy === "grades"
                      ? "bg-[#085782] text-white"
                      : canUseGrades
                        ? "bg-white text-zinc-500 hover:bg-zinc-50"
                        : "bg-white text-zinc-300 cursor-not-allowed"
                  }`}
                >
                  <GraduationCap className="h-4 w-4" />
                  Class Grade
                </button>
              </div>
              {!canUseGrades && (
                <p className="text-xs text-zinc-400 mt-1">Class Grade grouping is not available for {form.schoolLevel}.</p>
              )}
            </div>

            {/* Age Range fields */}
            {groupBy === "age" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min Age</Label>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={form.minAge}
                    onChange={(e) => setForm(f => ({ ...f, minAge: e.target.value }))}
                    onBlur={handleAgeBlur}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Max Age</Label>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={form.maxAge}
                    onChange={(e) => setForm(f => ({ ...f, maxAge: e.target.value }))}
                    onBlur={handleAgeBlur}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Age Group Label</Label>
                  <Input
                    value={form.ageGroup}
                    onChange={(e) => setForm(f => ({ ...f, ageGroup: e.target.value }))}
                    placeholder="e.g. 7–9"
                    className="mt-1"
                  />
                  <p className="text-xs text-zinc-400 mt-1">Auto-filled from Min/Max Age on blur.</p>
                </div>
              </div>
            )}

            {/* Class Grade fields */}
            {groupBy === "grades" && gradeOptions.length > 0 && (
              <div>
                <Label className="mb-2 block">Eligible Class Grades</Label>
                <div className="grid grid-cols-3 gap-2">
                  {gradeOptions.map((g) => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer text-sm select-none">
                      <input
                        type="checkbox"
                        checked={form.classGrades.includes(g)}
                        onChange={() => toggleGrade(g)}
                        className="rounded"
                      />
                      {g}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, classGrades: gradeOptions }))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-zinc-300">·</span>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, classGrades: [] }))}
                    className="text-xs text-zinc-400 hover:underline"
                  >
                    Clear
                  </button>
                  {form.classGrades.length > 0 && (
                    <span className="text-xs text-zinc-400 ml-auto">{form.classGrades.length} selected</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {formError && <p className="text-sm text-red-500 px-6 mt-1">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will permanently remove the target group."
      />

      <LockConfirmDialog
        open={lockDialogOpen}
        itemName="Kumpulan Sasaran"
        isLocked={sectionLocked}
        onConfirm={handleToggleLock}
        onClose={() => setLockDialogOpen(false)}
      />

      <div className="mt-4 flex justify-start">
        <PushKbButton entityType="reference/target-groups" label="Target Groups" />
      </div>
    </div>
  );
}
