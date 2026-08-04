"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Users, Loader2, X, UserPlus, UserMinus,
  ChevronDown, ChevronRight, Trophy, AlertCircle, UserCheck, Link2Off,
  Mail, Check, CalendarDays, MapPin,
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

type TargetGroupRef = { id: string; code: string; name: string };

type Competition = {
  id: string;
  code: string;
  name: string;
  minTeamSize: number;
  maxTeamSize: number;
  status: string;
  targetGroups?: { targetGroup: TargetGroupRef }[];
};

type Participant = {
  id: string;
  name: string;
  gender: "MALE" | "FEMALE";
  eduLevel: "PRIMARY" | "SECONDARY" | "YOUTH";
  classGrade: string | null;
};

type TeamMember = {
  id: string;
  participantId: string;
  participant: Participant;
};

type TrainerRef = { id: string; name: string; phoneNumber: string | null };

type TeamTrainer = { id: string; trainerId: string; trainer: TrainerRef };

type EventRef = {
  id: string; name: string; slug: string;
  status: string; scope: string;
  startDate: string | null; endDate: string | null;
  venue?: string | null;
  description?: string | null;
};

type TeamEventEntry = {
  id: string;
  eventId: string;
  acceptance: string;
  selected: boolean;
  event: EventRef & { needManagerAcceptance: boolean };
};

type EligibleEvent = EventRef & { venue: string | null; description: string | null };

