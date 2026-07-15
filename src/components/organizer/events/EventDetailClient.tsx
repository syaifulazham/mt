"use client";

import { useState, useEffect, useCallback, lazy, Suspense, useRef } from "react";
import Link from "next/link";
import {
  CalendarDays, MapPin, Trophy, User, Phone, Users,
  ChevronLeft, Loader2, Tag, Target, Pencil, Trash2,
  Plus, Search, Sparkles, Navigation, X, AlertCircle,
  BookOpen, Link2, Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { OrganizerRole } from "@/types";

const MapPicker = lazy(() =>
  import("./MapPicker").then((m) => ({ default: m.MapPicker }))
);

const MapView = lazy(() =>
  import("./MapView").then((m) => ({ default: m.MapView }))
);

// ── Types ──────────────────────────────────────────────────────────────────────

type TargetGroup = { id: string; name: string; schoolLevel: string };

type Competition = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  participationType: string;
  minTeamSize: number;
  maxTeamSize: number;
  theme: { id: string; name: string; color: string | null } | null;
  targetGroups: { targetGroup: TargetGroup }[];
  _count: { teams: number };
  eptimEduCourseId:    string | null;
  eptimEduCourseTitle: string | null;
};

type EduCourse = {
  id: string;
  title: string;
  status: string;
  level: string | null;
  instructor: string | null;
  enrolmentCount: number;
  totalMinutes: number;
};

type EventCompetition = {
  id: string;
  picName: string | null;
  picContact: string | null;
  maxTeams: number;
  eptimEduCourseId:    string | null;
  eptimEduCourseTitle: string | null;
  competition: Competition;
};

type CatalogComp = {
  id: string;
  code: string;
  name: string;
  participationType: string;
  minTeamSize: number;
  maxTeamSize: number;
  theme: { id: string; name: string; color: string | null } | null;
};

type Event = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  scope: string;
  status: string;
  stateId: string | null;
  zoneId: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  startDate: string | null;
  endDate: string | null;
  registrationStart: string | null;
  registrationEnd: string | null;
  state: { id: string; name: string } | null;
  zone:  { id: string; name: string } | null;
  eventCompetitions: EventCompetition[];
  _count: { eventCompetitions: number };
};

type StateOption = { id: string; name: string };
type ZoneOption  = { id: string; name: string };

// ── Style maps ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  DRAFT:     "bg-zinc-100 text-zinc-600",
  PUBLISHED: "bg-blue-50 text-blue-700",
  ACTIVE:    "bg-green-50 text-green-700",
  COMPLETED: "bg-purple-50 text-purple-700",
  CANCELLED: "bg-red-50 text-red-500",
};

const SCOPE_STYLES: Record<string, string> = {
  NATIONAL:        "bg-amber-50 text-amber-700",
  STATE:           "bg-sky-50 text-sky-700",
  ZONE:            "bg-violet-50 text-violet-700",
  OPEN:            "bg-teal-50 text-teal-700",
  ONLINE_NATIONAL: "bg-amber-50 text-amber-600",
  ONLINE_STATE:    "bg-sky-50 text-sky-600",
  ONLINE_ZONE:     "bg-violet-50 text-violet-600",
  ONLINE_OPEN:     "bg-teal-50 text-teal-600",
};

const SCOPE_LABELS: Record<string, string> = {
  NATIONAL: "National", STATE: "State", ZONE: "Zone", OPEN: "Open",
  ONLINE_NATIONAL: "Online National", ONLINE_STATE: "Online State",
  ONLINE_ZONE: "Online Zone", ONLINE_OPEN: "Online Open",
};

const TYPE_STYLES: Record<string, string> = {
  INDIVIDUAL: "bg-sky-50 text-sky-700",
  TEAM:       "bg-violet-50 text-violet-700",
};

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function scopeConfig(scope: string) {
  return SCOPE_OPTIONS.find((s) => s.value === scope) ?? SCOPE_OPTIONS[0];
}

function genCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── EptimEdu Course Link Modal ────────────────────────────────────────────────

