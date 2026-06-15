"use client";

import { useState, useEffect, useCallback, lazy, Suspense, useRef } from "react";
import {
  Plus, Trash2, Loader2, Search, Save, Sparkles, Navigation,
  UploadCloud, CheckCircle2, XCircle, Trophy, User, Phone,
  ArrowLeft, Check, CalendarDays, BookOpen, Link2, Unlink, AlertCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteDialog } from "@/components/organizer/reference-data/DeleteDialog";
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

type EventDetail = EventListItem & {
  description: string | null;
  stateId: string | null; zoneId: string | null;
  endDate: string | null;
  venue: string | null; address: string | null; city: string | null;
  latitude: number | null; longitude: number | null;
  registrationStart: string | null; registrationEnd: string | null;
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

const STATUSES = ["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;


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

function CompetitionsSection({ eventId, canWrite }: { eventId: string; canWrite: boolean }) {
  const [links,   setLinks]   = useState<EventCompLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<"list" | "form">("list");

  const [editing,    setEditing]    = useState<EventCompLink | null>(null);
  const [picName,    setPicName]    = useState("");
  const [picContact, setPicContact] = useState("");
  const [maxTeams,   setMaxTeams]   = useState(0);
  const [saving,     setSaving]     = useState(false);
  const [formErr,    setFormErr]    = useState("");

  const [compSearch,    setCompSearch]    = useState("");
  const [compResults,   setCompResults]   = useState<CompSearch[]>([]);
  const [compSearching, setCompSearching] = useState(false);
  const [picked,        setPicked]        = useState<CompSearch | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteTarget,   setDeleteTarget]   = useState<EventCompLink | null>(null);
  const [linkCourseFor,  setLinkCourseFor]  = useState<EventCompLink | null>(null);

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
  useEffect(() => { load(); }, [load]);

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

  function openEdit(link: EventCompLink) {
    setEditing(link); setPicked(link.competition);
    setPicName(link.picName ?? ""); setPicContact(link.picContact ?? "");
    setMaxTeams(link.maxTeams); setFormErr("");
    setView("form");
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

  return (
    <SectionCard
      title={`Pertandingan (${links.length})`}
      action={view === "list" && canWrite
        ? <Button size="sm" onClick={openAdd} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />Tambah</Button>
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
            <div className="divide-y">
              {links.map(link => (
                <div key={link.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{link.competition.name}</p>
                    <p className="text-xs font-mono text-zinc-400">{link.competition.code}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                      {link.picName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{link.picName}</span>}
                      {link.picContact && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{link.picContact}</span>}
                      {link.maxTeams > 0 && <span>Maks {link.maxTeams} pasukan</span>}
                      <span className="text-zinc-300">{link.competition._count.teams} berdaftar</span>
                    </div>
                    {/* EptimEdu course badge / link button */}
                    {canWrite ? (
                      <button type="button" onClick={() => setLinkCourseFor(link)}
                        className={`mt-1.5 flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors w-fit ${
                          link.eptimEduCourseId
                            ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                            : "border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
                        }`}>
                        <BookOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[160px]">{link.eptimEduCourseTitle ?? "Pautan kursus EptimEdu…"}</span>
                        {link.eptimEduCourseId && <Link2 className="h-3 w-3 shrink-0 opacity-60" />}
                      </button>
                    ) : link.eptimEduCourseId ? (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 w-fit">
                        <BookOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[160px]">{link.eptimEduCourseTitle}</span>
                      </div>
                    ) : null}
                  </div>
                  {canWrite && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                      <button onClick={() => openEdit(link)} className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button onClick={() => setDeleteTarget(link)} className="p-1 rounded hover:bg-red-50 text-red-400">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
    </SectionCard>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EventsClient({ role }: { role: OrganizerRole }) {
  const canWrite = ["SUPER_ADMIN", "ADMIN"].includes(role);

  const [events,  setEvents]  = useState<EventListItem[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [q,       setQ]       = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const [selected,      setSelected]      = useState<EventDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
      if (statusFilter) p.set("status", statusFilter);
      const res = await fetch(`/api/v2/organizer/events?${p}`);
      const j   = await res.json();
      setEvents(j.data ?? []);
      setTotal(j.total ?? 0);
    } finally { setLoading(false); }
  }, [page, q, statusFilter]);

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

  async function deleteEvent(item: EventListItem) {
    if (!confirm(`Padam "${item.name}"?`)) return;
    const res = await fetch(`/api/v2/organizer/events/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error === "HAS_COMPETITIONS" ? "Padam semua pertandingan terlebih dahulu." : "Gagal memadam.");
      return;
    }
    if (selected?.id === item.id) setSelected(null);
    load();
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
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Memuatkan…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Tiada acara ditemui.</p>
          ) : events.map(ev => {
            const isOnline = ev.scope.startsWith("ONLINE");
            return (
            <div key={ev.id}
              className={cn(
                "group flex cursor-pointer border-b last:border-0 transition-colors",
                selected?.id === ev.id ? "bg-blue-50" : "hover:bg-zinc-50"
              )}
              onClick={() => selectEvent(ev)}
            >
              <div className="w-2.5 shrink-0 self-stretch"
                style={{ background: isOnline ? "#7c3aed" : "#0ea5e9" }} />
              <div className="flex-1 min-w-0 px-3 py-2.5">
                <p className={cn("text-xs font-medium truncate", selected?.id === ev.id ? "text-blue-700" : "text-zinc-800")}>{ev.name}</p>
                {ev.startDate && (
                  <p className="text-[10px] text-zinc-400 mt-0.5">{fmtDate(ev.startDate)}</p>
                )}
              </div>
              {canWrite && (
                <button onClick={e => { e.stopPropagation(); deleteEvent(ev); }}
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
            <VenueSection      event={selected} canWrite={canWrite} onSaved={handleSectionSaved} />
            <CompetitionsSection eventId={selected.id} canWrite={canWrite} />
          </div>
        )}
      </main>
    </div>
  );
}
