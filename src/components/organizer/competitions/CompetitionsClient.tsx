"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Loader2, Search, Save, Users, GraduationCap,
  UploadCloud, CheckCircle2, XCircle, Trophy,
  Baby, BookOpen, Award, GraduationCap as CourseIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { OrganizerRole } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompetitionListItem = {
  id: string; code: string; name: string;
  participationType: string;
  theme: { id: string; name: string; color: string | null } | null;
  targetGroups: { targetGroup: { id: string; name: string; schoolLevel: string } }[];
};

type CompetitionDetail = CompetitionListItem & {
  description: string | null;
  themeId: string | null;
  minTeamSize: number; maxTeamSize: number;
  maxParticipantsPerContingent: number; maxTotalParticipants: number;
  eptimEduCourseId: string | null;
  eptimEduCourseTitle: string | null;
  eventCompetitions: LinkedEventRow[];
  _count: { teams: number };
};

type LinkedEventRow = {
  id: string;
  event: { id: string; name: string; slug: string; startDate: string | null; status: string; scope: string };
};

type ThemeOption       = { id: string; name: string; color: string | null };
type TargetGroupOption = { id: string; name: string; schoolLevel: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600", PUBLISHED: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-green-50 text-green-700", COMPLETED: "bg-purple-50 text-purple-700",
  CANCELLED: "bg-red-50 text-red-500",
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

type LevelInfo = { label: string; bg: string; text: string; Icon: LucideIcon };

const LEVEL_INFO: Record<string, LevelInfo> = {
  PRESCHOOL: { label: "Preschool", bg: "bg-amber-100",   text: "text-amber-700",   Icon: Baby         },
  PRIMARY:   { label: "Primary",   bg: "bg-emerald-100", text: "text-emerald-700", Icon: BookOpen      },
  SECONDARY: { label: "Secondary", bg: "bg-blue-100",    text: "text-blue-700",    Icon: GraduationCap },
  HIGHER:    { label: "Higher",    bg: "bg-purple-100",  text: "text-purple-600",  Icon: Award         },
};

function normLevel(schoolLevel: string): string {
  const k = schoolLevel.toUpperCase().replace(/[-\s]/g, "_");
  if (k.includes("PRESCHOOL") || k.includes("PRE_SCHOOL") || k.includes("PRASEKOLAH")) return "PRESCHOOL";
  if (k.includes("PRIMARY")   || k.includes("RENDAH"))                                  return "PRIMARY";
  if (k.includes("SECONDARY") || k.includes("MENENGAH"))                                return "SECONDARY";
  if (k.includes("HIGHER")    || k.includes("POST") || k.includes("UNIVERSITY"))        return "HIGHER";
  return "PRIMARY";
}

// ── Section card ───────────────────────────────────────────────────────────────

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-zinc-50/80">
        <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
        {action}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function SaveBtn({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  if (!dirty) return null;
  return (
    <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-xs gap-1.5">
      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      Simpan
    </Button>
  );
}

// ── Basic info section ─────────────────────────────────────────────────────────

function BasicInfoSection({ competition, canWrite, themes, onSaved }: {
  competition: CompetitionDetail; canWrite: boolean;
  themes: ThemeOption[];
  onSaved: (u: Partial<CompetitionDetail>) => void;
}) {
  const [code,        setCode]        = useState(competition.code);
  const [name,        setName]        = useState(competition.name);
  const [description, setDescription] = useState(competition.description ?? "");
  const [themeId,     setThemeId]     = useState(competition.themeId ?? "");
  const [dirty,  setDirty]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  const mark = () => setDirty(true);

  async function save() {
    if (!code.trim() || !name.trim()) { setErr("Kod dan nama diperlukan."); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/competitions/${competition.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, description, themeId: themeId || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error === "CODE_TAKEN" ? "Kod sudah digunakan." : (j.error ?? "Gagal"));
      const updated = themes.find(t => t.id === themeId) ?? null;
      onSaved({ code, name, description: description || null, themeId: themeId || null, theme: updated ? { id: updated.id, name: updated.name, color: updated.color } : null });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard title="Maklumat Asas" action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Kod *</Label>
          <Input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); mark(); }}
            placeholder="e.g. DIGIT-PRI-2025" className="mt-1 h-8 text-sm font-mono" disabled={!canWrite} />
        </div>
        <div>
          <Label className="text-xs">Nama Pertandingan *</Label>
          <Input value={name} onChange={e => { setName(e.target.value); mark(); }}
            placeholder="e.g. Digit Detective – Primary" className="mt-1 h-8 text-sm" disabled={!canWrite} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Penerangan</Label>
        <textarea value={description} onChange={e => { setDescription(e.target.value); mark(); }} rows={2}
          disabled={!canWrite} placeholder="Penerangan ringkas…"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
      </div>
      <div>
        <Label className="text-xs">Tema</Label>
        <select value={themeId} onChange={e => { setThemeId(e.target.value); mark(); }}
          disabled={!canWrite} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Tiada tema</option>
          {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </SectionCard>
  );
}

// ── Participation section ──────────────────────────────────────────────────────

function ParticipationSection({ competition, canWrite, onSaved }: {
  competition: CompetitionDetail; canWrite: boolean;
  onSaved: (u: Partial<CompetitionDetail>) => void;
}) {
  const [participationType,            setParticipationType]            = useState(competition.participationType);
  const [minTeamSize,                  setMinTeamSize]                  = useState(String(competition.minTeamSize));
  const [maxTeamSize,                  setMaxTeamSize]                  = useState(String(competition.maxTeamSize));
  const [maxParticipantsPerContingent, setMaxParticipantsPerContingent] = useState(String(competition.maxParticipantsPerContingent));
  const [maxTotalParticipants,         setMaxTotalParticipants]         = useState(String(competition.maxTotalParticipants));
  const [dirty,  setDirty]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  const mark = () => setDirty(true);

  async function save() {
    if (participationType === "TEAM" && Number(minTeamSize) > Number(maxTeamSize)) {
      setErr("Saiz pasukan minimum tidak boleh melebihi maksimum."); return;
    }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/competitions/${competition.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participationType,
          minTeamSize: Number(minTeamSize), maxTeamSize: Number(maxTeamSize),
          maxParticipantsPerContingent: Number(maxParticipantsPerContingent),
          maxTotalParticipants: Number(maxTotalParticipants),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal");
      onSaved({ participationType, minTeamSize: Number(minTeamSize), maxTeamSize: Number(maxTeamSize), maxParticipantsPerContingent: Number(maxParticipantsPerContingent), maxTotalParticipants: Number(maxTotalParticipants) });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard title="Penyertaan" action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}>
      <div>
        <Label className="text-xs">Jenis Penyertaan</Label>
        <div className="flex rounded-lg border overflow-hidden w-fit mt-1">
          {(["INDIVIDUAL", "TEAM"] as const).map(t => (
            <button key={t} type="button" onClick={() => { setParticipationType(t); mark(); }} disabled={!canWrite}
              className={`flex items-center gap-2 px-5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                participationType === t ? "bg-[#085782] text-white" : "bg-white text-zinc-500 hover:bg-zinc-50"
              }`}>
              {t === "TEAM" ? <Users className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
              {t === "TEAM" ? "Pasukan" : "Individu"}
            </button>
          ))}
        </div>
      </div>
      {participationType === "TEAM" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Saiz Pasukan Min</Label>
            <Input type="number" min={1} value={minTeamSize} onChange={e => { setMinTeamSize(e.target.value); mark(); }}
              className="mt-1 h-8 text-sm" disabled={!canWrite} />
          </div>
          <div>
            <Label className="text-xs">Saiz Pasukan Maks</Label>
            <Input type="number" min={1} value={maxTeamSize} onChange={e => { setMaxTeamSize(e.target.value); mark(); }}
              className="mt-1 h-8 text-sm" disabled={!canWrite} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Maks per Kontijen</Label>
          <Input type="number" min={0} value={maxParticipantsPerContingent}
            onChange={e => { setMaxParticipantsPerContingent(e.target.value); mark(); }}
            className="mt-1 h-8 text-sm" disabled={!canWrite} />
          <p className="text-[10px] text-zinc-400 mt-1">0 = tanpa had</p>
        </div>
        <div>
          <Label className="text-xs">Maks Jumlah Peserta</Label>
          <Input type="number" min={0} value={maxTotalParticipants}
            onChange={e => { setMaxTotalParticipants(e.target.value); mark(); }}
            className="mt-1 h-8 text-sm" disabled={!canWrite} />
          <p className="text-[10px] text-zinc-400 mt-1">0 = tanpa had</p>
        </div>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </SectionCard>
  );
}

// ── Target groups section ─────────────────────────────────────────────────────

function TargetGroupsSection({ competition, canWrite, targetGroups, onSaved }: {
  competition: CompetitionDetail; canWrite: boolean;
  targetGroups: TargetGroupOption[];
  onSaved: (u: Partial<CompetitionDetail>) => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    competition.targetGroups.map(t => t.targetGroup.id)
  );
  const [dirty,  setDirty]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  function toggle(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    setDirty(true);
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/competitions/${competition.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroupIds: selected }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal");
      const newTgs = targetGroups
        .filter(tg => selected.includes(tg.id))
        .map(tg => ({ targetGroup: { id: tg.id, name: tg.name, schoolLevel: tg.schoolLevel } }));
      onSaved({ targetGroups: newTgs });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard title="Kumpulan Sasaran" action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}>
      {targetGroups.length === 0 && (
        <p className="text-sm text-zinc-400 italic">Tiada kumpulan sasaran ditakrifkan.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {targetGroups.map(tg => {
          const checked = selected.includes(tg.id);
          return (
            <label key={tg.id} className={cn(
              "flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
              !canWrite && "cursor-not-allowed opacity-70",
              checked ? "border-[#085782] bg-blue-50" : "border-zinc-200 hover:border-zinc-300"
            )}>
              <input type="checkbox" checked={checked} disabled={!canWrite}
                onChange={() => canWrite && toggle(tg.id)} className="mt-0.5 rounded" />
              <div>
                <p className="text-sm font-medium">{tg.name}</p>
                <p className="text-xs text-zinc-400">{tg.schoolLevel}</p>
              </div>
            </label>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-zinc-500">{selected.length} kumpulan dipilih</p>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </SectionCard>
  );
}

// ── EptimEdu section ──────────────────────────────────────────────────────────

type EduCourse = { id: string; title: string; totalMinutes: number };

function EptimEduSection({ competition, canWrite, onSaved }: {
  competition: CompetitionDetail; canWrite: boolean;
  onSaved: (u: Partial<CompetitionDetail>) => void;
}) {
  const [courseId,    setCourseId]    = useState(competition.eptimEduCourseId ?? "");
  const [courses,     setCourses]     = useState<EduCourse[]>([]);
  const [loadingCrs,  setLoadingCrs]  = useState(false);
  const [noApiKey,    setNoApiKey]    = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  useEffect(() => {
    setLoadingCrs(true);
    fetch("/api/v2/organizer/eptimedu/courses")
      .then(r => r.json())
      .then(j => {
        if (j.error === "EPTIMEDU_API_KEY not found") { setNoApiKey(true); return; }
        setCourses(j.data ?? []);
      })
      .catch(() => setErr("Failed to load courses"))
      .finally(() => setLoadingCrs(false));
  }, []);

  async function save() {
    setSaving(true); setErr("");
    const selected = courses.find(c => c.id === courseId);
    try {
      const res = await fetch(`/api/v2/organizer/competitions/${competition.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eptimEduCourseId:    courseId || null,
          eptimEduCourseTitle: selected?.title ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal");
      onSaved({ eptimEduCourseId: courseId || null, eptimEduCourseTitle: selected?.title ?? null });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard title="Bengkel MT / Learning" action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}>
      {noApiKey ? (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 font-mono">
          EPTIMEDU_API_KEY not found
        </p>
      ) : loadingCrs ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading courses…
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-zinc-500 font-medium block mb-1">Linked EptimEdu Course</label>
            <select
              value={courseId}
              onChange={e => { setCourseId(e.target.value); setDirty(true); }}
              disabled={!canWrite}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— No course attached —</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          {competition.eptimEduCourseTitle && !dirty && (
            <p className="flex items-center gap-1.5 text-xs text-blue-700">
              <CourseIcon className="h-3.5 w-3.5" />
              {competition.eptimEduCourseTitle}
            </p>
          )}
          <p className="text-[11px] text-zinc-400">
            Teams that join Bengkel MT will be automatically enrolled in this course.
          </p>
        </div>
      )}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </SectionCard>
  );
}

// ── Linked events section ──────────────────────────────────────────────────────

function LinkedEventsSection({ competition }: { competition: CompetitionDetail }) {
  const links = competition.eventCompetitions;

  return (
    <SectionCard title={`Acara Berkaitan (${links.length})`}>
      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-zinc-400">
          <Trophy className="h-6 w-6 text-zinc-200" />
          <p className="text-xs">Pertandingan ini belum dikaitkan dengan mana-mana acara.</p>
        </div>
      ) : (
        <div className="divide-y">
          {links.map(link => (
            <div key={link.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{link.event.name}</p>
                <p className="text-xs font-mono text-zinc-400">{link.event.slug}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", STATUS_STYLES[link.event.status] ?? "bg-zinc-100 text-zinc-600")}>
                    {link.event.status}
                  </span>
                  {link.event.startDate && (
                    <span className="text-[10px] text-zinc-400">{fmtDate(link.event.startDate)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CompetitionsClient({ role }: { role: OrganizerRole }) {
  const canWrite = ["SUPER_ADMIN", "ADMIN"].includes(role);

  const [competitions, setCompetitions] = useState<CompetitionListItem[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [q,            setQ]            = useState("");
  const [themeFilter,  setThemeFilter]  = useState("");
  const [loading,      setLoading]      = useState(false);

  const [selected,      setSelected]      = useState<CompetitionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [themes,       setThemes]       = useState<ThemeOption[]>([]);
  const [targetGroups, setTargetGroups] = useState<TargetGroupOption[]>([]);

  const [newOpen,   setNewOpen]   = useState(false);
  const [newCode,   setNewCode]   = useState("");
  const [newName,   setNewName]   = useState("");
  const [creating,  setCreating]  = useState(false);
  const [createErr, setCreateErr] = useState("");

  const [pushing,      setPushing]      = useState(false);
  const [pushOk,       setPushOk]       = useState(false);
  const [pushFail,     setPushFail]     = useState(false);
  const [pushAllState, setPushAllState] = useState<"idle" | "running" | "done">("idle");
  const [pushProgress, setPushProgress] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
      if (themeFilter) p.set("themeId", themeFilter);
      const res = await fetch(`/api/v2/organizer/competitions?${p}`);
      const j   = await res.json();
      setCompetitions(j.data ?? []);
      setTotal(j.total ?? 0);
    } finally { setLoading(false); }
  }, [page, q, themeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/themes?pageSize=100").then(r => r.json()).then(j => setThemes(j.data ?? []));
    fetch("/api/v2/organizer/reference-data/target-groups?pageSize=100").then(r => r.json()).then(j => setTargetGroups(j.data ?? []));
  }, []);

  async function selectCompetition(item: CompetitionListItem) {
    setLoadingDetail(true);
    setPushOk(false); setPushFail(false);
    try {
      const res = await fetch(`/api/v2/organizer/competitions/${item.id}`);
      const j   = await res.json();
      setSelected(j.data);
    } finally { setLoadingDetail(false); }
  }

  async function createCompetition() {
    if (!newCode.trim() || !newName.trim()) return;
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch("/api/v2/organizer/competitions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), name: newName.trim(), participationType: "INDIVIDUAL", minTeamSize: 1, maxTeamSize: 1, maxParticipantsPerContingent: 0, maxTotalParticipants: 0 }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error === "CODE_TAKEN" ? "Kod sudah digunakan." : (j.error ?? "Gagal"));
      setNewOpen(false); setNewCode(""); setNewName(""); setCreateErr("");
      await load();
      selectCompetition(j.data);
    } catch (e) { setCreateErr(e instanceof Error ? e.message : "Gagal mencipta."); }
    finally { setCreating(false); }
  }

  async function deleteCompetition(item: CompetitionListItem) {
    if (!confirm(`Padam "${item.name}"?`)) return;
    const res = await fetch(`/api/v2/organizer/competitions/${item.id}`, { method: "DELETE" });
    if (!res.ok) { alert("Gagal memadam. Pastikan tiada data berkaitan."); return; }
    if (selected?.id === item.id) setSelected(null);
    load();
  }

  function handleSectionSaved(updated: Partial<CompetitionDetail>) {
    setSelected(s => s ? { ...s, ...updated } : s);
    setCompetitions(prev => prev.map(c => c.id === selected?.id ? { ...c, ...updated } as CompetitionListItem : c));
  }

  async function pushToKb() {
    if (!selected) return;
    setPushing(true); setPushOk(false); setPushFail(false);
    try {
      const res = await fetch("/api/v2/organizer/knowledge-base/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "competition", entityId: selected.id }),
      });
      if (res.ok) setPushOk(true); else setPushFail(true);
    } catch { setPushFail(true); }
    finally { setPushing(false); }
  }

  async function pushAll() {
    setPushAllState("running"); setPushProgress({ done: 0, total: 0 });
    try {
      const res  = await fetch("/api/v2/organizer/competitions?page=1&pageSize=1000");
      const json = await res.json();
      const ids: string[] = (json.data ?? []).map((c: CompetitionListItem) => c.id);
      setPushProgress({ done: 0, total: ids.length });
      let done = 0;
      for (const id of ids) {
        await fetch("/api/v2/organizer/knowledge-base/push", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "competition", entityId: id }),
        });
        setPushProgress({ done: ++done, total: ids.length });
      }
      setPushAllState("done");
    } catch { setPushAllState("idle"); }
  }

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r bg-white">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="text-sm font-semibold flex-1">Pertandingan</span>
          <Button variant="outline" size="sm" onClick={pushAll} disabled={pushAllState === "running"}
            className="h-6 text-[10px] gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-2">
            {pushAllState === "running"
              ? <><Loader2 className="h-3 w-3 animate-spin" />{pushProgress ? `${pushProgress.done}/${pushProgress.total}` : "…"}</>
              : pushAllState === "done" ? <><CheckCircle2 className="h-3 w-3" />Pushed</>
              : <><UploadCloud className="h-3 w-3" />Push All</>}
          </Button>
          {canWrite && (
            <button onClick={() => setNewOpen(v => !v)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {newOpen && (
          <div className="px-4 py-3 border-b space-y-2 bg-zinc-50">
            <div>
              <Label className="text-[10px]">Kod *</Label>
              <Input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
                placeholder="e.g. DIGIT-PRI" className="mt-1 h-7 text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[10px]">Nama *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Nama pertandingan" className="mt-1 h-7 text-xs" />
            </div>
            {createErr && <p className="text-[10px] text-red-500">{createErr}</p>}
            <div className="flex gap-1.5">
              <Button size="sm" onClick={createCompetition} disabled={creating || !newCode.trim() || !newName.trim()} className="h-7 text-xs px-3">
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cipta"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setNewOpen(false); setCreateErr(""); }} className="h-7 text-xs px-3">Batal</Button>
            </div>
          </div>
        )}

        <div className="px-3 py-2 border-b space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
            <Input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Cari nama atau kod…" className="pl-8 h-7 text-xs" />
          </div>
          <select value={themeFilter} onChange={e => { setThemeFilter(e.target.value); setPage(1); }}
            className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">Semua tema</option>
            <option value="__none__">— Tiada tema</option>
            {themes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Memuatkan…</p>
          ) : competitions.length === 0 ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Tiada pertandingan ditemui.</p>
          ) : competitions.map(c => {
            const uniqueLevels = [...new Set(c.targetGroups.map(t => normLevel(t.targetGroup.schoolLevel)))];
            return (
            <div key={c.id}
              className={cn(
                "group flex cursor-pointer border-b last:border-0 transition-colors",
                selected?.id === c.id ? "bg-blue-50" : "hover:bg-zinc-50"
              )}
              onClick={() => selectCompetition(c)}
            >
              <div className="w-2.5 shrink-0 self-stretch"
                style={{ background: c.theme?.color ?? "#e4e4e7" }} />

              <div className="flex-1 min-w-0 px-3 py-2.5">
                <p className="text-xs truncate">
                  <span className={cn("font-mono font-semibold", selected?.id === c.id ? "text-blue-600" : "text-zinc-500")}>{c.code}</span>
                  <span className="text-zinc-300 mx-1">—</span>
                  <span className={cn("font-medium", selected?.id === c.id ? "text-blue-700" : "text-zinc-800")}>{c.name}</span>
                </p>
                {uniqueLevels.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {uniqueLevels.map(lk => {
                      const info = LEVEL_INFO[lk] ?? { label: lk, bg: "bg-zinc-100", text: "text-zinc-500", Icon: BookOpen };
                      return (
                        <span key={lk} className={cn("flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium", info.bg, info.text)}>
                          <info.Icon className="h-2.5 w-2.5 shrink-0" />
                          {info.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {canWrite && (
                <button onClick={e => { e.stopPropagation(); deleteCompetition(c); }}
                  className="opacity-0 group-hover:opacity-100 p-1 mr-2 self-center rounded hover:bg-red-50 shrink-0 transition-opacity">
                  <Trash2 className="h-3 w-3 text-red-400" />
                </button>
              )}
            </div>
            );
          })}
        </div>

        {pages > 1 && (
          <div className="border-t px-3 py-2 flex items-center justify-between text-[10px] text-zinc-400">
            <span>{total} pertandingan</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-5 w-5 flex items-center justify-center rounded border hover:bg-zinc-50 disabled:opacity-30 text-xs">‹</button>
              <span className="px-1">{page}/{pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="h-5 w-5 flex items-center justify-center rounded border hover:bg-zinc-50 disabled:opacity-30 text-xs">›</button>
            </div>
          </div>
        )}
      </aside>

      {/* ── Right panel ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-50">
        {!selected && !loadingDetail && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
            <div className="rounded-full bg-zinc-100 p-4"><Trophy className="h-8 w-8 text-zinc-300" /></div>
            <p className="text-sm">Pilih pertandingan untuk melihat dan mengedit maklumat.</p>
          </div>
        )}
        {loadingDetail && (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-zinc-300" /></div>
        )}
        {selected && !loadingDetail && (
          <div key={selected.id} className="flex-1 overflow-y-auto p-6 space-y-5 max-w-3xl mx-auto w-full">
            <div className="flex items-center justify-end">
              <button onClick={pushToKb} disabled={pushing}
                className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">
                {pushing    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : pushOk    ? <CheckCircle2 className="h-3.5 w-3.5" />
                : pushFail  ? <XCircle className="h-3.5 w-3.5 text-red-400" />
                :              <UploadCloud className="h-3.5 w-3.5" />}
                Push to Knowledge Base
              </button>
            </div>
            <BasicInfoSection    competition={selected} canWrite={canWrite} themes={themes}        onSaved={handleSectionSaved} />
            <ParticipationSection competition={selected} canWrite={canWrite}                        onSaved={handleSectionSaved} />
            <TargetGroupsSection competition={selected} canWrite={canWrite} targetGroups={targetGroups} onSaved={handleSectionSaved} />
            <EptimEduSection     competition={selected} canWrite={canWrite}                        onSaved={handleSectionSaved} />
            <LinkedEventsSection competition={selected} />
          </div>
        )}
      </main>
    </div>
  );
}