function EptimEduLinkModal({
  open,
  ec,
  eventId,
  onClose,
  onSaved,
}: {
  open: boolean;
  ec: EventCompetition | null;
  eventId: string;
  onClose: () => void;
  onSaved: (ecId: string, courseId: string | null, courseTitle: string | null) => void;
}) {
  const [courses,    setCourses]    = useState<EduCourse[]>([]);
  const [filtered,   setFiltered]   = useState<EduCourse[]>([]);
  const [q,          setQ]          = useState("");
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load courses when modal opens
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(ec?.eptimEduCourseId ?? null);
    setQ(""); setError("");
    setLoading(true);
    fetch("/api/v2/organizer/eptimedu/courses")
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); return; }
        const invOnly = (j.data ?? []).filter((c: EduCourse) => c.status === "INVITE_ONLY");
        setCourses(invOnly);
        setFiltered(invOnly);
      })
      .catch(() => setError("Failed to load courses"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Client-side filter
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setFiltered(q.trim() ? courses.filter(c => c.title.toLowerCase().includes(q.toLowerCase())) : courses); }, [q, courses]);

  async function handleSave() {
    if (!ec) return;
    setSaving(true); setError("");
    const chosen = selectedId ? courses.find(c => c.id === selectedId) ?? null : null;
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${ec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eptimEduCourseId:    chosen?.id    ?? null,
          eptimEduCourseTitle: chosen?.title ?? null,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Gagal menyimpan"); }
      onSaved(ec.id, chosen?.id ?? null, chosen?.title ?? null);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-500" />
            Link EptimEdu Course
          </DialogTitle>
          {ec && (
            <p className="text-xs text-zinc-400 mt-0.5 truncate">{ec.competition.name}</p>
          )}
        </DialogHeader>

        <div className="px-6 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search courses…"
              className="w-full pl-8 pr-3 h-9 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="px-6 pb-2 max-h-72 overflow-y-auto space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-6">No courses found.</p>
          )}

          {/* "No course" option to unlink */}
          {!loading && !error && courses.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                selectedId === null
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <Unlink className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="text-sm text-zinc-500 italic">No course (unlink)</span>
              </div>
            </button>
          )}

          {!loading && filtered.map(course => (
            <button
              key={course.id}
              type="button"
              onClick={() => setSelectedId(course.id)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                selectedId === course.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{course.title}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {course.instructor && <span>{course.instructor} · </span>}
                    {course.totalMinutes > 0 && <span>{course.totalMinutes} min · </span>}
                    <span>{course.enrolmentCount} enrolled</span>
                  </p>
                </div>
                {course.level && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium mt-0.5">
                    {course.level}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {selectedId ? "Link Course" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Competition Card ───────────────────────────────────────────────────────────

function CompetitionCard({
  ec,
  canWrite,
  onEdit,
  onDelete,
  onLinkCourse,
}: {
  ec: EventCompetition;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLinkCourse: () => void;
}) {
  const c = ec.competition;
  const themeColor = c.theme?.color ?? "#6366f1";

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="h-1.5 w-full" style={{ backgroundColor: themeColor }} />

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm leading-tight">{c.name}</p>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{c.code}</p>
          </div>
          {canWrite && (
            <div className="flex gap-1 shrink-0">
              <button onClick={onEdit} className="p-1 rounded hover:bg-zinc-100">
                <Pencil className="h-3.5 w-3.5 text-zinc-400" />
              </button>
              <button onClick={onDelete} className="p-1 rounded hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </button>
            </div>
          )}
        </div>

        {c.description && (
          <p className="text-xs text-zinc-500 line-clamp-2">{c.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${TYPE_STYLES[c.participationType] ?? "bg-zinc-100 text-zinc-600"}`}>
            {c.participationType}
          </span>
          {c.participationType === "TEAM" && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
              {c.minTeamSize === c.maxTeamSize ? `${c.minTeamSize} per team` : `${c.minTeamSize}–${c.maxTeamSize} per team`}
            </span>
          )}
          {c.theme && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${themeColor}18`, color: themeColor }}>
              {c.theme.name}
            </span>
          )}
        </div>

        {c.targetGroups.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {c.targetGroups.map(({ targetGroup: tg }) => (
              <span key={tg.id} className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-50 border text-zinc-500">
                {tg.name}
              </span>
            ))}
          </div>
        )}

        {/* EptimEdu course link (event-specific, independent of competition general course) */}
        {canWrite ? (
          <button
            type="button"
            onClick={onLinkCourse}
            className={`w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              ec.eptimEduCourseId
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                : "border-dashed border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700"
            }`}
          >
            <BookOpen className="h-3 w-3 shrink-0" />
            <span className="flex-1 text-left">{ec.eptimEduCourseTitle ?? "Link EptimEdu course…"}</span>
            {ec.eptimEduCourseId && <Link2 className="h-3 w-3 shrink-0 ml-auto opacity-60" />}
          </button>
        ) : ec.eptimEduCourseId ? (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
            <BookOpen className="h-3 w-3 shrink-0" />
            <span>{ec.eptimEduCourseTitle}</span>
          </div>
        ) : null}

        <div className="border-t mt-auto pt-3 space-y-1.5">
          {(ec.picName || ec.picContact) && (
            <div className="space-y-0.5">
              {ec.picName && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <User className="h-3 w-3 text-zinc-400 shrink-0" />
                  {ec.picName}
                </div>
              )}
              {ec.picContact && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Phone className="h-3 w-3 shrink-0" />
                  {ec.picContact}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-zinc-400" />
              <span>{c._count.teams} team{c._count.teams !== 1 ? "s" : ""}</span>
            </div>
            {ec.maxTeams > 0 && (
              <div className="flex items-center gap-1">
                <Target className="h-3 w-3 text-zinc-400" />
                <span>max {ec.maxTeams}/contingent</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Form defaults ──────────────────────────────────────────────────────────────

const EMPTY_EDIT = {
  name: "", slug: "", description: "",
  scope: "NATIONAL", stateId: "", zoneId: "",
  venue: "", address: "", city: "",
  latitude: null as number | null,
  longitude: null as number | null,
  startDate: "", endDate: "",
  registrationStart: "", registrationEnd: "",
  status: "DRAFT",
};

const EMPTY_EC = { picName: "", picContact: "", maxTeams: "" };

// ── Main Component ─────────────────────────────────────────────────────────────

export function EventDetailClient({ slug, role }: { slug: string; role: OrganizerRole }) {
  const canWrite = ["SUPER_ADMIN", "ADMIN"].includes(role);

  // ── Event data ──────────────────────────────────────────────────────────────
  const [event, setEvent]     = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Reference data ──────────────────────────────────────────────────────────
  const [states, setStates] = useState<StateOption[]>([]);
  const [zones,  setZones]  = useState<ZoneOption[]>([]);

  // ── Edit event dialog ───────────────────────────────────────────────────────
  const [editOpen,    setEditOpen]    = useState(false);
  const [editForm,    setEditForm]    = useState(EMPTY_EDIT);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState("");
  const [aiLocLoading, setAiLocLoading] = useState(false);
  const [aiLocError,   setAiLocError]   = useState("");
  const [showMap,      setShowMap]      = useState(false);

  // ── Add competition panel ───────────────────────────────────────────────────
  const [addCompOpen,   setAddCompOpen]   = useState(false);
  const [compQ,         setCompQ]         = useState("");
  const [compResults,   setCompResults]   = useState<CatalogComp[]>([]);
  const [compSearching, setCompSearching] = useState(false);
  const [compSelected,  setCompSelected]  = useState<CatalogComp | null>(null);
  const [addCompForm,   setAddCompForm]   = useState(EMPTY_EC);
  const [addCompSaving, setAddCompSaving] = useState(false);
  const [addCompError,  setAddCompError]  = useState("");

  // ── Edit competition dialog ─────────────────────────────────────────────────
  const [editCompTarget, setEditCompTarget] = useState<EventCompetition | null>(null);
  const [editCompForm,   setEditCompForm]   = useState(EMPTY_EC);
  const [editCompSaving, setEditCompSaving] = useState(false);
  const [editCompError,  setEditCompError]  = useState("");

  // ── EptimEdu course link modal ──────────────────────────────────────────────
  const [linkCourseTarget, setLinkCourseTarget] = useState<EventCompetition | null>(null);

  function handleCourseSaved(ecId: string, courseId: string | null, courseTitle: string | null) {
    setEvent(ev => ev ? {
      ...ev,
      eventCompetitions: ev.eventCompetitions.map(ec =>
        ec.id === ecId
          ? { ...ec, eptimEduCourseId: courseId, eptimEduCourseTitle: courseTitle }
          : ec
      ),
    } : ev);
  }

  // ── Venue map toggle ────────────────────────────────────────────────────────
  const [showVenueMap, setShowVenueMap] = useState(false);

  // ── Delete competition dialog ───────────────────────────────────────────────
  const [deleteCompTarget,   setDeleteCompTarget]   = useState<EventCompetition | null>(null);
  const [deleteCompCode,     setDeleteCompCode]     = useState("");
  const [deleteCompExpected, setDeleteCompExpected] = useState("");
  const [deletingComp,       setDeletingComp]       = useState(false);

  const cfg = scopeConfig(editForm.scope);

  // ── Load event ──────────────────────────────────────────────────────────────
  const loadEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/organizer/events/slug/${slug}`);
      const j = await res.json();
      if (j.error === "NOT_FOUND") { setNotFound(true); return; }
      setEvent(j.data);
    } catch { setNotFound(true); }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEvent().finally(() => setLoading(false));
  }, [loadEvent]);

  // ── Load states/zones when write mode ──────────────────────────────────────
  useEffect(() => {
    if (!canWrite) return;
    fetch("/api/v2/organizer/reference-data/states?pageSize=100")
      .then(r => r.json()).then(j => setStates(j.data ?? []));
    fetch("/api/v2/organizer/reference-data/zones?pageSize=200")
      .then(r => r.json()).then(j => setZones(j.data ?? []));
  }, [canWrite]);

  // ── Competition search (debounced) ──────────────────────────────────────────
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    linkedIdsRef.current = new Set(event?.eventCompetitions.map(ec => ec.competition.id) ?? []);
  }, [event?.eventCompetitions]);

  useEffect(() => {
    if (!addCompOpen) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setCompSearching(true);
      try {
        const res = await fetch(`/api/v2/organizer/competitions?q=${encodeURIComponent(compQ)}&pageSize=30`);
        const j = await res.json();
        setCompResults((j.data ?? []).filter((c: CatalogComp) => !linkedIdsRef.current.has(c.id)));
      } catch { /* ignore */ } finally {
        setCompSearching(false);
      }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [compQ, addCompOpen]);

  // ── Edit event ──────────────────────────────────────────────────────────────
  function openEditEvent() {
    if (!event) return;
    setEditForm({
      name:              event.name,
      slug:              event.slug,
      description:       event.description ?? "",
      scope:             event.scope,
      stateId:           event.stateId ?? "",
      zoneId:            event.zoneId  ?? "",
      venue:             event.venue   ?? "",
      address:           event.address ?? "",
      city:              event.city    ?? "",
      latitude:          event.latitude,
      longitude:         event.longitude,
      startDate:         event.startDate         ? event.startDate.slice(0, 10)         : "",
      endDate:           event.endDate           ? event.endDate.slice(0, 10)           : "",
      registrationStart: event.registrationStart ? event.registrationStart.slice(0, 10) : "",
      registrationEnd:   event.registrationEnd   ? event.registrationEnd.slice(0, 10)   : "",
      status:            event.status,
    });
    setEditError(""); setAiLocError("");
    setShowMap(!!(event.latitude && event.longitude));
    setEditOpen(true);
  }

  async function handleSaveEvent() {
    if (!event || !editForm.name.trim()) { setEditError("Name is required."); return; }
    setEditSaving(true); setEditError("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          stateId:           editForm.stateId   || null,
          zoneId:            editForm.zoneId    || null,
          city:              editForm.city      || null,
          latitude:          editForm.latitude,
          longitude:         editForm.longitude,
          startDate:         editForm.startDate         || null,
          endDate:           editForm.endDate           || null,
          registrationStart: editForm.registrationStart || null,
          registrationEnd:   editForm.registrationEnd   || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error === "SLUG_TAKEN" ? "Slug already in use." : (j.error ?? `Error ${res.status}`));
      }
      setEditOpen(false);
      await loadEvent();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAiLocation() {
    if (!editForm.venue && !editForm.address) {
      setAiLocError("Enter a venue or address first.");
      return;
    }
    setAiLocLoading(true); setAiLocError("");
    try {
      const res = await fetch("/api/v2/organizer/events/ai-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue: editForm.venue, address: editForm.address }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail ?? j.error ?? "AI location failed");
      const loc = j.data;
      setEditForm(f => ({
        ...f,
        latitude:  loc.latitude  ?? f.latitude,
        longitude: loc.longitude ?? f.longitude,
        city:      loc.city      ?? f.city,
        address:   loc.formattedAddress ?? f.address,
      }));
      if (loc.latitude && loc.longitude) setShowMap(true);
    } catch (e: unknown) {
      setAiLocError(e instanceof Error ? e.message : "Failed");
    } finally {
      setAiLocLoading(false);
    }
  }

  // ── Add competition ──────────────────────────────────────────────────────────
  function openAddComp() {
    setCompQ(""); setCompResults([]); setCompSelected(null);
    setAddCompForm(EMPTY_EC); setAddCompError("");
    setAddCompOpen(true);
  }

  async function handleAddComp() {
    if (!event || !compSelected) return;
    setAddCompSaving(true); setAddCompError("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/competitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitionId: compSelected.id,
          picName:    addCompForm.picName    || null,
          picContact: addCompForm.picContact || null,
          maxTeams:   addCompForm.maxTeams   ? Number(addCompForm.maxTeams) : 0,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error === "ALREADY_LINKED" ? "Already linked." : (j.error ?? `Error ${res.status}`));
      }
      setAddCompOpen(false);
      await loadEvent();
    } catch (e: unknown) {
      setAddCompError(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setAddCompSaving(false);
    }
  }

  // ── Edit competition ─────────────────────────────────────────────────────────
  function openEditComp(ec: EventCompetition) {
    setEditCompTarget(ec);
    setEditCompForm({
      picName:    ec.picName    ?? "",
      picContact: ec.picContact ?? "",
      maxTeams:   String(ec.maxTeams || ""),
    });
    setEditCompError("");
  }

  async function handleSaveComp() {
    if (!event || !editCompTarget) return;
    setEditCompSaving(true); setEditCompError("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/competitions/${editCompTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picName:    editCompForm.picName    || null,
          picContact: editCompForm.picContact || null,
          maxTeams:   editCompForm.maxTeams   ? Number(editCompForm.maxTeams) : 0,
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = await res.json();
      setEvent(ev => ev ? {
        ...ev,
        eventCompetitions: ev.eventCompetitions.map(ec =>
          ec.id === editCompTarget.id ? j.data : ec
        ),
      } : ev);
      setEditCompTarget(null);
    } catch (e: unknown) {
      setEditCompError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setEditCompSaving(false);
    }
  }

  // ── Delete competition ───────────────────────────────────────────────────────
  function openDeleteComp(ec: EventCompetition) {
    setDeleteCompTarget(ec);
    setDeleteCompExpected(genCode());
    setDeleteCompCode("");
  }

  async function handleDeleteComp() {
    if (!event || !deleteCompTarget) return;
    setDeletingComp(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/competitions/${deleteCompTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setEvent(ev => ev ? {
        ...ev,
        eventCompetitions: ev.eventCompetitions.filter(ec => ec.id !== deleteCompTarget.id),
        _count: { eventCompetitions: ev._count.eventCompetitions - 1 },
      } : ev);
      setDeleteCompTarget(null);
    } catch { /* ignore */ } finally {
      setDeletingComp(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-zinc-400">
        <p className="text-lg font-medium">Event not found</p>
        <Link href="/organizer/events" className="text-sm text-blue-600 hover:underline">
          Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Back */}
      <Link href="/organizer/events" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700">
        <ChevronLeft className="h-4 w-4" />
        All Events
      </Link>

      {/* ── Event Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SCOPE_STYLES[event.scope] ?? "bg-zinc-100 text-zinc-600"}`}>
              {SCOPE_LABELS[event.scope] ?? event.scope}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[event.status] ?? "bg-zinc-100 text-zinc-600"}`}>
              {event.status}
            </span>
          </div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-sm text-zinc-400 font-mono mt-0.5">{event.slug}</p>
          {(event.state || event.zone) && (
            <p className="text-sm text-zinc-500 mt-1">
              {event.zone?.name ?? event.state?.name}
            </p>
          )}
        </div>
        {canWrite && (
          <Button variant="outline" size="sm" onClick={openEditEvent}>
            <Pencil className="h-4 w-4 mr-1.5" /> Edit Event
          </Button>
        )}
      </div>

      {/* ── Details Grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {event.description && (
          <div className="md:col-span-2">
            <p className="text-sm text-zinc-600 leading-relaxed">{event.description}</p>
          </div>
        )}

        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <CalendarDays className="h-4 w-4 text-zinc-400" />
            Event Dates
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Start</span>
              <span className="font-medium">{fmtDate(event.startDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">End</span>
              <span className="font-medium">{fmtDate(event.endDate)}</span>
            </div>
          </div>
          {(event.registrationStart || event.registrationEnd) && (
            <>
              <div className="border-t pt-3 flex items-center gap-2 text-sm font-medium text-zinc-700">
                <Tag className="h-4 w-4 text-zinc-400" />
                Registration Period
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Opens</span>
                  <span className="font-medium">{fmtDate(event.registrationStart)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Closes</span>
                  <span className="font-medium">{fmtDate(event.registrationEnd)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {(event.venue || event.address || event.city) && (
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                <MapPin className="h-4 w-4 text-zinc-400" />
                Venue &amp; Location
              </div>
              {event.latitude && event.longitude && (
                <button
                  onClick={() => setShowVenueMap(v => !v)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <Navigation className="h-3 w-3" />
                  {showVenueMap ? "Hide map" : "View map"}
                </button>
              )}
            </div>
            <div className="space-y-1 text-sm">
              {event.venue && <p className="font-medium">{event.venue}</p>}
              {event.address && <p className="text-zinc-500">{event.address}</p>}
              {event.city && <p className="text-zinc-400">{event.city}</p>}
              {event.latitude && event.longitude && (
                <p className="text-xs text-zinc-300 font-mono">
                  {event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}
                </p>
              )}
            </div>
            {showVenueMap && event.latitude && event.longitude && (
              <Suspense fallback={
                <div className="h-52 rounded-md border border-zinc-200 flex items-center justify-center text-zinc-400 text-sm">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading map…
                </div>
              }>
                <MapView lat={event.latitude} lng={event.longitude} />
              </Suspense>
            )}
          </div>
        )}
      </div>

      {/* ── Competitions ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Competitions</h2>
            <span className="text-sm text-zinc-400">{event._count.eventCompetitions}</span>
          </div>
          {canWrite && (
            <Button size="sm" onClick={openAddComp}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </div>

        {/* ── Add competition panel ──────────────────────────────────────── */}
        {addCompOpen && (
          <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Link a competition to this event</p>
              <button onClick={() => setAddCompOpen(false)} className="p-1 rounded hover:bg-zinc-100">
                <X className="h-4 w-4 text-zinc-400" />
              </button>
            </div>

            {!compSelected ? (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or code…"
                    value={compQ}
                    onChange={(e) => setCompQ(e.target.value)}
                    className="pl-8"
                    autoFocus
                  />
                </div>
                {compSearching && (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                  </div>
                )}
                {!compSearching && compQ && compResults.length === 0 && (
                  <p className="text-sm text-zinc-400 text-center py-3">No unlinked competitions found.</p>
                )}
                {!compSearching && compResults.length > 0 && (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {compResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setCompSelected(c)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 transition-colors"
                      >
                        <span className="font-medium text-sm">{c.name}</span>
                        <span className="text-xs text-zinc-400 font-mono ml-2">{c.code}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ml-2 font-medium ${TYPE_STYLES[c.participationType] ?? "bg-zinc-100 text-zinc-600"}`}>
                          {c.participationType}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 border">
                  <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{compSelected.name}</p>
                    <p className="text-xs text-zinc-400 font-mono">{compSelected.code}</p>
                  </div>
                  <button onClick={() => setCompSelected(null)} className="p-1 rounded hover:bg-zinc-200">
                    <X className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Person in Charge</Label>
                    <Input
                      value={addCompForm.picName}
                      onChange={(e) => setAddCompForm(f => ({ ...f, picName: e.target.value }))}
                      placeholder="Name (optional)"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Contact</Label>
                    <Input
                      value={addCompForm.picContact}
                      onChange={(e) => setAddCompForm(f => ({ ...f, picContact: e.target.value }))}
                      placeholder="Phone / email (optional)"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="max-w-xs">
                  <Label className="text-xs">Max Teams per Contingent</Label>
                  <Input
                    type="number"
                    min="0"
                    value={addCompForm.maxTeams}
                    onChange={(e) => setAddCompForm(f => ({ ...f, maxTeams: e.target.value }))}
                    placeholder="0 = unlimited"
                    className="mt-1"
                  />
                </div>

                {addCompError && <p className="text-xs text-red-500">{addCompError}</p>}

                <div className="flex gap-2">
                  <Button onClick={handleAddComp} disabled={addCompSaving}>
                    {addCompSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Link Competition
                  </Button>
                  <Button variant="outline" onClick={() => setAddCompOpen(false)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        {event.eventCompetitions.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-zinc-50 flex flex-col items-center justify-center py-14 gap-2 text-zinc-400">
            <Trophy className="h-8 w-8 text-zinc-200" />
            <p className="text-sm">No competitions linked to this event yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {event.eventCompetitions.map((ec) => (
              <CompetitionCard
                key={ec.id}
                ec={ec}
                canWrite={canWrite}
                onEdit={() => openEditComp(ec)}
                onDelete={() => openDeleteComp(ec)}
                onLinkCourse={() => setLinkCourseTarget(ec)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Edit Event Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={(v) => !v && setEditOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader className="pl-6 pr-14">
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>

          <div className="px-6 space-y-5">

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Event Name *</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={editForm.slug}
                  onChange={(e) => setEditForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                  className="mt-1 font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-start">
              <div>
                <Label>Scope</Label>
                <select
                  value={editForm.scope}
                  onChange={(e) => setEditForm(f => ({ ...f, scope: e.target.value, stateId: "", zoneId: "" }))}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {SCOPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {cfg.needsState && (
                <div>
                  <Label>State</Label>
                  <select
                    value={editForm.stateId}
                    onChange={(e) => setEditForm(f => ({ ...f, stateId: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select a state</option>
                    {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {cfg.needsZone && (
                <div>
                  <Label>Zone</Label>
                  <select
                    value={editForm.zoneId}
                    onChange={(e) => setEditForm(f => ({ ...f, zoneId: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select a zone</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <Label>Description</Label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            <div>
              <Label className="mb-1 block">Event Dates</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">Start Date</Label>
                  <Input type="date" value={editForm.startDate}
                    onChange={(e) => setEditForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">End Date</Label>
                  <Input type="date" value={editForm.endDate}
                    onChange={(e) => setEditForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" />
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-1 block">Registration Period</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">Opens</Label>
                  <Input type="date" value={editForm.registrationStart}
                    onChange={(e) => setEditForm(f => ({ ...f, registrationStart: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Closes</Label>
                  <Input type="date" value={editForm.registrationEnd}
                    onChange={(e) => setEditForm(f => ({ ...f, registrationEnd: e.target.value }))} className="mt-1" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Venue &amp; Location</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAiLocation}
                  disabled={aiLocLoading || (!editForm.venue && !editForm.address)}
                  className="gap-1.5 text-xs h-7 border-violet-200 text-violet-700 hover:bg-violet-50"
                >
                  {aiLocLoading
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Finding…</>
                    : <><Sparkles className="h-3 w-3" /> Find on Map with AI</>}
                </Button>
              </div>
              {aiLocError && <p className="text-xs text-red-500">{aiLocError}</p>}
              <div>
                <Label className="text-xs text-zinc-500">Venue</Label>
                <Input
                  value={editForm.venue}
                  onChange={(e) => setEditForm(f => ({ ...f, venue: e.target.value }))}
                  placeholder="e.g. Kuala Lumpur Convention Centre"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">Address</Label>
                  <Input
                    value={editForm.address}
                    onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">City</Label>
                  <Input
                    value={editForm.city}
                    onChange={(e) => setEditForm(f => ({ ...f, city: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">Latitude</Label>
                  <Input
                    value={editForm.latitude ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : parseFloat(e.target.value);
                      setEditForm(f => ({ ...f, latitude: isNaN(v as number) ? f.latitude : v }));
                    }}
                    placeholder="e.g. 3.1390"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Longitude</Label>
                  <Input
                    value={editForm.longitude ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : parseFloat(e.target.value);
                      setEditForm(f => ({ ...f, longitude: isNaN(v as number) ? f.longitude : v }));
                    }}
                    placeholder="e.g. 101.6869"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMap(v => !v)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700"
              >
                <Navigation className="h-3.5 w-3.5" />
                {showMap ? "Hide map" : "Pick location on map"}
              </button>
              {showMap && (
                <Suspense fallback={
                  <div className="h-64 rounded-md border border-zinc-200 flex items-center justify-center text-zinc-400 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading map…
                  </div>
                }>
                  <MapPicker
                    lat={editForm.latitude}
                    lng={editForm.longitude}
                    onChange={(lat, lng) => setEditForm(f => ({ ...f, latitude: lat, longitude: lng }))}
                  />
                </Suspense>
              )}
            </div>

            <div>
              <Label>Status</Label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {editError && <p className="text-sm text-red-500 px-6 mt-1">{editError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEvent} disabled={editSaving}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Competition Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!editCompTarget} onOpenChange={(v) => !v && setEditCompTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="pl-6 pr-14">
            <DialogTitle>Edit Competition Details</DialogTitle>
            {editCompTarget && (
              <p className="text-sm text-zinc-500 mt-0.5">{editCompTarget.competition.name}</p>
            )}
          </DialogHeader>
          <div className="px-6 space-y-4">
            <div>
              <Label className="text-xs">Person in Charge</Label>
              <Input
                value={editCompForm.picName}
                onChange={(e) => setEditCompForm(f => ({ ...f, picName: e.target.value }))}
                placeholder="Name (optional)"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Contact</Label>
              <Input
                value={editCompForm.picContact}
                onChange={(e) => setEditCompForm(f => ({ ...f, picContact: e.target.value }))}
                placeholder="Phone / email (optional)"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Max Teams per Contingent</Label>
              <Input
                type="number"
                min="0"
                value={editCompForm.maxTeams}
                onChange={(e) => setEditCompForm(f => ({ ...f, maxTeams: e.target.value }))}
                placeholder="0 = unlimited"
                className="mt-1"
              />
            </div>
            {editCompError && <p className="text-xs text-red-500">{editCompError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCompTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveComp} disabled={editCompSaving}>
              {editCompSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Competition Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!deleteCompTarget} onOpenChange={(v) => !v && setDeleteCompTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="pl-6 pr-14">
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Remove Competition
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 space-y-4">
            {deleteCompTarget && (
              <>
                <p className="text-sm text-zinc-600">
                  Remove <span className="font-semibold">{deleteCompTarget.competition.name}</span> from this event?
                  The competition itself will not be deleted.
                </p>
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center space-y-1">
                  <p className="text-xs text-red-500">Type this code to confirm:</p>
                  <p className="text-xl font-mono font-bold tracking-widest text-red-700">
                    {deleteCompExpected}
                  </p>
                </div>
                <Input
                  value={deleteCompCode}
                  onChange={(e) => setDeleteCompCode(e.target.value.toUpperCase())}
                  placeholder="Type the code above"
                  className="font-mono text-center tracking-widest uppercase"
                  maxLength={5}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCompTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteComp}
              disabled={deletingComp || deleteCompCode !== deleteCompExpected}
            >
              {deletingComp && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EptimEdu Course Link Modal ─────────────────────────────────────── */}
      <EptimEduLinkModal
        open={!!linkCourseTarget}
        ec={linkCourseTarget}
        eventId={event?.id ?? ""}
        onClose={() => setLinkCourseTarget(null)}
        onSaved={handleCourseSaved}
      />

    </div>
  );
}
