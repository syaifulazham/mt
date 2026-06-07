"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, Loader2, Search, Save, Users, GraduationCap,
  UploadCloud, CheckCircle2, XCircle, Trophy,
  Baby, BookOpen, Award, GraduationCap as CourseIcon, Sparkles,
  Maximize2, Minimize2, FileText, Upload, X, Download,
} from "lucide-react";
import { AIImportDialog } from "./AIImportDialog";
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
  docs: CompetitionDoc[];
  _count: { teams: number };
};

type LinkedEventRow = {
  id: string;
  event: { id: string; name: string; slug: string; startDate: string | null; status: string; scope: string };
};

type CompetitionDoc = {
  id: string;
  name: string;
  url: string;
  key: string;
  size: number | null;
  uploadedAt: string;
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
  KINDERGARTEN: { label: "Kindergarten", bg: "bg-pink-100",    text: "text-pink-700",    Icon: Baby         },
  PRESCHOOL:    { label: "Preschool",    bg: "bg-amber-100",   text: "text-amber-700",   Icon: Baby         },
  PRIMARY:      { label: "Primary",      bg: "bg-emerald-100", text: "text-emerald-700", Icon: BookOpen      },
  SECONDARY:    { label: "Secondary",    bg: "bg-blue-100",    text: "text-blue-700",    Icon: GraduationCap },
  HIGHER:       { label: "Higher",       bg: "bg-purple-100",  text: "text-purple-600",  Icon: Award         },
  YOUTH:        { label: "Youth",        bg: "bg-orange-100",  text: "text-orange-700",  Icon: Users         },
};

