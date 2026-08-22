"use client";

import { useState, useEffect, useCallback, lazy, Suspense, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Loader2, Search, Save, Sparkles, Navigation,
  UploadCloud, CheckCircle2, XCircle, Trophy, User, Phone,
  ArrowLeft, Check, CalendarDays, BookOpen, Link2, Unlink, AlertCircle, X, GitMerge, Settings, Globe2,
  Gavel, Copy, Network,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteDialog } from "@/components/organizer/reference-data/DeleteDialog";
import { EventFlowGraph } from "@/components/organizer/events/EventFlowGraph";
import { cn } from "@/lib/utils";
import type { OrganizerRole } from "@/types";

const MapPicker = lazy(() =>
  import("./MapPicker").then((m) => ({ default: m.MapPicker }))
);

// ── Types ──────────────────────────────────────────────────────────────────────

type EventListItem = {
  id: string; name: string; slug: string; scope: string; status: string;
  startDate: string | null;
  state: { id: string; name: string } | null;
  zone:  { id: string; name: string } | null;
};

type PrerequisiteEvent = { id: string; name: string; slug: string; status: string };

type EventDetail = EventListItem & {
  description: string | null;
  stateId: string | null; zoneId: string | null;
  endDate: string | null;
  venue: string | null; address: string | null; city: string | null;
  latitude: number | null; longitude: number | null;
  registrationStart: string | null; registrationEnd: string | null;
  prerequisites: { prerequisite: PrerequisiteEvent }[];
  needManagerAcceptance: boolean;
  walkInUniqueParticipation: boolean;
};

type StateOption = { id: string; name: string };
type ZoneOption  = { id: string; name: string };

type EventCompLink = {
  id: string; competitionId: string;
  picName: string | null; picContact: string | null; maxTeams: number;
  eptimEduCourseId:    string | null;
  eptimEduCourseTitle: string | null;
  competition: {
    id: string; code: string; name: string;
    participationType: string; minTeamSize: number; maxTeamSize: number;
    targetGroups: { targetGroup: { id: string; name: string } }[];
    _count: { teams: number };
  };
};

type EduCourse = {
  id: string; title: string; status: string; level: string | null;
  instructor: string | null; enrolmentCount: number; totalMinutes: number;
};

type CompSearch = {
  id: string; code: string; name: string; participationType: string;
  targetGroups: { targetGroup: { id: string; name: string } }[];
  theme?: { id: string; name: string; color: string } | null;
};

type JudgingTemplateSummary = {
  id: string; name: string; code: string; description: string | null;
  _count: { criterions: number };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SCOPE_OPTIONS = [
  { value: "NATIONAL",        label: "National",        needsState: false, needsZone: false },
  { value: "STATE",           label: "State",           needsState: true,  needsZone: false },
  { value: "ZONE",            label: "Zone",            needsState: false, needsZone: true  },
  { value: "OPEN",            label: "Open",            needsState: false, needsZone: false },
  { value: "ONLINE_NATIONAL", label: "Online National", needsState: false, needsZone: false },
  { value: "ONLINE_STATE",    label: "Online State",    needsState: true,  needsZone: false },
  { value: "ONLINE_ZONE",     label: "Online Zone",     needsState: false, needsZone: true  },
  { value: "ONLINE_OPEN",     label: "Online Open",     needsState: false, needsZone: false },
] as const;

const STATUSES = ["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED", "ARCHIVE"] as const;


function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
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

// ── Info section ───────────────────────────────────────────────────────────────

function InfoSection({ event, canWrite, states, zones, onSaved }: {
  event: EventDetail; canWrite: boolean;
  states: StateOption[]; zones: ZoneOption[];
  onSaved: (u: Partial<EventDetail>) => void;
}) {
  const [name,        setName]        = useState(event.name);
  const [slug,        setSlug]        = useState(event.slug);
  const [scope,       setScope]       = useState(event.scope);
  const [stateId,     setStateId]     = useState(event.stateId ?? "");
  const [zoneId,      setZoneId]      = useState(event.zoneId ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [status,      setStatus]      = useState(event.status);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const mark = () => setDirty(true);

  const cfg = SCOPE_OPTIONS.find(s => s.value === scope) ?? SCOPE_OPTIONS[0];

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, scope, stateId: stateId || null, zoneId: zoneId || null, description, status }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error === "SLUG_TAKEN" ? "Slug sudah digunakan." : (j.error ?? "Gagal"));
      onSaved({ name, slug, scope, stateId: stateId || null, zoneId: zoneId || null, description, status });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard title="Maklumat Acara" action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Nama Acara *</Label>
          <Input value={name} onChange={e => { setName(e.target.value); mark(); }} className="mt-1 h-8 text-sm" disabled={!canWrite} />
        </div>
        <div>
          <Label className="text-xs">Slug (Kod) *</Label>
          <Input value={slug} onChange={e => { setSlug(slugify(e.target.value)); mark(); }} className="mt-1 h-8 text-sm font-mono" disabled={!canWrite} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Skop</Label>
          <select value={scope} onChange={e => { setScope(e.target.value); setStateId(""); setZoneId(""); mark(); }}
            disabled={!canWrite} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
            {SCOPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {cfg.needsState && (
          <div>
            <Label className="text-xs">Negeri</Label>
            <select value={stateId} onChange={e => { setStateId(e.target.value); mark(); }}
              disabled={!canWrite} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Pilih negeri</option>
              {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {cfg.needsZone && (
          <div>
            <Label className="text-xs">Zon</Label>
            <select value={zoneId} onChange={e => { setZoneId(e.target.value); mark(); }}
              disabled={!canWrite} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Pilih zon</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <Label className="text-xs">Status</Label>
          <select value={status} onChange={e => { setStatus(e.target.value); mark(); }}
            disabled={!canWrite} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Penerangan</Label>
        <textarea value={description} onChange={e => { setDescription(e.target.value); mark(); }} rows={2} disabled={!canWrite}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </SectionCard>
  );
}

// ── Dates section ──────────────────────────────────────────────────────────────

function DatesSection({ event, canWrite, onSaved }: {
  event: EventDetail; canWrite: boolean; onSaved: (u: Partial<EventDetail>) => void;
}) {
  const [startDate, setStartDate] = useState(event.startDate?.slice(0, 10) ?? "");
  const [endDate,   setEndDate]   = useState(event.endDate?.slice(0, 10) ?? "");
  const [regStart,  setRegStart]  = useState(event.registrationStart?.slice(0, 10) ?? "");
  const [regEnd,    setRegEnd]    = useState(event.registrationEnd?.slice(0, 10) ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const mark = () => setDirty(true);

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: startDate || null, endDate: endDate || null, registrationStart: regStart || null, registrationEnd: regEnd || null }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan.");
      onSaved({ startDate: startDate || null, endDate: endDate || null, registrationStart: regStart || null, registrationEnd: regEnd || null });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard title="Tarikh" action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}>
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">Tarikh Acara</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Mula</Label><Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); mark(); }} className="mt-1 h-8 text-sm" disabled={!canWrite} /></div>
          <div><Label className="text-xs">Tamat</Label><Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); mark(); }} className="mt-1 h-8 text-sm" disabled={!canWrite} /></div>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">Tempoh Pendaftaran</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Dibuka</Label><Input type="date" value={regStart} onChange={e => { setRegStart(e.target.value); mark(); }} className="mt-1 h-8 text-sm" disabled={!canWrite} /></div>
          <div><Label className="text-xs">Ditutup</Label><Input type="date" value={regEnd} onChange={e => { setRegEnd(e.target.value); mark(); }} className="mt-1 h-8 text-sm" disabled={!canWrite} /></div>
        </div>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </SectionCard>
  );
}

