"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Search, Loader2, AlertCircle,
  Users, UserCheck, X, Link2, Link2Off,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type Contingent = { id: string; name: string };

type TeamRef = {
  id: string;
  name: string;
  competition: { name: string; code: string };
};

type TeamAssignment = {
  id: string;
  teamId: string;
  team: TeamRef;
};

type Trainer = {
  id: string;
  name: string;
  ic: string | null;
  email: string | null;
  phoneNumber: string | null;
  contingentId: string;
  status: string;
  teams: TeamAssignment[];
};

type Team = {
  id: string;
  name: string;
  competition: { name: string; code: string };
};

// ── Add / Edit Dialog ─────────────────────────────────────────────────────────

const EMPTY_FORM = { name: "", ic: "", email: "", phoneNumber: "", contingentId: "" };

function TrainerFormDialog({
  open,
  onClose,
  contingents,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contingents: Contingent[];
  initial?: Trainer | null;
  onSaved: (trainer: Trainer) => void;
}) {
  const isEdit = !!initial?.id;
  const [form, setForm]   = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setError("");
    if (initial) {
      setForm({
        name:        initial.name        ?? "",
        ic:          initial.ic          ?? "",
        email:       initial.email       ?? "",
        phoneNumber: initial.phoneNumber ?? "",
        contingentId: initial.contingentId,
      });
    } else {
      setForm({ ...EMPTY_FORM, contingentId: contingents[0]?.id ?? "" });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initial, contingents]);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const url    = isEdit ? `/api/v2/manager/trainers/${initial!.id}` : "/api/v2/manager/trainers";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onSaved(j.data);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{isEdit ? "Edit Trainer" : "Add Trainer"}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">
            {isEdit ? "Update trainer details." : "Register a new trainer for your contingent."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {contingents.length > 1 && (
            <div className="space-y-1.5">
              <Label>Contingent</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.contingentId}
                onChange={(e) => set("contingentId", e.target.value)}
                disabled={isEdit}
              >
                {contingents.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tr-name">Full Name <span className="text-red-500">*</span></Label>
            <Input
              id="tr-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Ahmad bin Ali"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr-ic">IC / Passport No.</Label>
            <Input
              id="tr-ic"
              value={form.ic}
              onChange={(e) => set("ic", e.target.value)}
              placeholder="e.g. 801231-14-5678"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr-phone">Phone Number</Label>
            <Input
              id="tr-phone"
              value={form.phoneNumber}
              onChange={(e) => set("phoneNumber", e.target.value)}
              placeholder="e.g. 0123456789"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr-email">Email</Label>
            <Input
              id="tr-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="e.g. ahmad@example.com"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-5 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? "Save" : "Add Trainer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign Teams Dialog ───────────────────────────────────────────────────────

function AssignTeamsDialog({
  trainer,
  onClose,
  onUpdated,
}: {
  trainer: Trainer | null;
  onClose: () => void;
  onUpdated: (trainer: Trainer) => void;
}) {
  const [teams, setTeams]       = useState<Team[]>([]);
  const [loading, setLoading]   = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError]       = useState("");

  const assignedIds = new Set(trainer?.teams.map((t) => t.teamId) ?? []);

  useEffect(() => {
    if (!trainer) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/v2/manager/teams")
      .then((r) => r.json())
      .then((j) => setTeams(j.data ?? []))
      .catch(() => setError("Failed to load teams"))
      .finally(() => setLoading(false));
  }, [trainer?.id]);

  async function toggle(teamId: string) {
    if (!trainer) return;
    const isAssigned = assignedIds.has(teamId);
    setToggling(teamId); setError("");
    try {
      const res = await fetch(`/api/v2/manager/trainers/${trainer.id}/teams`, {
        method: isAssigned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Failed"); }
      const trRes = await fetch(`/api/v2/manager/trainers/${trainer.id}`);
      const trJ   = await trRes.json();
      onUpdated(trJ.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(null);
    }
  }

  return (
    <Dialog open={!!trainer} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-2">
          <DialogTitle>Assign Teams — {trainer?.name}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">
            Toggle teams this trainer manages.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2 max-h-[60vh] overflow-y-auto space-y-1">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}
          {!loading && teams.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-6">
              No teams found. Create a team first.
            </p>
          )}
          {!loading && teams.map((t) => {
            const assigned = assignedIds.has(t.id);
            return (
              <div
                key={t.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                  assigned ? "bg-blue-50" : "hover:bg-zinc-50"
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-zinc-400">{t.competition.name} ({t.competition.code})</p>
                </div>
                <Button
                  size="sm"
                  variant={assigned ? "default" : "outline"}
                  className={assigned ? "bg-blue-600 hover:bg-blue-700 h-7 px-2.5" : "h-7 px-2.5"}
                  disabled={toggling === t.id}
                  onClick={() => toggle(t.id)}
                >
                  {toggling === t.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : assigned ? (
                    <><Link2Off className="h-3.5 w-3.5 mr-1" />Remove</>
                  ) : (
                    <><Link2 className="h-3.5 w-3.5 mr-1" />Assign</>
                  )}
                </Button>
              </div>
            );
          })}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 mt-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 pt-3">
          <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  trainer,
  onClose,
  onDeleted,
}: {
  trainer: Trainer | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!trainer) return;
    setDeleting(true);
    try {
      await fetch(`/api/v2/manager/trainers/${trainer.id}`, { method: "DELETE" });
      onDeleted(trainer.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!trainer} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Delete Trainer</DialogTitle>
          <DialogDescription>
            Remove <span className="font-medium text-foreground">&quot;{trainer?.name}&quot;</span>?
            They will be unassigned from all teams.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Trainer Row ───────────────────────────────────────────────────────────────

function TrainerRow({
  trainer,
  onEdit,
  onDelete,
  onAssign,
}: {
  trainer: Trainer;
  onEdit:   (t: Trainer) => void;
  onDelete: (t: Trainer) => void;
  onAssign: (t: Trainer) => void;
}) {
  const initials = trainer.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm">
      {/* Avatar */}
      <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm select-none">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">{trainer.name}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {trainer.ic && (
            <span className="text-xs text-zinc-400 font-mono">{trainer.ic.slice(0, 4)}••••••</span>
          )}
          {trainer.phoneNumber && (
            <span className="text-xs text-zinc-400">{trainer.phoneNumber}</span>
          )}
          {trainer.email && (
            <span className="text-xs text-zinc-400 truncate max-w-[180px]">{trainer.email}</span>
          )}
        </div>

        {/* Team badges */}
        {trainer.teams.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {trainer.teams.map((t) => (
              <Badge
                key={t.id}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-0"
              >
                {t.team.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0"
          onClick={() => onAssign(trainer)} title="Assign teams"
        >
          <Users className="h-3.5 w-3.5 text-zinc-500" />
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0"
          onClick={() => onEdit(trainer)} title="Edit"
        >
          <Pencil className="h-3.5 w-3.5 text-zinc-500" />
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
          onClick={() => onDelete(trainer)} title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Main TrainersClient ───────────────────────────────────────────────────────

export function TrainersClient({ contingents }: { contingents: Contingent[] }) {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState("");

  const [addOpen, setAddOpen]       = useState(false);
  const [editing, setEditing]       = useState<Trainer | null>(null);
  const [deleting, setDeleting]     = useState<Trainer | null>(null);
  const [assigning, setAssigning]   = useState<Trainer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/v2/manager/trainers?${params}`);
      const j   = await res.json();
      setTrainers(j.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [q]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function patchTrainer(updated: Trainer) {
    setTrainers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (assigning?.id === updated.id) setAssigning(updated);
  }

  function handleSaved(trainer: Trainer) {
    setTrainers((prev) => {
      const exists = prev.find((t) => t.id === trainer.id);
      return exists ? prev.map((t) => (t.id === trainer.id ? trainer : t)) : [trainer, ...prev];
    });
  }

  if (contingents.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-8">
        <div className="rounded-full bg-amber-50 p-5">
          <UserCheck className="h-10 w-10 text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold">No Contingent Found</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          You need to be part of a contingent before you can register trainers.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Trainers</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{trainers.length} registered</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Add Trainer
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, IC or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : trainers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="rounded-full bg-indigo-50 p-4">
            <UserCheck className="h-8 w-8 text-indigo-400" />
          </div>
          <p className="font-medium">{q ? "No trainers match your search." : "No trainers yet."}</p>
          {!q && (
            <Button className="mt-1" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Add Trainer
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {trainers.map((t) => (
            <TrainerRow
              key={t.id}
              trainer={t}
              onEdit={setEditing}
              onDelete={setDeleting}
              onAssign={setAssigning}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <TrainerFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        contingents={contingents}
        onSaved={handleSaved}
      />
      <TrainerFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        contingents={contingents}
        initial={editing}
        onSaved={(t) => { patchTrainer(t); setEditing(null); }}
      />
      <AssignTeamsDialog
        trainer={assigning}
        onClose={() => setAssigning(null)}
        onUpdated={patchTrainer}
      />
      <DeleteConfirmDialog
        trainer={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => setTrainers((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