function normLevel(schoolLevel: string): string {
  const k = schoolLevel.toUpperCase().replace(/[-\s]/g, "_");
  if (k === "KINDERGARTEN" || k.includes("TADIKA"))                                       return "KINDERGARTEN";
  if (k.includes("PRESCHOOL") || k.includes("PRE_SCHOOL") || k.includes("PRASEKOLAH"))   return "PRESCHOOL";
  if (k.includes("PRIMARY")   || k.includes("RENDAH"))                                    return "PRIMARY";
  if (k.includes("SECONDARY") || k.includes("MENENGAH"))                                  return "SECONDARY";
  if (k.includes("HIGHER")    || k.includes("POST") || k.includes("UNIVERSITY"))          return "HIGHER";
  if (k.includes("YOUTH")     || k.includes("BELIA") || k.includes("TERBUKA"))            return "YOUTH";
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
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoadingCrs(true);
    /* eslint-enable react-hooks/set-state-in-effect */
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

// ── Concept paper section ─────────────────────────────────────────────────────

function ConceptPaperSection({
  competition,
  canWrite,
  onDocsChanged,
}: {
  competition: CompetitionDetail;
  canWrite: boolean;
  onDocsChanged: (docs: CompetitionDoc[]) => void;
}) {
  const [docs, setDocs]         = useState<CompetitionDoc[]>(competition.docs ?? []);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError]       = useState("");
  const inputRef                = useRef<HTMLInputElement>(null);

  function fmtSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function upload(files: FileList | File[]) {
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (!pdfs.length) { setError("Only PDF files are accepted."); return; }
    setUploading(true); setError("");
    const form = new FormData();
    pdfs.forEach((f) => form.append("files", f));
    const res = await fetch(`/api/v2/organizer/competitions/${competition.id}/docs`, { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "Upload failed."); return; }
    const saved: CompetitionDoc[] = await res.json();
    const updated = [...saved, ...docs];
    setDocs(updated);
    onDocsChanged(updated);
  }

  async function handleDelete(docId: string) {
    setDeleting(docId);
    await fetch(`/api/v2/organizer/competitions/${competition.id}/docs/${docId}`, { method: "DELETE" });
    const updated = docs.filter((d) => d.id !== docId);
    setDocs(updated);
    setDeleting(null);
    onDocsChanged(updated);
  }

  const uploadBtn = canWrite && (
    <button
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-800 px-2 py-1 rounded hover:bg-sky-50 transition-colors disabled:opacity-50"
    >
      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
      Upload PDF
    </button>
  );

  return (
    <SectionCard title={`Kertas Kerja Konsep (${docs.length})`} action={uploadBtn}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />

      {/* Drop zone — shown when empty */}
      {docs.length === 0 && canWrite && (
        <div
          className={cn(
            "rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 cursor-pointer transition-colors",
            isDragging ? "border-sky-400 bg-sky-50" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); upload(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
        >
          {uploading
            ? <Loader2 className="h-6 w-6 animate-spin text-sky-400 mb-2" />
            : <FileText className="h-6 w-6 text-zinc-300 mb-2" />}
          <p className="text-xs text-zinc-500 font-medium">
            {uploading ? "Uploading…" : "Drop PDF files here or click to browse"}
          </p>
        </div>
      )}

      {/* Drop overlay when docs exist */}
      {docs.length > 0 && canWrite && (
        <div
          className={cn(
            "rounded-lg border-2 border-dashed transition-colors mb-3",
            isDragging ? "border-sky-400 bg-sky-50 p-3" : "border-transparent p-0"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); upload(e.dataTransfer.files); }}
        >
          {isDragging && (
            <p className="text-xs text-sky-600 text-center py-1">Release to upload PDFs</p>
          )}
        </div>
      )}

      {/* Doc list */}
      {docs.length > 0 && (
        <div className="divide-y">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="h-8 w-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{doc.name}</p>
                <p className="text-[11px] text-zinc-400">
                  {fmtSize(doc.size)}{doc.size ? " · " : ""}
                  {new Date(doc.uploadedAt).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                  title="Open PDF"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                {canWrite && (
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deleting === doc.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
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

  const [expanded,     setExpanded]     = useState(false);

  const [newOpen,      setNewOpen]      = useState(false);
  const [newCode,      setNewCode]      = useState("");
  const [newName,      setNewName]      = useState("");
  const [creating,     setCreating]     = useState(false);
  const [createErr,    setCreateErr]    = useState("");
  const [aiImportOpen, setAiImportOpen] = useState(false);

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // ── Shared toolbar fragments ───────────────────────────────────────────────

  const toolbarActions = (
    <>
      <Button variant="outline" size="sm" onClick={pushAll} disabled={pushAllState === "running"}
        className="h-6 text-[10px] gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-2">
        {pushAllState === "running"
          ? <><Loader2 className="h-3 w-3 animate-spin" />{pushProgress ? `${pushProgress.done}/${pushProgress.total}` : "…"}</>
          : pushAllState === "done" ? <><CheckCircle2 className="h-3 w-3" />Pushed</>
          : <><UploadCloud className="h-3 w-3" />Push All</>}
      </Button>
      {canWrite && (
        <>
          <button onClick={() => setAiImportOpen(true)} title="Import dengan AI"
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-violet-100 text-violet-500">
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setNewOpen(v => !v)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </>
  );

  const createForm = newOpen && (
    <div className="px-4 py-3 border-b space-y-2 bg-zinc-50">
      <div className={expanded ? "grid grid-cols-2 gap-2" : ""}>
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
      </div>
      {createErr && <p className="text-[10px] text-red-500">{createErr}</p>}
      <div className="flex gap-1.5">
        <Button size="sm" onClick={createCompetition} disabled={creating || !newCode.trim() || !newName.trim()} className="h-7 text-xs px-3">
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cipta"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setNewOpen(false); setCreateErr(""); }} className="h-7 text-xs px-3">Batal</Button>
      </div>
    </div>
  );

  // ── Expanded (full-width table) view ───────────────────────────────────────

  if (expanded) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-white">

        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold mr-1">Pertandingan</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-400" />
            <Input value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Cari nama atau kod…" className="pl-8 h-7 text-xs w-52" />
          </div>
          <select value={themeFilter} onChange={e => { setThemeFilter(e.target.value); setPage(1); }}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">Semua tema</option>
            <option value="__none__">— Tiada tema</option>
            {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex-1" />
          {toolbarActions}
          <button onClick={() => setExpanded(false)} title="Collapse list"
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500">
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {createForm}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-zinc-50 border-b z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 w-6"></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Kod</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Nama Pertandingan</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Tema</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Kumpulan Sasaran</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Penyertaan</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Saiz Pasukan</th>
                {canWrite && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={canWrite ? 8 : 7} className="px-3 py-10 text-center text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td></tr>
              )}
              {!loading && competitions.length === 0 && (
                <tr><td colSpan={canWrite ? 8 : 7} className="px-3 py-10 text-center text-zinc-400 text-xs">
                  Tiada pertandingan ditemui.
                </td></tr>
              )}
              {!loading && competitions.map(c => {
                const uniqueLevels = [...new Set(c.targetGroups.map(t => normLevel(t.targetGroup.schoolLevel)))];
                const tgNames = c.targetGroups.map(t => t.targetGroup.name);
                return (
                  <tr key={c.id}
                    className="border-b last:border-0 hover:bg-blue-50/40 cursor-pointer group transition-colors"
                    onClick={() => { selectCompetition(c); setExpanded(false); }}
                  >
                    {/* Theme colour bar */}
                    <td className="px-0 py-0">
                      <div className="w-1.5 h-full min-h-[40px]" style={{ background: c.theme?.color ?? "#e4e4e7" }} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-zinc-600 whitespace-nowrap">
                      {c.code}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-zinc-800 max-w-xs">
                      <span className="line-clamp-2 leading-snug">{c.name}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.theme ? (
                        <span className="flex items-center gap-1.5 text-xs text-zinc-700">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 inline-block"
                            style={{ background: c.theme.color ?? "#e4e4e7" }} />
                          <span className="truncate max-w-[140px]" title={c.theme.name}>{c.theme.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {uniqueLevels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {uniqueLevels.map(lk => {
                            const info = LEVEL_INFO[lk] ?? { label: lk, bg: "bg-zinc-100", text: "text-zinc-500", Icon: BookOpen };
                            return (
                              <span key={lk} className={cn("flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium", info.bg, info.text)}>
                                <info.Icon className="h-2.5 w-2.5 shrink-0" />{info.label}
                              </span>
                            );
                          })}
                          {tgNames.length > 0 && (
                            <span className="text-[9px] text-zinc-400 self-center" title={tgNames.join(", ")}>
                              {tgNames.length} kumpulan
                            </span>
                          )}
                        </div>
                      ) : <span className="text-xs text-zinc-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium w-fit whitespace-nowrap",
                        c.participationType === "TEAM" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {c.participationType === "TEAM"
                          ? <><Users className="h-3 w-3 shrink-0" />Pasukan</>
                          : <><GraduationCap className="h-3 w-3 shrink-0" />Individu</>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                      {c.participationType === "TEAM" ? `—` : "—"}
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); deleteCompetition(c); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-opacity">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t px-4 py-2 flex items-center justify-between text-[10px] text-zinc-400 bg-white">
          <span>{total} pertandingan</span>
          {pages > 1 && (
            <div className="flex gap-1 items-center">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="h-5 w-5 flex items-center justify-center rounded border hover:bg-zinc-50 disabled:opacity-30 text-xs">‹</button>
              <span className="px-1">{page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="h-5 w-5 flex items-center justify-center rounded border hover:bg-zinc-50 disabled:opacity-30 text-xs">›</button>
            </div>
          )}
        </div>

        {aiImportOpen && (
          <AIImportDialog onClose={() => setAiImportOpen(false)} onImported={() => { load(); }} />
        )}
      </div>
    );
  }

  // ── Split (panel + detail) view ────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r bg-white">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="text-sm font-semibold flex-1">Pertandingan</span>
          {toolbarActions}
          <button onClick={() => setExpanded(true)} title="Expand full list"
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {createForm}

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
            <ConceptPaperSection competition={selected} canWrite={canWrite}                        onDocsChanged={(docs) => handleSectionSaved({ docs })} />
            <LinkedEventsSection competition={selected} />
          </div>
        )}
      </main>

      {aiImportOpen && (
        <AIImportDialog
          onClose={() => setAiImportOpen(false)}
          onImported={() => { load(); }}
        />
      )}
    </div>
  );
}