// ── Venue section ──────────────────────────────────────────────────────────────

function VenueSection({ event, canWrite, onSaved }: {
  event: EventDetail; canWrite: boolean; onSaved: (u: Partial<EventDetail>) => void;
}) {
  const [venue,     setVenue]     = useState(event.venue ?? "");
  const [address,   setAddress]   = useState(event.address ?? "");
  const [city,      setCity]      = useState(event.city ?? "");
  const [latitude,  setLatitude]  = useState<number | null>(event.latitude);
  const [longitude, setLongitude] = useState<number | null>(event.longitude);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [showMap, setShowMap] = useState(!!(event.latitude && event.longitude));
  const mark = () => setDirty(true);

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue: venue || null, address: address || null, city: city || null, latitude, longitude }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan.");
      onSaved({ venue: venue || null, address: address || null, city: city || null, latitude, longitude });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  async function aiFind() {
    if (!venue && !address) return;
    setAiLoading(true); setAiErr("");
    try {
      const res = await fetch("/api/v2/organizer/events/ai-location", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue, address }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail ?? j.error ?? "AI location failed");
      const loc = j.data;
      if (loc.latitude)         setLatitude(loc.latitude);
      if (loc.longitude)        setLongitude(loc.longitude);
      if (loc.city)             setCity(loc.city);
      if (loc.formattedAddress) setAddress(loc.formattedAddress);
      if (loc.latitude && loc.longitude) setShowMap(true);
      setDirty(true);
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setAiLoading(false); }
  }

  return (
    <SectionCard title="Lokasi &amp; Tempat" action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">Masukkan tempat atau alamat, kemudian guna AI untuk cari koordinat.</p>
        <Button type="button" variant="outline" size="sm" onClick={aiFind}
          disabled={aiLoading || (!venue && !address)}
          className="gap-1.5 text-xs h-7 border-violet-200 text-violet-700 hover:bg-violet-50 shrink-0 ml-3">
          {aiLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Mencari…</> : <><Sparkles className="h-3 w-3" /> Find on Map with AI</>}
        </Button>
      </div>
      {aiErr && <p className="text-xs text-red-500">{aiErr}</p>}
      <div>
        <Label className="text-xs">Tempat</Label>
        <Input value={venue} onChange={e => { setVenue(e.target.value); mark(); }} placeholder="e.g. Management and Science University – MSU" className="mt-1 h-8 text-sm" disabled={!canWrite} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Alamat</Label>
          <Input value={address} onChange={e => { setAddress(e.target.value); mark(); }} placeholder="Alamat jalan" className="mt-1 h-8 text-sm" disabled={!canWrite} />
        </div>
        <div>
          <Label className="text-xs">Bandar</Label>
          <Input value={city} onChange={e => { setCity(e.target.value); mark(); }} placeholder="Bandar" className="mt-1 h-8 text-sm" disabled={!canWrite} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Latitud</Label>
          <Input value={latitude ?? ""} onChange={e => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setLatitude(isNaN(v as number) ? latitude : v); mark(); }}
            placeholder="3.1390" className="mt-1 h-8 text-sm font-mono" disabled={!canWrite} />
        </div>
        <div>
          <Label className="text-xs">Longitud</Label>
          <Input value={longitude ?? ""} onChange={e => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setLongitude(isNaN(v as number) ? longitude : v); mark(); }}
            placeholder="101.6869" className="mt-1 h-8 text-sm font-mono" disabled={!canWrite} />
        </div>
      </div>
      <button type="button" onClick={() => setShowMap(v => !v)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600">
        <Navigation className="h-3.5 w-3.5" />
        {showMap ? "Sembunyikan peta" : "Pilih lokasi pada peta"}
      </button>
      {showMap && (
        <Suspense fallback={<div className="h-48 rounded-md border bg-zinc-50 flex items-center justify-center text-xs text-zinc-400"><Loader2 className="h-4 w-4 animate-spin mr-2" />Memuatkan peta…</div>}>
          <MapPicker lat={latitude} lng={longitude} onChange={(lat, lng) => { setLatitude(lat); setLongitude(lng); mark(); }} />
        </Suspense>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </SectionCard>
  );
}

// ── EptimEdu Course Link Modal ────────────────────────────────────────────────

function EptimEduLinkModal({
  open, ecId, eventId, competitionName, currentCourseId, onClose, onSaved,
}: {
  open: boolean;
  ecId: string | null;
  eventId: string;
  competitionName: string;
  currentCourseId: string | null;
  onClose: () => void;
  onSaved: (courseId: string | null, courseTitle: string | null) => void;
}) {
  const [courses,    setCourses]    = useState<EduCourse[]>([]);
  const [filtered,   setFiltered]   = useState<EduCourse[]>([]);
  const [q,          setQ]          = useState("");
  const [fetching,   setFetching]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(currentCourseId);
    setQ(""); setError("");
    setFetching(true);
    fetch("/api/v2/organizer/eptimedu/courses")
      .then(r => r.json())
      .then(j => { if (j.error) { setError(j.error); return; } const inv = (j.data ?? []).filter((c: EduCourse) => c.status === "INVITE_ONLY"); setCourses(inv); setFiltered(inv); })
      .catch(() => setError("Gagal memuatkan kursus"))
      .finally(() => setFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setFiltered(q.trim() ? courses.filter(c => c.title.toLowerCase().includes(q.toLowerCase())) : courses); }, [q, courses]);

  async function handleSave() {
    if (!ecId) return;
    setSaving(true); setError("");
    const chosen = selectedId ? courses.find(c => c.id === selectedId) ?? null : null;
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${ecId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eptimEduCourseId: chosen?.id ?? null, eptimEduCourseTitle: chosen?.title ?? null }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Gagal menyimpan"); }
      onSaved(chosen?.id ?? null, chosen?.title ?? null);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-blue-500" />Pautan Kursus EptimEdu
          </DialogTitle>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">{competitionName}</p>
        </DialogHeader>

        <div className="px-6 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari kursus…"
              className="w-full pl-8 pr-3 h-9 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        <div className="px-6 pb-2 max-h-72 overflow-y-auto space-y-1.5">
          {fetching && <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>}
          {!fetching && error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}
          {!fetching && !error && filtered.length === 0 && <p className="text-sm text-zinc-400 text-center py-6">Tiada kursus dijumpai.</p>}

          {!fetching && !error && courses.length > 0 && (
            <button type="button" onClick={() => setSelectedId(null)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${selectedId === null ? "border-blue-500 bg-blue-50" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700"}`}>
              <div className="flex items-center gap-2">
                <Unlink className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="text-sm text-zinc-500 italic">Tiada kursus (nyahpautan)</span>
              </div>
            </button>
          )}

          {!fetching && filtered.map(course => (
            <button key={course.id} type="button" onClick={() => setSelectedId(course.id)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${selectedId === course.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{course.title}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {course.instructor && <span>{course.instructor} · </span>}
                    {course.totalMinutes > 0 && <span>{course.totalMinutes} min · </span>}
                    <span>{course.enrolmentCount} peserta</span>
                  </p>
                </div>
                {course.level && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium mt-0.5">{course.level}</span>}
              </div>
            </button>
          ))}
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving || fetching}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {selectedId ? "Pautan Kursus" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Competitions section ───────────────────────────────────────────────────────

// ── Prerequisite Event section ────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  DRAFT:      "bg-zinc-100 text-zinc-500",
  PUBLISHED:  "bg-blue-50 text-blue-700",
  REG_OPEN:   "bg-green-50 text-green-700",
  REG_CLOSED: "bg-orange-50 text-orange-700",
  ONGOING:    "bg-purple-50 text-purple-700",
  COMPLETED:  "bg-zinc-100 text-zinc-400",
};

function PrerequisitePickerModal({
  open, excludeId, selected, onClose, onConfirm,
}: {
  open: boolean; excludeId: string;
  selected: PrerequisiteEvent[];
  onClose: () => void;
  onConfirm: (list: PrerequisiteEvent[]) => void;
}) {
  const [search,    setSearch]    = useState("");
  const [results,   setResults]   = useState<EventListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending,   setPending]   = useState<PrerequisiteEvent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) { setSearch(""); setResults([]); return; }
    setPending(selected);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, selected]);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/api/v2/organizer/events?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => setResults((j.data ?? []).filter((e: EventListItem) => e.id !== excludeId)))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, excludeId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggle(ev: EventListItem) {
    setPending(prev =>
      prev.some(p => p.id === ev.id)
        ? prev.filter(p => p.id !== ev.id)
        : [...prev, { id: ev.id, name: ev.name, slug: ev.slug, status: ev.status }]
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pilih Acara Prasyarat</DialogTitle>
          <p className="text-xs text-zinc-500 mt-1">Boleh pilih lebih dari satu. Peserta layak jika menyertai mana-mana acara yang dipilih.</p>
        </DialogHeader>

        {/* Selected chips */}
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pending.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1 text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                {p.name}
                <button type="button" onClick={() => setPending(prev => prev.filter(x => x.id !== p.id))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama acara…"
            className="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zinc-400" />}
        </div>

        {/* Results */}
        <div className="min-h-[160px] max-h-72 overflow-y-auto rounded-lg border divide-y">
          {!search.trim() && (
            <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
              Taip nama acara untuk mencari
            </div>
          )}
          {search.trim() && !searching && results.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
              Tiada acara dijumpai
            </div>
          )}
          {results.map(ev => {
            const checked = pending.some(p => p.id === ev.id);
            return (
              <button key={ev.id} type="button"
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${checked ? "bg-amber-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                onClick={() => toggle(ev)}
              >
                <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center ${checked ? "bg-amber-500 border-amber-500" : "border-zinc-300"}`}>
                  {checked && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.name}</p>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{ev.slug}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CLS[ev.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                  {ev.status}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => { onConfirm(pending); onClose(); }}>
            Simpan ({pending.length} dipilih)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagerAcceptanceSection({ event, canWrite, onSaved }: {
  event: EventDetail; canWrite: boolean;
  onSaved: (u: Partial<EventDetail>) => void;
}) {
  const [value,  setValue]  = useState(event.needManagerAcceptance);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  async function toggle(next: boolean) {
    if (!canWrite) return;
    setValue(next);
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needManagerAcceptance: next }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      onSaved({ needManagerAcceptance: next });
    } catch (e) {
      setValue(!next); // revert
      setErr(e instanceof Error ? e.message : "Gagal");
    } finally { setSaving(false); }
  }

  return (
    <SectionCard title="Perlukan Pengesahan Pengurus Kontinjen">
      <p className="text-xs text-zinc-500">
        Apabila diaktifkan, pengurus kontinjen mesti mengesahkan penyertaan pasukan mereka sebelum dianggap sah. Status penerimaan (PENDING / HOLD / ACCEPT / REJECT) akan dipaparkan dalam halaman pra-pendaftaran.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={!canWrite || saving}
          onClick={() => toggle(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${
            value ? "bg-blue-600" : "bg-zinc-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              value ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${value ? "text-blue-700" : "text-zinc-500"}`}>
          {saving ? "Menyimpan…" : value ? "Ya — Pengesahan diperlukan" : "Tidak — Tiada pengesahan diperlukan"}
        </span>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </SectionCard>
  );
}

function PrerequisiteSection({ event, canWrite, onSaved, onCompetitionsCopied }: {
  event: EventDetail; canWrite: boolean;
  onSaved: (u: Partial<EventDetail>) => void;
  onCompetitionsCopied: () => void;
}) {
  const [selected, setSelected] = useState<PrerequisiteEvent[]>(
    event.prerequisites?.map(p => p.prerequisite) ?? []
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dirty,   setDirty]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [err,     setErr]     = useState("");

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prerequisiteEventIds: selected.map(e => e.id) }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      onSaved({ prerequisites: selected.map(p => ({ prerequisite: p })) });
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  function remove(id: string) {
    setSelected(prev => prev.filter(e => e.id !== id));
    setDirty(true);
  }

  async function copyCompetitions() {
    setCopying(true); setCopyMsg(null); setErr("");
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/competitions/copy-from-prerequisites`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal");
      setCopyMsg(`${json.added} pertandingan disalin, ${json.skipped} sudah wujud`);
      if (json.added > 0) onCompetitionsCopied();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyalin"); }
    finally { setCopying(false); }
  }

  return (
    <>
      <SectionCard
        title="Acara Prasyarat"
        action={canWrite && <SaveBtn dirty={dirty} saving={saving} onSave={save} />}
      >
        <p className="text-xs text-zinc-500">
          Tetapkan acara yang mesti disertai terlebih dahulu. Peserta layak mendaftar jika menyertai <em>mana-mana</em> acara yang dipilih.
        </p>

        {selected.length > 0 ? (
          <div className="flex flex-col gap-2">
            {selected.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <GitMerge className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.name}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">{ev.slug}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CLS[ev.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                  {ev.status}
                </span>
                {canWrite && (
                  <button type="button"
                    onClick={() => remove(ev.id)}
                    className="shrink-0 text-zinc-400 hover:text-red-500 transition-colors"
                    title="Buang prasyarat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 italic">Tiada prasyarat ditetapkan.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setPickerOpen(true)}>
              <Search className="h-3.5 w-3.5" />
              Tambah acara prasyarat
            </Button>
          )}
          {canWrite && selected.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={copyCompetitions} disabled={copying}>
              {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Salin pertandingan dari prasyarat
            </Button>
          )}
        </div>

        {copyMsg && <p className="text-xs text-emerald-600">{copyMsg}</p>}
        {err && <p className="text-xs text-red-500">{err}</p>}
      </SectionCard>

      <PrerequisitePickerModal
        open={pickerOpen}
        excludeId={event.id}
        selected={selected}
        onClose={() => setPickerOpen(false)}
        onConfirm={list => { setSelected(list); setDirty(true); }}
      />
    </>
  );
}

function CompetitionsSection({ eventId, canWrite, refreshKey }: { eventId: string; canWrite: boolean; refreshKey?: number }) {
  const [links,   setLinks]   = useState<EventCompLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<"list" | "form">("list");

  const [editing,    setEditing]    = useState<EventCompLink | null>(null);
  const [picName,    setPicName]    = useState("");
  const [picContact, setPicContact] = useState("");
  const [maxTeams,   setMaxTeams]   = useState(0);
  const [saving,     setSaving]     = useState(false);
  const [formErr,    setFormErr]    = useState("");

  // Copy-from-event dialog state
  const [copyOpen,      setCopyOpen]      = useState(false);
  const [copyQ,         setCopyQ]         = useState("");
  const [copyList,      setCopyList]      = useState<EventListItem[]>([]);
  const [copySearching, setCopySearching] = useState(false);
  const [copyPicked,    setCopyPicked]    = useState<EventListItem | null>(null);
  const [copying,       setCopying]       = useState(false);
  const [copyMsg,       setCopyMsg]       = useState("");

  const [compSearch,    setCompSearch]    = useState("");
  const [compResults,   setCompResults]   = useState<CompSearch[]>([]);
  const [compSearching, setCompSearching] = useState(false);
  const [picked,        setPicked]        = useState<CompSearch | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteTarget,   setDeleteTarget]   = useState<EventCompLink | null>(null);
  const [linkCourseFor,  setLinkCourseFor]  = useState<EventCompLink | null>(null);

  // Judging templates (edit form only)
  const [assignedTemplates,   setAssignedTemplates]   = useState<JudgingTemplateSummary[]>([]);
  const [allTemplates,        setAllTemplates]        = useState<JudgingTemplateSummary[]>([]);
  const [templatesLoading,    setTemplatesLoading]    = useState(false);
  const [templatePickerOpen,  setTemplatePickerOpen]  = useState(false);
  const [removingTemplateId,  setRemovingTemplateId]  = useState<string | null>(null);
  const [assigningTemplateId, setAssigningTemplateId] = useState<string | null>(null);

  const linksRef = useRef(links);
  useEffect(() => { linksRef.current = links; }, [links]);


  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions`);
    const j   = await res.json();
    setLinks(j.data ?? []);
    setLoading(false);
  }, [eventId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, refreshKey]);

  const searchComps = useCallback(async (q: string) => {
    setCompSearching(true);
    const res  = await fetch(`/api/v2/organizer/competitions?q=${encodeURIComponent(q)}&pageSize=20`);
    const j    = await res.json();
    const linked = new Set(linksRef.current.map(l => l.competitionId));
    setCompResults((j.data ?? []).filter((c: CompSearch) => !linked.has(c.id)));
    setCompSearching(false);
  }, []);

  useEffect(() => {
    if (view !== "form" || editing) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchComps(compSearch), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [compSearch, view, editing, searchComps]);

  function openAdd() {
    setEditing(null); setPicked(null); setCompSearch("");
    setPicName(""); setPicContact(""); setMaxTeams(0); setFormErr("");
    setView("form");
    searchComps("");
  }

  async function openEdit(link: EventCompLink) {
    setEditing(link); setPicked(link.competition);
    setPicName(link.picName ?? ""); setPicContact(link.picContact ?? "");
    setMaxTeams(link.maxTeams); setFormErr("");
    setAssignedTemplates([]); setAllTemplates([]);
    setTemplatePickerOpen(false);
    setView("form");
    setTemplatesLoading(true);
    try {
      const [aRes, allRes] = await Promise.all([
        fetch(`/api/v2/organizer/events/${eventId}/competitions/${link.id}/judging-templates`),
        fetch("/api/v2/organizer/judging/templates"),
      ]);
      const [aJson, allJson] = await Promise.all([aRes.json(), allRes.json()]);
      setAssignedTemplates(aJson.data ?? []);
      setAllTemplates(allJson.templates ?? []);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function assignTemplate(templateId: string, ecId: string) {
    setAssigningTemplateId(templateId);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${eventId}/competitions/${ecId}/judging-templates`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ judgingTemplateId: templateId }) }
      );
      if (res.ok) {
        const tpl = allTemplates.find(t => t.id === templateId);
        if (tpl) setAssignedTemplates(prev => [...prev, tpl]);
        setTemplatePickerOpen(false);
      }
    } finally { setAssigningTemplateId(null); }
  }

  async function removeTemplate(templateId: string, ecId: string) {
    setRemovingTemplateId(templateId);
    try {
      await fetch(
        `/api/v2/organizer/events/${eventId}/competitions/${ecId}/judging-templates/${templateId}`,
        { method: "DELETE" }
      );
      setAssignedTemplates(prev => prev.filter(t => t.id !== templateId));
    } finally { setRemovingTemplateId(null); }
  }

  async function handleSave() {
    if (!editing && !picked) { setFormErr("Pilih pertandingan terlebih dahulu."); return; }
    setSaving(true); setFormErr("");
    try {
      if (editing) {
        const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ picName, picContact, maxTeams }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal");
      } else {
        const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitionId: picked!.id, picName, picContact, maxTeams }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error === "ALREADY_LINKED" ? "Pertandingan ini sudah ditambah." : (j.error ?? "Gagal"));
        }
      }
      setView("list");
      load();
    } catch (e) { setFormErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error === "HAS_TEAMS" ? "Padam semua pasukan terlebih dahulu." : (j.error ?? "Gagal"));
    }
    load();
  }

  const copySearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!copyOpen) return;
    if (copySearchTimer.current) clearTimeout(copySearchTimer.current);
    copySearchTimer.current = setTimeout(async () => {
      setCopySearching(true);
      try {
        const res = await fetch(`/api/v2/organizer/events?q=${encodeURIComponent(copyQ)}&pageSize=20`);
        const j = await res.json();
        setCopyList((j.data ?? []).filter((e: EventListItem) => e.id !== eventId));
      } finally { setCopySearching(false); }
    }, 300);
    return () => { if (copySearchTimer.current) clearTimeout(copySearchTimer.current); };
  }, [copyQ, copyOpen, eventId]);

  async function doCopyFromEvent() {
    if (!copyPicked) return;
    setCopying(true); setCopyMsg("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/copy-from-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceEventId: copyPicked.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal");
      setCopyMsg(`${j.added} pertandingan ditambah, ${j.skipped} sudah wujud.`);
      load();
    } catch (e) {
      setCopyMsg(e instanceof Error ? e.message : "Gagal menyalin.");
    } finally { setCopying(false); }
  }

  return (
    <SectionCard
      title={`Pertandingan (${links.length})`}
      action={view === "list" && canWrite
        ? <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => { setCopyOpen(true); setCopyQ(""); setCopyList([]); setCopyPicked(null); setCopyMsg(""); }} className="h-7 text-xs gap-1">
              <Copy className="h-3 w-3" />Salin dari acara
            </Button>
            <Button size="sm" onClick={openAdd} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />Tambah</Button>
          </div>
        : view === "form"
          ? <button onClick={() => setView("list")} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"><ArrowLeft className="h-3.5 w-3.5" />Kembali</button>
          : undefined
      }
    >
      {/* LIST VIEW */}
      {view === "list" && (
        <>
          {loading && <div className="flex items-center justify-center py-6 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin mr-2" />Memuatkan…</div>}
          {!loading && links.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-400 gap-2">
              <Trophy className="h-6 w-6 text-zinc-200" />
              <p className="text-xs">Belum ada pertandingan. Klik Tambah untuk menghubungkan.</p>
            </div>
          )}
          {!loading && links.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-zinc-400">
                  <th className="pb-2 font-medium">Pertandingan</th>
                  <th className="pb-2 font-medium text-right pr-1">Berdaftar</th>
                  {canWrite && <th className="pb-2 w-12" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {links.map(link => (
                  <tr key={link.id} className="group align-top">
                    <td className="py-2.5 pr-4">
                      <p className="text-sm font-medium text-zinc-900">
                        <span className="font-mono text-zinc-400 mr-1.5">{link.competition.code}</span>
                        {link.competition.name}
                      </p>
                      {/* EptimEdu course badge / link button */}
                      <div className="mt-1">
                        {canWrite ? (
                          <button type="button" onClick={() => setLinkCourseFor(link)}
                            className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors w-fit ${
                              link.eptimEduCourseId
                                ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                                : "border border-dashed border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600"
                            }`}>
                            <BookOpen className="h-3 w-3 shrink-0" />
                            <span>{link.eptimEduCourseTitle ?? "Pautan kursus EptimEdu…"}</span>
                            {link.eptimEduCourseId && <Link2 className="h-3 w-3 shrink-0 opacity-60" />}
                          </button>
                        ) : link.eptimEduCourseId ? (
                          <div className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 w-fit">
                            <BookOpen className="h-3 w-3 shrink-0" />
                            <span>{link.eptimEduCourseTitle}</span>
                          </div>
                        ) : null}
                      </div>
                      {(link.picName || link.picContact || link.maxTeams > 0) && (
                        <div className="flex items-center gap-3 mt-1 text-zinc-400">
                          {link.picName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{link.picName}</span>}
                          {link.picContact && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{link.picContact}</span>}
                          {link.maxTeams > 0 && <span>Maks {link.maxTeams} pasukan</span>}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-zinc-600 font-medium pr-1 whitespace-nowrap">
                      {link.competition._count.teams}
                    </td>
                    {canWrite && (
                      <td className="py-2.5">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(link)} className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => setDeleteTarget(link)} className="p-1 rounded hover:bg-red-50 text-red-400">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* FORM VIEW */}
      {view === "form" && (
        <div className="space-y-4">
          {!editing && (
            <div>
              <Label className="text-xs">Pilih Pertandingan *</Label>
              {picked ? (
                <div className="mt-1 flex items-center gap-3 p-2.5 rounded-md border border-green-200 bg-green-50">
                  <Check className="h-4 w-4 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{picked.name}</p>
                    <p className="text-xs text-zinc-400 font-mono">{picked.code}</p>
                  </div>
                  <button onClick={() => { setPicked(null); setCompSearch(""); searchComps(""); }} className="text-xs text-zinc-400 hover:text-zinc-600">Tukar</button>
                </div>
              ) : (
                <div className="mt-1 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                    <Input value={compSearch} onChange={e => setCompSearch(e.target.value)} placeholder="Cari nama atau kod…" className="pl-8 h-8 text-sm" autoFocus />
                    {compSearching && <Loader2 className="absolute right-2.5 top-2 h-3.5 w-3.5 animate-spin text-zinc-400" />}
                  </div>
                  <div className="rounded-md border max-h-44 overflow-y-auto">
                    {!compSearching && compResults.length === 0 && <p className="px-4 py-5 text-center text-xs text-zinc-400">Tiada pertandingan.</p>}
                    {compResults.map(c => (
                      <button key={c.id} onClick={() => setPicked(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 border-b last:border-0 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-zinc-400 font-mono">{c.code}</p>
                        </div>
                        <span className="text-[10px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full shrink-0">{c.participationType}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {editing && (
            <div>
              <Label className="text-xs">Pertandingan</Label>
              <div className="mt-1 px-3 py-2 rounded-md border bg-zinc-50 text-sm">
                <span className="font-medium">{editing.competition.name}</span>
                <span className="ml-2 text-xs text-zinc-400 font-mono">{editing.competition.code}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nama PIC</Label>
              <Input value={picName} onChange={e => setPicName(e.target.value)} placeholder="Nama penuh" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Hubungi PIC</Label>
              <Input value={picContact} onChange={e => setPicContact(e.target.value)} placeholder="No. telefon atau e-mel" className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div className="w-36">
            <Label className="text-xs">Maks Pasukan</Label>
            <Input type="number" min={0} value={maxTeams} onChange={e => setMaxTeams(parseInt(e.target.value) || 0)} className="mt-1 h-8 text-sm" />
            <p className="text-[10px] text-zinc-400 mt-1">0 = tanpa had</p>
          </div>

          {/* Judging Templates — only visible when editing an existing link */}
          {editing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Gavel className="h-3.5 w-3.5 text-zinc-400" />Template Penghakiman
                </Label>
                <button
                  type="button"
                  onClick={() => setTemplatePickerOpen(true)}
                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />Tambah
                </button>
              </div>

              {templatesLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Memuatkan template…
                </div>
              ) : assignedTemplates.length === 0 ? (
                <p className="text-xs text-zinc-400 italic py-1">Tiada template ditetapkan.</p>
              ) : (
                <div className="space-y-1.5">
                  {assignedTemplates.map(t => (
                    <div key={t.id} className="flex items-center gap-2 rounded-md border border-violet-100 bg-violet-50 px-3 py-2">
                      <Gavel className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-violet-800 truncate">{t.name}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">{t.code} · {t._count.criterions} kriteria</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTemplate(t.id, editing.id)}
                        disabled={removingTemplateId === t.id}
                        className="p-0.5 rounded hover:bg-violet-100 shrink-0"
                      >
                        {removingTemplateId === t.id
                          ? <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                          : <X className="h-3 w-3 text-violet-400" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {formErr && <p className="text-xs text-red-500">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setView("list")} className="h-8 text-xs">Batal</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || (!editing && !picked)} className="h-8 text-xs gap-1.5">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {editing ? "Simpan" : "Tambah ke Acara"}
            </Button>
          </div>
        </div>
      )}

      {/* Template picker modal */}
      <Dialog open={templatePickerOpen} onOpenChange={open => { if (!open) setTemplatePickerOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <Gavel className="h-4 w-4" />Pilih Template Penghakiman
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto py-1 pr-1">
            {allTemplates.filter(t => !assignedTemplates.some(a => a.id === t.id)).length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-6">Semua template sudah ditetapkan.</p>
            ) : (
              allTemplates
                .filter(t => !assignedTemplates.some(a => a.id === t.id))
                .map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => editing && assignTemplate(t.id, editing.id)}
                    disabled={assigningTemplateId === t.id}
                    className="w-full text-left rounded-lg border border-zinc-200 hover:border-violet-300 hover:bg-violet-50 px-4 py-3 flex items-center gap-3 transition-colors disabled:opacity-60"
                  >
                    {assigningTemplateId === t.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-violet-400 shrink-0" />
                      : <Gavel className="h-4 w-4 text-zinc-300 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800">{t.name}</p>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5">{t.code} · {t._count.criterions} kriteria</p>
                      {t.description && <p className="text-xs text-zinc-400 mt-0.5 truncate">{t.description}</p>}
                    </div>
                    <Plus className="h-4 w-4 text-violet-400 shrink-0" />
                  </button>
                ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePickerOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Tanggalkan "${deleteTarget?.competition.name}"?`}
        description="Pertandingan ini akan dibuang dari acara ini. Pasukan yang berdaftar mesti dibuang terlebih dahulu."
      />

      <EptimEduLinkModal
        open={!!linkCourseFor}
        ecId={linkCourseFor?.id ?? null}
        eventId={eventId}
        competitionName={linkCourseFor?.competition.name ?? ""}
        currentCourseId={linkCourseFor?.eptimEduCourseId ?? null}
        onClose={() => setLinkCourseFor(null)}
        onSaved={(courseId, courseTitle) => {
          setLinks(prev => prev.map(l =>
            l.id === linkCourseFor?.id
              ? { ...l, eptimEduCourseId: courseId, eptimEduCourseTitle: courseTitle }
              : l
          ));
          setLinkCourseFor(null);
        }}
      />

      {/* Copy-from-event dialog */}
      <Dialog open={copyOpen} onOpenChange={open => { if (!open) setCopyOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-zinc-500" />Salin Pertandingan dari Acara Lain
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
              <Input
                value={copyQ}
                onChange={e => { setCopyQ(e.target.value); setCopyPicked(null); setCopyMsg(""); }}
                placeholder="Cari nama acara…"
                className="pl-8 h-8 text-sm"
                autoFocus
              />
              {copySearching && <Loader2 className="absolute right-2.5 top-2 h-3.5 w-3.5 animate-spin text-zinc-400" />}
            </div>
            <div className="rounded-md border max-h-52 overflow-y-auto">
              {!copySearching && copyList.length === 0 && (
                <p className="px-4 py-5 text-center text-xs text-zinc-400">Tiada acara ditemui.</p>
              )}
              {copyList.map(ev => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => { setCopyPicked(ev); setCopyMsg(""); }}
                  className={`w-full text-left px-4 py-2.5 border-b last:border-0 flex items-center gap-3 transition-colors ${
                    copyPicked?.id === ev.id ? "bg-blue-50 border-blue-200" : "hover:bg-zinc-50"
                  }`}
                >
                  {copyPicked?.id === ev.id
                    ? <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    : <div className="h-3.5 w-3.5 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{ev.name}</p>
                    <p className="text-[10px] text-zinc-400">{ev.scope} · {ev.status}</p>
                  </div>
                </button>
              ))}
            </div>
            {copyMsg && (
              <p className={`text-xs ${copyMsg.includes("Gagal") ? "text-red-500" : "text-green-600"}`}>{copyMsg}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)} className="text-xs h-8">Tutup</Button>
            <Button
              onClick={doCopyFromEvent}
              disabled={!copyPicked || copying}
              className="text-xs h-8 gap-1.5"
            >
              {copying && <Loader2 className="h-3 w-3 animate-spin" />}
              Salin Pertandingan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ── Walk-in Competitions Section ───────────────────────────────────────────────

type WalkInComp = {
  id: string; competitionId: string;
  useViblockarena: boolean;
  useDronearena: boolean;
  useVibeblocks: boolean;
  competition: { id: string; code: string; name: string; participationType: string };
  _count: { registrations: number };
};

function WalkInPickerModal({ linkedIds, onAdd, onClose }: {
  linkedIds: Set<string>;
  onAdd: (competitionId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [q,            setQ]            = useState("");
  const [allComps,     setAllComps]     = useState<CompSearch[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [adding,       setAdding]       = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/v2/organizer/competitions?pageSize=100");
      const j   = await res.json();
      setAllComps(j.data ?? []);
      setLoadingComps(false);
    }
    load();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = allComps
    .filter(c =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.code.toLowerCase().includes(q.toLowerCase())
    )
    .sort((a, b) => a.code.localeCompare(b.code));

  const groups: Record<string, CompSearch[]> = {};
  for (const c of filtered) {
    const key = c.theme?.name ?? "Lain-lain";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === "Lain-lain") return 1;
    if (b === "Lain-lain") return -1;
    return a.localeCompare(b);
  });

  async function handlePick(c: CompSearch) {
    if (linkedIds.has(c.id) || adding) return;
    setAdding(c.id);
    await onAdd(c.id);
    setAdding(null);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border flex flex-col w-full max-w-2xl max-h-[80vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900">Tambah Pertandingan Walk-in</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-3 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder="Cari nama atau kod pertandingan…"
              className="w-full h-9 rounded-lg border border-input bg-background pl-9 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {loadingComps ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : sortedKeys.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">Tiada pertandingan dijumpai.</p>
          ) : sortedKeys.map(groupName => (
            <div key={groupName}>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{groupName}</p>
              <div className="grid grid-cols-3 gap-2">
                {groups[groupName].map(c => {
                  const linked = linkedIds.has(c.id);
                  return (
                    <button key={c.id} type="button"
                      disabled={linked || !!adding}
                      onClick={() => handlePick(c)}
                      className={`relative text-left rounded-lg border p-3 transition-colors ${
                        linked
                          ? "bg-zinc-50 border-zinc-200 cursor-not-allowed opacity-60"
                          : adding === c.id
                          ? "bg-violet-50 border-violet-300"
                          : "bg-white border-zinc-200 hover:border-violet-300 hover:bg-violet-50"
                      }`}
                    >
                      <p className="text-xs font-medium text-zinc-900 leading-tight line-clamp-2">
                        <span className="font-mono font-normal text-zinc-400">{c.code}</span> {c.name}
                      </p>
                      {linked && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Ditambah</span>
                      )}
                      {adding === c.id && (
                        <Loader2 className="absolute top-1.5 right-1.5 h-3 w-3 animate-spin text-violet-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WalkInCompetitionsSection({ event, canWrite, hasViblockKey, hasDroneKey, hasVibeBlocksKey, onSaved }: { event: EventDetail; canWrite: boolean; hasViblockKey: boolean; hasDroneKey: boolean; hasVibeBlocksKey: boolean; onSaved: (u: Partial<EventDetail>) => void }) {
  const eventId = event.id;
  const [links,        setLinks]        = useState<WalkInComp[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showPicker,   setShowPicker]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WalkInComp | null>(null);

  // Penyertaan Unik switch
  const [uniqueOn,   setUniqueOn]   = useState(event.walkInUniqueParticipation);
  const [savingUniq, setSavingUniq] = useState(false);
  const [uniqErr,    setUniqErr]    = useState("");

  async function toggleUnique(next: boolean) {
    if (!canWrite) return;
    setUniqueOn(next);
    setSavingUniq(true); setUniqErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walkInUniqueParticipation: next }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      onSaved({ walkInUniqueParticipation: next });
    } catch (e) {
      setUniqueOn(!next); // revert
      setUniqErr(e instanceof Error ? e.message : "Gagal");
    } finally { setSavingUniq(false); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin`);
    const j   = await res.json();
    setLinks(j.data ?? []);
    setLoading(false);
  }, [eventId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleAdd(competitionId: string) {
    const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitionId }),
    });
    const j = await res.json();
    if (res.ok) setLinks(prev => [...prev, j.data]);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) { setLinks(prev => prev.filter(l => l.id !== deleteTarget.id)); setDeleteTarget(null); }
  }

  const BOT_FIELDS = ["useViblockarena", "useDronearena", "useVibeblocks"] as const;
  type BotField = typeof BOT_FIELDS[number];

  async function toggleArena(wicId: string, field: BotField, newValue: boolean) {
    const optimistic = (l: WalkInComp) => l.id !== wicId ? l : {
      ...l, [field]: newValue,
      ...(newValue && Object.fromEntries(BOT_FIELDS.filter(f => f !== field).map(f => [f, false]))),
    };
    const revert = (l: WalkInComp) => l.id !== wicId ? l : {
      ...l, [field]: !newValue,
      ...(newValue && Object.fromEntries(BOT_FIELDS.filter(f => f !== field).map(f => [f, true]))),
    };
    setLinks(prev => prev.map(optimistic));
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin/${wicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newValue }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLinks(prev => prev.map(revert));
    }
  }

  if (loading) return null;

  const linkedIds = new Set(links.map(l => l.competitionId));

  return (
    <>
      <SectionCard
        title="Pertandingan Walk-in"
        action={canWrite && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowPicker(true)}>
            <Plus className="h-3.5 w-3.5" /> Tambah
          </Button>
        )}
      >
        <p className="text-xs text-zinc-500">
          Pertandingan walk-in boleh menggunakan pertandingan yang sama tetapi pendaftaran dan keputusan adalah berasingan.
        </p>

        {/* Penyertaan Unik — one walk-in registration per participant for this event */}
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={uniqueOn}
            disabled={!canWrite || savingUniq}
            onClick={() => toggleUnique(!uniqueOn)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${
              uniqueOn ? "bg-blue-600" : "bg-zinc-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                uniqueOn ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-800">Penyertaan Unik</p>
            <p className="text-xs text-zinc-500">
              {savingUniq
                ? "Menyimpan…"
                : uniqueOn
                  ? "Aktif — peserta hanya boleh mendaftar untuk satu pertandingan walk-in dalam acara ini."
                  : "Peserta boleh mendaftar untuk lebih daripada satu pertandingan walk-in."}
            </p>
            {uniqErr && <p className="text-xs text-red-500 mt-0.5">{uniqErr}</p>}
          </div>
        </div>

        {links.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">Tiada pertandingan walk-in ditambah.</p>
        ) : (
          <div className="space-y-2">
            {links.map(wic => (
              <div key={wic.id} className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{wic.competition.name}</p>
                  <p className="text-[11px] text-zinc-400 font-mono">{wic.competition.code}</p>
                </div>
                {(hasViblockKey || hasDroneKey || hasVibeBlocksKey) && (
                  <div className="flex shrink-0 rounded-md overflow-hidden border border-zinc-200 divide-x divide-zinc-200">
                    {hasViblockKey && (
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => canWrite && toggleArena(wic.id, "useViblockarena", !wic.useViblockarena)}
                        className={`px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed ${
                          wic.useViblockarena ? "bg-violet-500 text-white" : "bg-white text-zinc-400 hover:bg-zinc-50"
                        }`}
                      >
                        Viblock
                      </button>
                    )}
                    {hasDroneKey && (
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => canWrite && toggleArena(wic.id, "useDronearena", !wic.useDronearena)}
                        className={`px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed ${
                          wic.useDronearena ? "bg-sky-500 text-white" : "bg-white text-zinc-400 hover:bg-zinc-50"
                        }`}
                      >
                        Drone
                      </button>
                    )}
                    {hasVibeBlocksKey && (
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => canWrite && toggleArena(wic.id, "useVibeblocks", !wic.useVibeblocks)}
                        className={`px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed ${
                          wic.useVibeblocks ? "bg-emerald-500 text-white" : "bg-white text-zinc-400 hover:bg-zinc-50"
                        }`}
                      >
                        VibeBlocks
                      </button>
                    )}
                  </div>
                )}
                <span className="text-[10px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                  {wic._count.registrations} daftar
                </span>
                {canWrite && (
                  <button type="button" onClick={() => setDeleteTarget(wic)}
                    className="text-zinc-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {showPicker && (
        <WalkInPickerModal
          linkedIds={linkedIds}
          onAdd={handleAdd}
          onClose={() => setShowPicker(false)}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Buang "${deleteTarget?.competition.name}" dari walk-in?`}
        description="Pertandingan walk-in ini akan dibuang. Semua pendaftaran mesti dibuang terlebih dahulu."
      />
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EventsClient({ role, hasViblockKey = false, hasDroneKey = false, hasVibeBlocksKey = false }: { role: OrganizerRole; hasViblockKey?: boolean; hasDroneKey?: boolean; hasVibeBlocksKey?: boolean }) {
  const canWrite = ["SUPER_ADMIN", "ADMIN"].includes(role);

  const [events,  setEvents]  = useState<EventListItem[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [q,       setQ]       = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [showArchive,   setShowArchive]   = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<EventListItem | null>(null);
  const [archiving,     setArchiving]     = useState(false);
  const [loading, setLoading] = useState(false);

  const [selected,      setSelected]      = useState<EventDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [compRefreshKey, setCompRefreshKey] = useState(0);

  const [states, setStates] = useState<StateOption[]>([]);
  const [zones,  setZones]  = useState<ZoneOption[]>([]);

  const [newOpen,   setNewOpen]   = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newSlug,   setNewSlug]   = useState("");
  const [newScope,  setNewScope]  = useState("NATIONAL");
  const [creating,  setCreating]  = useState(false);
  const [createErr, setCreateErr] = useState("");

  const [pushing,      setPushing]      = useState(false);
  const [pushOk,       setPushOk]       = useState(false);
  const [pushFail,     setPushFail]     = useState(false);
  const [pushAllState, setPushAllState] = useState<"idle" | "running" | "done">("idle");
  const [pushProgress, setPushProgress] = useState<{ done: number; total: number } | null>(null);
  const [showFlowGraph, setShowFlowGraph] = useState(false);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
      if (statusFilter) p.set("status", statusFilter);
      else if (!showArchive) p.set("notStatus", "ARCHIVE");
      const res = await fetch(`/api/v2/organizer/events?${p}`);
      const j   = await res.json();
      setEvents(j.data ?? []);
      setTotal(j.total ?? 0);
    } finally { setLoading(false); }
  }, [page, q, statusFilter, showArchive]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/states?pageSize=100").then(r => r.json()).then(j => setStates(j.data ?? []));
    fetch("/api/v2/organizer/reference-data/zones?pageSize=200").then(r => r.json()).then(j => setZones(j.data ?? []));
  }, []);

  async function selectEvent(item: EventListItem) {
    setLoadingDetail(true);
    setPushOk(false); setPushFail(false);
    try {
      const res = await fetch(`/api/v2/organizer/events/${item.id}`);
      const j   = await res.json();
      setSelected(j.data);
    } finally { setLoadingDetail(false); }
  }

  async function createEvent() {
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch("/api/v2/organizer/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, slug: newSlug, scope: newScope }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error === "SLUG_TAKEN" ? "Slug sudah digunakan." : (j.error ?? "Gagal"));
      setNewOpen(false); setNewName(""); setNewSlug(""); setNewScope("NATIONAL");
      await load();
      selectEvent(j.data);
    } catch (e) { setCreateErr(e instanceof Error ? e.message : "Gagal mencipta."); }
    finally { setCreating(false); }
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${archiveTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVE" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Gagal mengarkib.");
        return;
      }
      if (selected?.id === archiveTarget.id) setSelected(null);
      setArchiveTarget(null);
      load();
    } finally {
      setArchiving(false);
    }
  }

  function handleSectionSaved(updated: Partial<EventDetail>) {
    setSelected(s => s ? { ...s, ...updated } : s);
    setEvents(prev => prev.map(e => e.id === selected?.id ? { ...e, ...updated } as EventListItem : e));
  }

  async function pushToKb() {
    if (!selected) return;
    setPushing(true); setPushOk(false); setPushFail(false);
    try {
      const res = await fetch("/api/v2/organizer/knowledge-base/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "event", entityId: selected.id }),
      });
      if (res.ok) setPushOk(true); else setPushFail(true);
    } catch { setPushFail(true); }
    finally { setPushing(false); }
  }

  async function pushAll() {
    setPushAllState("running"); setPushProgress({ done: 0, total: 0 });
    try {
      const res  = await fetch("/api/v2/organizer/events?page=1&pageSize=1000");
      const json = await res.json();
      const ids: string[] = (json.data ?? []).map((e: EventListItem) => e.id);
      setPushProgress({ done: 0, total: ids.length });
      let done = 0;
      for (const id of ids) {
        await fetch("/api/v2/organizer/knowledge-base/push", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "event", entityId: id }),
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
          <span className="text-sm font-semibold flex-1">Events</span>
          <button
            onClick={() => setShowFlowGraph(true)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500"
            title="Graf Aliran Acara"
          >
            <Network className="h-3.5 w-3.5" />
          </button>
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
              <Label className="text-[10px]">Nama</Label>
              <Input value={newName} onChange={e => { setNewName(e.target.value); setNewSlug(slugify(e.target.value)); }}
                placeholder="Nama acara" className="mt-1 h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px]">Slug</Label>
              <Input value={newSlug} onChange={e => setNewSlug(slugify(e.target.value))}
                placeholder="slug-acara" className="mt-1 h-7 text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[10px]">Skop</Label>
              <select value={newScope} onChange={e => setNewScope(e.target.value)}
                className="mt-1 w-full h-7 rounded-md border border-input bg-background px-2 text-xs">
                {SCOPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {createErr && <p className="text-[10px] text-red-500">{createErr}</p>}
            <div className="flex gap-1.5">
              <Button size="sm" onClick={createEvent} disabled={creating || !newName.trim() || !newSlug.trim()} className="h-7 text-xs px-3">
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cipta"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setNewOpen(false); setCreateErr(""); }} className="h-7 text-xs px-3">Batal</Button>
            </div>
          </div>
        )}

        <div className="px-3 py-2 border-b space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
            <Input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Cari…" className="pl-8 h-7 text-xs" />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">Semua status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchive}
              onChange={e => { setShowArchive(e.target.checked); setPage(1); }}
              className="h-3 w-3 accent-zinc-500"
            />
            <span className="text-[10px] text-zinc-500">Tunjuk arkib</span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Memuatkan…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Tiada acara ditemui.</p>
          ) : (() => {
            const active   = events.filter(ev => ev.status !== "ARCHIVE");
            const archived = events.filter(ev => ev.status === "ARCHIVE");

            function renderRow(ev: EventListItem) {
              const isOnline    = ev.scope.startsWith("ONLINE");
              const isArchived  = ev.status === "ARCHIVE";
              const isPublished = ev.status === "PUBLISHED";
              const isCompleted = ev.status === "COMPLETED";
              return (
                <div key={ev.id}
                  className={cn(
                    "group flex cursor-pointer border-b last:border-0 transition-colors",
                    isArchived
                      ? selected?.id === ev.id ? "bg-zinc-200" : "hover:bg-zinc-100 opacity-60"
                      : isCompleted
                        ? selected?.id === ev.id ? "bg-purple-100" : "bg-purple-50/70 hover:bg-purple-100"
                        : isPublished
                          ? selected?.id === ev.id ? "bg-emerald-100" : "bg-emerald-50/70 hover:bg-emerald-100"
                          : selected?.id === ev.id ? "bg-blue-50" : "hover:bg-zinc-50"
                  )}
                  onClick={() => selectEvent(ev)}
                >
                  <div className="w-2.5 shrink-0 self-stretch"
                    style={{ background: isArchived ? "#a1a1aa" : isCompleted ? "#7c3aed" : isPublished ? "#10b981" : isOnline ? "#7c3aed" : "#0ea5e9" }} />
                  <div className="flex-1 min-w-0 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {isPublished && (
                        <Globe2 className="h-3 w-3 text-emerald-600 shrink-0" />
                      )}
                      <p className={cn("text-xs font-medium truncate",
                        isArchived  ? "text-zinc-400 line-through" :
                        isCompleted ? "text-purple-800" :
                        isPublished ? "text-emerald-800" :
                        selected?.id === ev.id ? "text-blue-700" : "text-zinc-800"
                      )}>{ev.name}</p>
                    </div>
                    {ev.startDate && (
                      <p className="text-[10px] text-zinc-400 mt-0.5">{fmtDate(ev.startDate)}</p>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 mr-1.5 self-center transition-opacity">
                    <a
                      href={`/organizer/events/${ev.slug}/manage`}
                      onClick={e => e.stopPropagation()}
                      className="p-1 rounded hover:bg-blue-50"
                      title="Uruskan acara"
                    >
                      <Settings className="h-3 w-3 text-blue-400" />
                    </a>
                    {canWrite && !isArchived && (
                      <button onClick={e => { e.stopPropagation(); setArchiveTarget(ev); }}
                        className="p-1 rounded hover:bg-amber-50"
                        title="Arkib acara ini">
                        <Trash2 className="h-3 w-3 text-amber-500" />
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <>
                {active.map(renderRow)}
                {archived.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-t border-b bg-zinc-100 flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Arkib ({archived.length})</span>
                    </div>
                    {archived.map(renderRow)}
                  </>
                )}
              </>
            );
          })()}
        </div>

        {pages > 1 && (
          <div className="border-t px-3 py-2 flex items-center justify-between text-[10px] text-zinc-400">
            <span>{total} acara</span>
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
            <div className="rounded-full bg-zinc-100 p-4"><CalendarDays className="h-8 w-8 text-zinc-300" /></div>
            <p className="text-sm">Pilih acara untuk melihat dan mengedit maklumat.</p>
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
                {pushing   ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : pushOk   ? <CheckCircle2 className="h-3.5 w-3.5" />
                : pushFail ? <XCircle className="h-3.5 w-3.5 text-red-400" />
                :             <UploadCloud className="h-3.5 w-3.5" />}
                Push to Knowledge Base
              </button>
            </div>
            <InfoSection       event={selected} canWrite={canWrite} states={states} zones={zones} onSaved={handleSectionSaved} />
            <DatesSection      event={selected} canWrite={canWrite} onSaved={handleSectionSaved} />
            <VenueSection        event={selected} canWrite={canWrite} onSaved={handleSectionSaved} />
            <ManagerAcceptanceSection event={selected} canWrite={canWrite} onSaved={handleSectionSaved} />
            <PrerequisiteSection event={selected} canWrite={canWrite} onSaved={handleSectionSaved} onCompetitionsCopied={() => setCompRefreshKey(k => k + 1)} />
            <CompetitionsSection eventId={selected.id} canWrite={canWrite} refreshKey={compRefreshKey} />
            <WalkInCompetitionsSection event={selected} canWrite={canWrite} hasViblockKey={hasViblockKey} hasDroneKey={hasDroneKey} hasVibeBlocksKey={hasVibeBlocksKey} onSaved={handleSectionSaved} />
          </div>
        )}
      </main>

      <Dialog open={!!archiveTarget} onOpenChange={v => { if (!v) setArchiveTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Arkib acara ini?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 px-1">
            <span className="font-medium">{archiveTarget?.name}</span> akan ditetapkan sebagai <span className="font-mono text-xs bg-zinc-100 px-1 rounded">ARCHIVE</span> dan disembunyikan daripada senarai. Ia boleh dipulihkan dengan menukar status semula.
          </p>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setArchiveTarget(null)} disabled={archiving}>Batal</Button>
            <Button size="sm" onClick={handleArchive} disabled={archiving} className="bg-amber-600 hover:bg-amber-500 text-white gap-1.5">
              {archiving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Ya, Arkib
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showFlowGraph && <EventFlowGraph onClose={() => setShowFlowGraph(false)} />}
    </div>
  );
}