type Team = {
  id: string;
  name: string;
  email: string | null;
  lmsUserId: string | null;
  competitionId: string;
  contingentId: string;
  status: string;
  competition: { id: string; name: string; code: string; maxTeamSize: number; minTeamSize: number; eptimEduCourseId: string | null };
  members: TeamMember[];
  trainers: TeamTrainer[];
  teamEvents: TeamEventEntry[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const GENDER_COLOR: Record<string, string> = {
  MALE:   "bg-blue-50 text-blue-700",
  FEMALE: "bg-pink-50 text-pink-700",
};

const EDU_LABEL: Record<string, string> = {
  PRIMARY:   "Primary",
  SECONDARY: "Secondary",
  YOUTH:     "Youth",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  PUBLISHED:  "bg-blue-50 text-blue-600",
  REG_OPEN:   "bg-green-50 text-green-700",
  REG_CLOSED: "bg-orange-50 text-orange-700",
  ONGOING:    "bg-purple-50 text-purple-700",
  COMPLETED:  "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

function MemberSlots({ filled, max }: { filled: number; max: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-2.5 w-2.5 rounded-full border ${
            i < filled ? "bg-blue-500 border-blue-500" : "bg-white border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600"
          }`}
        />
      ))}
      <span className="text-xs text-zinc-500 ml-1">{filled}/{max}</span>
    </div>
  );
}

// ── Competition picker (grouped by Target Group, 3-column grid) ──────────────

type CompetitionGroup = { id: string; name: string; items: Competition[] };

function groupCompetitionsByTargetGroup(competitions: Competition[]): CompetitionGroup[] {
  const groups = new Map<string, CompetitionGroup>();
  const ungrouped: Competition[] = [];

  for (const c of competitions) {
    const tgs = c.targetGroups ?? [];
    if (tgs.length === 0) { ungrouped.push(c); continue; }
    for (const { targetGroup: tg } of tgs) {
      if (!groups.has(tg.id)) groups.set(tg.id, { id: tg.id, name: tg.name, items: [] });
      groups.get(tg.id)!.items.push(c);
    }
  }

  const sorted = [...groups.values()]
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.code.localeCompare(b.code)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (ungrouped.length > 0) {
    sorted.push({
      id: "__none__",
      name: "Lain-lain",
      items: [...ungrouped].sort((a, b) => a.code.localeCompare(b.code)),
    });
  }

  return sorted;
}

function CompetitionPicker({
  competitions,
  value,
  onChange,
}: {
  competitions: Competition[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const selected = competitions.find((c) => c.id === value);
  const groups = groupCompetitionsByTargetGroup(competitions);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={`truncate ${selected ? "" : "text-zinc-400"}`}>
          {selected ? `${selected.code} ${selected.name}` : "— Select competition —"}
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 shadow-lg max-h-80 overflow-y-auto p-3 space-y-3">
          {groups.length === 0 ? (
            <p className="text-sm text-zinc-400 italic px-1">No competitions available.</p>
          ) : (
            groups.map((g) => (
              <div key={g.id}>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 px-0.5">
                  {g.name}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {g.items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { onChange(c.id); setOpen(false); }}
                      title={`${c.name} (${c.code})`}
                      className={`text-left rounded-md border px-2 py-1.5 transition-colors ${
                        c.id === value
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-blue-50 dark:hover:bg-zinc-700/60"
                      }`}
                    >
                      <span className="flex items-baseline gap-1 text-xs font-medium truncate">
                        <span className={`shrink-0 ${c.id === value ? "text-blue-100" : "text-zinc-400"}`}>
                          {c.code}
                        </span>
                        <span className="truncate">{c.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Team Dialog ────────────────────────────────────────────────────────

function CreateTeamDialog({
  open,
  onClose,
  contingents,
  competitions,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  contingents: Contingent[];
  competitions: Competition[];
  onCreated: (team: Team) => void;
}) {
  const [name, setName] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [contingentId, setContingentId] = useState(contingents[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedComp = competitions.find((c) => c.id === competitionId);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) { setName(""); setCompetitionId(""); setError(""); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  async function handleCreate() {
    if (!name.trim()) { setError("Team name is required."); return; }
    if (!competitionId) { setError("Please select a competition."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/v2/manager/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, competitionId, contingentId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to create team");
      onCreated(j.data);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>Create Team</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">
            Choose a competition and give your team a name.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {contingents.length > 1 && (
            <div className="space-y-1.5">
              <Label>Contingent</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={contingentId}
                onChange={(e) => setContingentId(e.target.value)}
              >
                {contingents.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Competition <span className="text-red-500">*</span></Label>
            {competitions.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">No team competitions available.</p>
            ) : (
              <CompetitionPicker
                competitions={competitions}
                value={competitionId}
                onChange={setCompetitionId}
              />
            )}
            {selectedComp && (
              <p className="text-xs text-zinc-500">
                Team size: {selectedComp.minTeamSize}–{selectedComp.maxTeamSize} members
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team Name <span className="text-red-500">*</span></Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Team Harimau"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-5 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || competitions.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rename Dialog ─────────────────────────────────────────────────────────────

function RenameDialog({
  team,
  onClose,
  onRenamed,
}: {
  team: Team | null;
  onClose: () => void;
  onRenamed: (team: Team) => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (team) { setName(team.name); setError(""); } }, [team]);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/v2/manager/teams/${team!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onRenamed(j.data);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!team} onOpenChange={onClose}>
      <DialogContent className="max-w-xs p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>Rename Team</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4 space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="px-6 pb-5 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Member Dialog ─────────────────────────────────────────────────────────

type TargetGroupInfo = {
  id: string;
  name: string;
  schoolLevel: string;
  ageGroup: string;
  minAge: number;
  maxAge: number;
  classGrades: string[];
};

function TargetGroupPills({ groups }: { groups: TargetGroupInfo[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-6 pb-3">
      {groups.map((g) => (
        <span
          key={g.id}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
        >
          {g.name}
          {g.classGrades.length > 0
            ? ` · ${g.classGrades.join(", ")}`
            : g.minAge > 0
            ? ` · ${g.minAge}–${g.maxAge} yrs`
            : ""}
        </span>
      ))}
    </div>
  );
}

function AddMemberDialog({
  team,
  onClose,
  onAdded,
}: {
  team: Team | null;
  onClose: () => void;
  onAdded: (team: Team) => void;
}) {
  const [eligible, setEligible]         = useState<Participant[]>([]);
  const [targetGroups, setTargetGroups] = useState<TargetGroupInfo[]>([]);
  const [loading, setLoading]           = useState(false);
  const [adding, setAdding]             = useState<string | null>(null);
  const [error, setError]               = useState("");

  useEffect(() => {
    if (!team) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setError("");
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`/api/v2/manager/teams/${team.id}/eligible-participants`)
      .then((r) => r.json())
      .then((j) => {
        setEligible(j.data ?? []);
        setTargetGroups(j.targetGroups ?? []);
      })
      .catch(() => setError("Failed to load eligible participants"))
      .finally(() => setLoading(false));
  }, [team?.id]);

  async function addMember(participantId: string) {
    if (!team) return;
    setAdding(participantId); setError("");
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      const teamRes = await fetch(`/api/v2/manager/teams/${team.id}`);
      const teamJ   = await teamRes.json();
      onAdded(teamJ.data);
      // Remove the added participant from the local list
      setEligible((prev) => prev.filter((p) => p.id !== participantId));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === "TEAM_FULL" ? "Team is full." : msg);
    } finally {
      setAdding(null);
    }
  }

  const isFull = team ? team.members.length >= team.competition.maxTeamSize : false;

  return (
    <Dialog open={!!team} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-2">
          <DialogTitle>Add Member — {team?.name}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">
            {team && `${team.members.length}/${team.competition.maxTeamSize} slots filled · showing eligible participants only`}
          </DialogDescription>
        </DialogHeader>

        {/* Target group chips so managers know why the list is filtered */}
        {!loading && targetGroups.length > 0 && (
          <TargetGroupPills groups={targetGroups} />
        )}

        <div className="px-6 py-2 max-h-[55vh] overflow-y-auto space-y-1">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}
          {!loading && eligible.length === 0 && !error && (
            <p className="text-sm text-zinc-400 text-center py-6">
              No eligible participants available.
              {targetGroups.length > 0 && (
                <span className="block text-xs mt-1">
                  Make sure participants match the target groups above.
                </span>
              )}
            </p>
          )}
          {!loading && eligible.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-zinc-400">
                  {EDU_LABEL[p.eduLevel]}{p.classGrade ? ` · ${p.classGrade}` : ""}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(p as any).age ? ` · ${(p as any).age} yrs` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!!adding || isFull}
                onClick={() => addMember(p.id)}
              >
                {adding === p.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <UserPlus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
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

// ── Trainer Picker Dialog ─────────────────────────────────────────────────────

function TrainerPickerDialog({
  team,
  onClose,
  onUpdated,
}: {
  team: Team | null;
  onClose: () => void;
  onUpdated: (team: Team) => void;
}) {
  const [allTrainers, setAllTrainers] = useState<TrainerRef[]>([]);
  const [loading, setLoading]         = useState(false);
  const [toggling, setToggling]       = useState<string | null>(null);
  const [error, setError]             = useState("");

  const assignedIds = new Set(team?.trainers.map((t) => t.trainerId) ?? []);

  useEffect(() => {
    if (!team) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/v2/manager/trainers")
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((j) => setAllTrainers((j.data ?? []).map((t: any) => ({ id: t.id, name: t.name, phoneNumber: t.phoneNumber }))))
      .catch(() => setError("Failed to load trainers"))
      .finally(() => setLoading(false));
  }, [team?.id]);

  async function toggle(trainerId: string) {
    if (!team) return;
    const isAssigned = assignedIds.has(trainerId);
    setToggling(trainerId); setError("");
    try {
      const res = isAssigned
        ? await fetch(`/api/v2/manager/teams/${team.id}/trainers/${trainerId}`, { method: "DELETE" })
        : await fetch(`/api/v2/manager/teams/${team.id}/trainers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trainerId }),
          });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Failed"); }
      const teamRes = await fetch(`/api/v2/manager/teams/${team.id}`);
      const teamJ  = await teamRes.json();
      onUpdated(teamJ.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(null);
    }
  }

  return (
    <Dialog open={!!team} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-2">
          <DialogTitle>Select Trainers — {team?.name}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">
            Toggle trainers for this team.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2 max-h-[55vh] overflow-y-auto space-y-1">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}
          {!loading && allTrainers.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-6">
              No trainers registered yet. Add trainers first.
            </p>
          )}
          {!loading && allTrainers.map((tr) => {
            const assigned = assignedIds.has(tr.id);
            return (
              <div
                key={tr.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                  assigned ? "bg-indigo-50 dark:bg-indigo-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{tr.name}</p>
                  {tr.phoneNumber && (
                    <p className="text-xs text-zinc-400">{tr.phoneNumber}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={assigned ? "default" : "outline"}
                  className={assigned ? "bg-indigo-600 hover:bg-indigo-700 h-7 px-2.5" : "h-7 px-2.5"}
                  disabled={toggling === tr.id}
                  onClick={() => toggle(tr.id)}
                >
                  {toggling === tr.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : assigned ? (
                    <><Link2Off className="h-3.5 w-3.5 mr-1" />Remove</>
                  ) : (
                    <><UserCheck className="h-3.5 w-3.5 mr-1" />Assign</>
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

// ── Team Card ─────────────────────────────────────────────────────────────────

function TeamEmailRow({ team, onUpdated }: { team: Team; onUpdated: (t: Team) => void }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(team.email ?? "");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setVal(team.email ?? ""); }, [team.email]);

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: val.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onUpdated(j.data);
      setEditing(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t bg-zinc-50/60 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
      <Mail className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
      {editing ? (
        <>
          <input
            autoFocus
            type="email"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="flex-1 h-6 rounded border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring dark:bg-zinc-800"
            placeholder="team@email.com"
          />
          <button onClick={save} disabled={saving}
            className="h-6 w-6 rounded flex items-center justify-center bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button onClick={() => { setEditing(false); setErr(""); setVal(team.email ?? ""); }}
            className="h-6 w-6 rounded flex items-center justify-center bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600">
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <span className={`flex-1 truncate ${team.email ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 italic"}`}>
            {team.email ?? "No email set"}
          </span>
          <button onClick={() => setEditing(true)}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:underline shrink-0">
            {team.email ? "Edit" : "Set email"}
          </button>
        </>
      )}
      {err && <span className="text-red-500 truncate max-w-[160px]">{err}</span>}
    </div>
  );
}

const ACCEPTANCE_OPTIONS = ["PENDING", "HOLD", "ACCEPT", "REJECT"] as const;
const ACCEPTANCE_CLS: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200",
  HOLD:    "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  ACCEPT:  "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
  REJECT:  "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
};

function AcceptanceControl({
  team, teamEvent, onUpdated,
}: {
  team: Team;
  teamEvent: TeamEventEntry;
  onUpdated: (acceptance: string) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  async function set(acceptance: string) {
    if (saving) return;
    setSaving(acceptance);
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/events/${teamEvent.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptance }),
      });
      if (!res.ok) throw new Error("Gagal");
      onUpdated(acceptance);
    } catch {
      // silently fail — state reverts since onUpdated wasn't called
    } finally {
      setSaving(null);
    }
  }

  const current = teamEvent.acceptance ?? "PENDING";

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-zinc-400 shrink-0">Penerimaan — <span className="font-medium text-zinc-700">{teamEvent.event.name}</span>:</span>
      <div className="flex gap-1 flex-wrap">
        {ACCEPTANCE_OPTIONS.map(opt => (
          <button
            key={opt}
            disabled={!!saving}
            onClick={() => set(opt)}
            className={`px-2 py-0.5 rounded-full border font-semibold transition-colors disabled:opacity-50 ${
              current === opt
                ? ACCEPTANCE_CLS[opt]
                : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-300"
            }`}
          >
            {saving === opt ? "…" : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  onRename,
  onDelete,
  onAddMember,
  onRemoveMember,
  onEditTrainers,
  onUpdated,
  onJoinEvent,
}: {
  team: Team;
  onRename: (team: Team) => void;
  onDelete: (team: Team) => void;
  onAddMember: (team: Team) => void;
  onRemoveMember: (team: Team, memberId: string) => void;
  onEditTrainers: (team: Team) => void;
  onUpdated: (team: Team) => void;
  onJoinEvent: (team: Team) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isFull = team.members.length >= team.competition.maxTeamSize;
  const isTeamSelected = team.teamEvents.some(te => te.selected);

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800 dark:shadow-black/20">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{team.name}</p>
            {isFull && (
              <Badge className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-0">Full</Badge>
            )}
          </div>
          <MemberSlots filled={team.members.length} max={team.competition.maxTeamSize} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); onRename(team); }}
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5 text-zinc-500" />
          </Button>
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
            onClick={(e) => { e.stopPropagation(); onDelete(team); }}
            title="Delete team"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-zinc-400" />
            : <ChevronRight className="h-4 w-4 text-zinc-400" />}
        </div>
      </div>

      {/* Expanded member list */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2">
          {team.members.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-2">No members yet.</p>
          ) : (
            team.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      m.participant.gender === "MALE" ? "bg-blue-400" : "bg-pink-400"
                    }`}
                  >
                    {m.participant.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm leading-tight">{m.participant.name}</p>
                    <p className="text-xs text-zinc-400">
                      {m.participant.classGrade ?? (m.participant.eduLevel === "YOUTH" ? "Youth" : "")}
                    </p>
                  </div>
                </div>
                {!isTeamSelected && (
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => onRemoveMember(team, m.id)}
                    title="Remove member"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
          {isTeamSelected && (
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-md px-2.5 py-1.5 mt-1 border border-amber-100">
              Members locked — team is selected (PILIH) for an event.
            </p>
          )}
          {!isFull && !isTeamSelected && (
            <Button
              size="sm" variant="outline" className="w-full mt-1 text-xs h-7"
              onClick={() => onAddMember(team)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" />Add Member
            </Button>
          )}
        </div>
      )}

      {/* Email row */}
      <TeamEmailRow team={team} onUpdated={onUpdated} />

      {/* Trainer footer */}
      <div className="bg-zinc-50 px-4 py-2.5 flex items-center gap-2 flex-wrap dark:bg-zinc-800/50">
        <UserCheck className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        {team.trainers.length === 0 ? (
          <span className="text-xs text-zinc-400 italic">No trainers assigned</span>
        ) : (
          team.trainers.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium"
            >
              {t.trainer.name}
            </span>
          ))
        )}
        <button
          className="ml-auto text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline shrink-0"
          onClick={() => onEditTrainers(team)}
        >
          {team.trainers.length === 0 ? "Assign" : "Edit"}
        </button>
      </div>

      {/* Event footer */}
      <div className="border-t px-4 py-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
          {team.teamEvents.length === 0 ? (
            <span className="text-xs text-zinc-400 italic">No events joined</span>
          ) : (
            team.teamEvents.map((te) => {
              const a = te.acceptance ?? "PENDING";
              const acCls: Record<string, string> = {
                PENDING: "bg-zinc-100 text-zinc-500 border-zinc-200",
                HOLD:    "bg-amber-50 text-amber-700 border-amber-200",
                ACCEPT:  "bg-emerald-50 text-emerald-700 border-emerald-200",
                REJECT:  "bg-red-50 text-red-700 border-red-200",
              };
              return (
                <span
                  key={te.id}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-medium"
                >
                  {te.event.name}
                  {te.event.needManagerAcceptance && (
                    <span className={`text-[9px] font-bold px-1.5 py-0 rounded-full border ${acCls[a] ?? acCls.PENDING}`}>
                      {a}
                    </span>
                  )}
                </span>
              );
            })
          )}
          <button
            className="ml-auto text-[11px] text-blue-600 hover:text-blue-800 hover:underline shrink-0"
            onClick={() => onJoinEvent(team)}
          >
            + Join
          </button>
        </div>

        {/* Acceptance controls for events requiring manager confirmation */}
        {team.teamEvents.filter(te => te.event.needManagerAcceptance).map(te => (
          <AcceptanceControl key={te.id} team={team} teamEvent={te} onUpdated={(acceptance) => {
            onUpdated({
              ...team,
              teamEvents: team.teamEvents.map(t => t.id === te.id ? { ...t, acceptance } : t),
            });
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Join Event Dialog ─────────────────────────────────────────────────────────

function JoinEventDialog({
  team,
  onClose,
  onJoined,
}: {
  team: Team | null;
  onClose: () => void;
  onJoined: (updated: TeamEventEntry) => void;
}) {
  const [events, setEvents]   = useState<EligibleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const loadEvents = useCallback((teamId: string) => {
    setEvents([]);
    setError(null);
    setLoading(true);
    fetch(`/api/v2/manager/teams/${teamId}/events`)
      .then(r => r.json())
      .then(j => setEvents(j.data ?? []))
      .catch(() => setError("Gagal memuatkan senarai acara"))
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (team) loadEvents(team.id); }, [team, loadEvents]);

  async function handleJoin(eventId: string) {
    if (!team) return;
    setJoining(eventId);
    setError(null);
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onJoined(j.data as TeamEventEntry);
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyertai acara");
    } finally {
      setJoining(null);
    }
  }

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    PUBLISHED:  { label: "Published",   cls: "bg-blue-50 text-blue-700 border-blue-100" },
    REG_OPEN:   { label: "Open",        cls: "bg-green-50 text-green-700 border-green-100" },
    REG_CLOSED: { label: "Reg. Closed", cls: "bg-orange-50 text-orange-700 border-orange-100" },
    ONGOING:    { label: "Ongoing",     cls: "bg-purple-50 text-purple-700 border-purple-100" },
  };

  function fmtDate(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <Dialog open={!!team} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sertai Acara</DialogTitle>
          <DialogDescription>
            Pilih acara untuk pasukan <span className="font-medium text-foreground">{team?.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}

          {!loading && events.length === 0 && !error && (
            <div className="text-center py-8 text-sm text-zinc-400">
              Tiada acara tersedia untuk disertai
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {events.map(ev => {
            const st = STATUS_LABEL[ev.status] ?? { label: ev.status, cls: "bg-zinc-100 text-zinc-600" };
            const isJoining = joining === ev.id;
            return (
              <div key={ev.id} className="flex items-start gap-3 rounded-lg border p-3 bg-white dark:bg-zinc-900 dark:border-zinc-800">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{ev.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  {ev.description && (
                    <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{ev.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {(ev.startDate || ev.endDate) && (
                      <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <CalendarDays className="h-3 w-3" />
                        {fmtDate(ev.startDate)}{ev.endDate && ev.endDate !== ev.startDate ? ` – ${fmtDate(ev.endDate)}` : ""}
                      </span>
                    )}
                    {ev.venue && (
                      <span className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />{ev.venue}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm" className="shrink-0 h-7 text-xs"
                  disabled={!!joining}
                  onClick={() => handleJoin(ev.id)}
                >
                  {isJoining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Join"}
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm Dialog ─────────────────────────────────────────────────────

function DeleteConfirmDialog({
  team,
  onClose,
  onDeleted,
}: {
  team: Team | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!team) return;
    setDeleting(true);
    try {
      await fetch(`/api/v2/manager/teams/${team.id}`, { method: "DELETE" });
      onDeleted(team.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!team} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Delete Team</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">&quot;{team?.name}&quot;</span>? This will remove all members from the team.
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

// ── Main TeamsClient ──────────────────────────────────────────────────────────

export function TeamsClient({ contingents }: { contingents: Contingent[] }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen]           = useState(false);
  const [renaming, setRenaming]               = useState<Team | null>(null);
  const [deleting, setDeleting]               = useState<Team | null>(null);
  const [addingMember, setAddingMember]       = useState<Team | null>(null);
  const [editingTrainers, setEditingTrainers] = useState<Team | null>(null);
  const [joiningEvent, setJoiningEvent]       = useState<Team | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsRes, compsRes] = await Promise.all([
        fetch("/api/v2/manager/teams"),
        fetch("/api/v2/manager/competitions"),
      ]);
      const [teamsJ, compsJ] = await Promise.all([teamsRes.json(), compsRes.json()]);
      setTeams(teamsJ.data ?? []);
      setCompetitions(compsJ.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function patchTeam(updated: Team) {
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function removeMember(team: Team, memberId: string) {
    await fetch(`/api/v2/manager/teams/${team.id}/members/${memberId}`, { method: "DELETE" });
    const res = await fetch(`/api/v2/manager/teams/${team.id}`);
    const j = await res.json();
    patchTeam(j.data);
  }

  // Group teams by competition
  const grouped = teams.reduce<Record<string, Team[]>>((acc, t) => {
    const key = t.competitionId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  if (contingents.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-8">
        <div className="rounded-full bg-amber-50 p-5">
          <Users className="h-10 w-10 text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold">No Contingent Found</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          You need to be part of a contingent before you can create teams.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Teams</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {teams.length} team{teams.length !== 1 ? "s" : ""} across {Object.keys(grouped).length} competition{Object.keys(grouped).length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Create Team
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="rounded-full bg-blue-50 p-4">
            <Trophy className="h-8 w-8 text-blue-400" />
          </div>
          <p className="font-medium">No teams yet</p>
          <p className="text-sm text-zinc-500">Create your first team to get started.</p>
          <Button className="mt-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Create Team
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([compId, compTeams]) => {
            const comp = compTeams[0].competition;
            return (
              <div key={compId}>
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="h-4 w-4 text-zinc-400" />
                  <h2 className="font-semibold text-sm">{comp.name}</h2>
                  <span className="text-xs text-zinc-400">({comp.code})</span>
                  <span className="text-xs text-zinc-400 ml-auto">
                    {comp.minTeamSize}–{comp.maxTeamSize} members/team
                  </span>
                </div>
                <div className="space-y-2">
                  {compTeams.map((t) => (
                    <TeamCard
                      key={t.id}
                      team={t}
                      onRename={setRenaming}
                      onDelete={setDeleting}
                      onAddMember={setAddingMember}
                      onRemoveMember={removeMember}
                      onEditTrainers={setEditingTrainers}
                      onUpdated={patchTeam}
                      onJoinEvent={setJoiningEvent}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateTeamDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        contingents={contingents}
        competitions={competitions}
        onCreated={(t) => setTeams((prev) => [...prev, t])}
      />
      <RenameDialog team={renaming} onClose={() => setRenaming(null)} onRenamed={patchTeam} />
      <DeleteConfirmDialog
        team={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => setTeams((prev) => prev.filter((t) => t.id !== id))}
      />
      <AddMemberDialog
        team={addingMember}
        onClose={() => setAddingMember(null)}
        onAdded={(updated) => { patchTeam(updated); setAddingMember(updated); }}
      />
      <TrainerPickerDialog
        team={editingTrainers}
        onClose={() => setEditingTrainers(null)}
        onUpdated={(updated) => { patchTeam(updated); setEditingTrainers(updated); }}
      />
      <JoinEventDialog
        team={joiningEvent}
        onClose={() => setJoiningEvent(null)}
        onJoined={(newEntry) => {
          if (!joiningEvent) return;
          patchTeam({ ...joiningEvent, teamEvents: [...joiningEvent.teamEvents, newEntry] });
          setJoiningEvent(prev => prev ? { ...prev, teamEvents: [...prev.teamEvents, newEntry] } : null);
        }}
      />
    </div>
  );
}
