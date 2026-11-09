"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  Users,
  User,
  Trophy,
  MapPin,
  Calendar,
  CalendarDays,
  ArrowRight,
  ArrowUpRight,
  X,
  CheckCircle,
  QrCode,
  Loader2,
  PartyPopper,
  Gamepad2,
  Eye,
  EyeOff,
  Copy,
  Clock,
  RefreshCw,
  KeyRound,
  BookOpen,
  Plus,
} from "lucide-react";
import { buildSlotSchedule, fmtSlotDate, fmtSlotMin, slotDateChoices, type SlotScheduleConfig } from "@/lib/walkin-slots";
import type { ArenaChallengeView } from "@/lib/arena-client";

/* ── Types ─────────────────────────────────────────────────────────────── */

type Participant = {
  id: string;
  name: string;
  /** IC without separators; null for participants without one. */
  ic: string | null;
  gender: string;
  eduLevel: string;
  classGrade: string | null;
  contingent: { name: string; shortName: string | null };
};

type TeamEntry = {
  team: {
    id: string;
    name: string;
    status: string;
    competition: { id: string; code: string; name: string };
    contingent: { name: string; shortName: string | null };
  };
};

type CompetitionEntry = {
  id: string;
  code: string;
  name: string;
  participationType: string;
  theme: { name: string; color: string | null } | null;
  enrolled: boolean;
};

type WalkInEntry = {
  id: string;
  maxSlots: number;
  useViblockarena: boolean;
  useVibeblocks: boolean;
  /** "VibeBlocks" or "TechTriathlon" — the platform the token is for. */
  gameName?: string;
  walkInSlotSchedule: SlotScheduleConfig | null;
  registrations: number;
  event: {
    id: string;
    name: string;
    slug: string;
    venue: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  competition: {
    id: string; code: string; name: string; participationType: string;
    minTeamSize: number; maxTeamSize: number;
  };
};

type WalkInReg = {
  id: string;
  /** PENDING / CONFIRMED registration, or SUBMITTED: a team entry awaiting the organizer's verification. */
  status: string;
  viblockToken: string | null;
  /** VibeBlocks entry token (the part a participant types in), when issued. */
  vibeBlocksToken?: string | null;
  slotDate?: string;
  sessionNumber: number | null;
  slotNumber: number | null;
  team?: { name: string; members: string[] } | null;
};

type SlotChoice = { sessionNumber: number; slotNumber: number; slotDate?: string };
type TeamDraft = { teamName: string; members: { ic: string; name: string }[] };

/** Member-count bounds for a TEAM walk-in competition (the server enforces the same). */
function teamBounds(c: WalkInEntry["competition"]) {
  const max = Math.max(1, c.maxTeamSize);
  return { min: Math.min(Math.max(1, c.minTeamSize), max), max };
}

/** Problem with a team draft, or "" when it may be sent. */
function teamDraftError(c: WalkInEntry["competition"], d: TeamDraft): string {
  const { min, max } = teamBounds(c);
  if (d.teamName.trim().length < 2) return "Sila isikan nama pasukan.";
  if (d.members.length < min || d.members.length > max)
    return min === max ? `Pasukan mesti ${min} orang ahli.` : `Pasukan mesti ${min}–${max} orang ahli.`;
  const bad = d.members.findIndex((m) => m.ic.length < 6 || m.name.trim().length < 3);
  if (bad >= 0) return `Ahli ${bad + 1}: isikan No. IC (6–12 digit) dan nama penuh.`;
  if (new Set(d.members.map((m) => m.ic)).size !== d.members.length) return "No. IC ahli pasukan tidak boleh berulang.";
  return "";
}

type QuizzlyToken = {
  token: string;
  startUrl: string | null;
  quizTitle: string | null;
  expiresAt: string | null;
  /** Quizzly's state; null/absent when it could not be checked (shown as stored). */
  state?: "active" | "not_yet_valid" | "redeemed" | "expired" | "revoked" | null;
  /** Quizzly confirmed it lapsed without being redeemed — safe to replace. */
  expiredUnused?: boolean;
};

type Fc1Entry = {
  id: string;                 // eventCompetitionId
  targetGroupName: string;
  event: {
    id: string; name: string; slug: string; startDate: string | null; endDate: string | null;
    allowMultipleParticipation: boolean;
  };
  competition: { id: string; code: string; name: string };
  course?: CourseRef | null;
  challenges: ArenaChallengeView[];
};

/** Bengkel MT (EptimEdu) course of an individual competition. */
type CourseRef = { id: string; title: string; enrolled: boolean };

/**
 * Register for (or open) the Bengkel MT course of an individual competition,
 * on the participant's own LMS account. One click enrols if needed and opens
 * the LMS through SSO in a new tab.
 */
function CourseButton({ eventCompetitionId, course }: { eventCompetitionId: string; course: CourseRef }) {
  const [enrolled, setEnrolled] = useState(course.enrolled);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  async function open() {
    setBusy(true); setError("");
    try {
      const res  = await fetch("/api/v2/participant/bengkel/course", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventCompetitionId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Gagal membuka kursus");
      setEnrolled(true);
      // New tab only — see EptimCsiTeamButton for why there is no fallback on
      // window.open()'s return value.
      window.open((json as { loginUrl: string }).loginUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuka kursus");
    } finally { setBusy(false); }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        title={course.title}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-medium transition-colors max-w-[18rem]"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <BookOpen className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{enrolled ? "Buka kursus" : "Daftar kursus"} · {course.title}</span>
        <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** One Eptim Drone card: a team of the participant × the event-competition it is entered in. */
type DroneEntry = {
  id: string;                 // `${teamId}:${eventCompetitionId}`
  teamId: string;
  teamName: string;
  eventCompetitionId: string;
  event: { id: string; name: string; startDate: string | null; endDate: string | null };
  competition: { id: string; code: string; name: string };
  challenges: ArenaChallengeView[];
};

type ArenaLink = { url: string; expiresAt: string };

/**
 * One challenge with the single action its state calls for — shared by the
 * FC-1 (individual) and Eptim Drone (team) sections:
 *   completed → Selesai · best score; not registered → Daftar;
 *   no attempts left → Cubaan telah habis; valid link → Mula cabaran;
 *   otherwise → Mohon pautan baharu.
 */
function ArenaChallengeRow({
  c, live, nowMs, busy, anyBusy, error, hideRegister, registerDisabled, onRegister, onRenew, onOpen,
}: {
  c: ArenaChallengeView;
  live: { registered: boolean; link: ArenaLink | null };
  nowMs: number;
  busy: boolean;
  anyBusy: boolean;
  error: string | null;
  hideRegister: boolean;
  registerDisabled: boolean;
  onRegister: () => void;
  onRenew: () => void;
  onOpen: (url: string) => void;
}) {
  const link = live.link && new Date(live.link.expiresAt).getTime() > nowMs ? live.link : null;
  const btn  = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <div className="px-4 py-2.5 space-y-1">
      <div className="flex items-center gap-3">
        <Gamepad2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-100 truncate">{c.name}</p>

        {c.completed ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" /> Selesai
            {c.best && <span className="font-normal text-zinc-500">· {c.best.score}/{c.best.maxScore}</span>}
          </span>
        ) : !live.registered ? (
          hideRegister ? null : (
            <button type="button" onClick={onRegister} disabled={anyBusy || registerDisabled}
              className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Daftar
            </button>
          )
        ) : c.attemptsRemaining === 0 ? (
          <span className="text-[11px] text-zinc-400">Cubaan telah habis</span>
        ) : link ? (
          <button type="button" onClick={() => onOpen(link.url)}
            className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}>
            <ArrowUpRight className="h-3.5 w-3.5" /> Mula cabaran
          </button>
        ) : (
          <button type="button" onClick={onRenew} disabled={anyBusy}
            className={`${btn} border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300`}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Mohon pautan baharu
          </button>
        )}
      </div>

      {/* One line of context under the action, when there is any. */}
      {error ? (
        <p className="pl-7 text-[11px] text-red-500 dark:text-red-400">{error}</p>
      ) : link && !c.completed ? (
        <p className="pl-7 text-[10px] text-zinc-400">
          Berdaftar · pautan sah hingga{" "}
          {new Date(link.expiresAt).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
        </p>
      ) : live.registered && !c.completed ? (
        <p className="pl-7 text-[10px] text-zinc-400">
          Berdaftar{c.attemptsRemaining != null && c.attemptsRemaining > 0 ? ` · ${c.attemptsRemaining} cubaan lagi` : ""}
        </p>
      ) : null}
    </div>
  );
}

type QuizzlyEntry = {
  id: string;
  sessionTitle: string | null;
  assignBy: string | null;
  targetGroupName: string | null;
  quiz: { id: string; title: string; grade: string | null } | null;
  token: QuizzlyToken | null;
  event: {
    id: string; name: string; slug: string; startDate: string | null; endDate: string | null;
    allowMultipleParticipation: boolean;
  };
  competition: { id: string; code: string; name: string; theme: { name: string; color: string | null } | null };
  course?: CourseRef | null;
};

type Props = {
  participant: Participant;
  teams: TeamEntry[];
  totalTeams: number;
  competitions: CompetitionEntry[];
  totalCompetitions: number;
  walkInCompetitions: WalkInEntry[];
  existingRegistrations: Record<string, WalkInReg>;
  quizzlyCompetitions: QuizzlyEntry[];
  /** Competitions the participant is already entered in, keyed by event id. */
  eventEntries: Record<string, { competitionId: string; label: string }[]>;
  fc1Competitions: Fc1Entry[];
  /** Individual Eptim Drone competitions — same card and flow as FC-1. */
  droneIndividual: Fc1Entry[];
  droneTeams: DroneEntry[];
  quizzlyRegistered: boolean;
  hasIc: boolean;
};

/* ── Helpers ───────────────────────────────────────────────────────────── */

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function fmt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ms-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const EDU_LABEL: Record<string, string> = {
  PRIMARY:   "Sekolah Rendah",
  SECONDARY: "Sekolah Menengah",
  YOUTH:     "Belia / Umum",
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:   "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  PENDING:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  INACTIVE: "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

/* ── RegisterModal ─────────────────────────────────────────────────────── */

type SessionSlots = { n: number; start: number; end: number; booked: number[] };

function RegisterModal({
  target,
  self,
  registering,
  error,
  refreshKey,
  onConfirm,
  onClose,
}: {
  target: WalkInEntry;
  /** The logged-in participant: member 1 of a team entry. */
  self: { name: string; ic: string | null };
  registering: boolean;
  error: string;
  refreshKey: number;
  onConfirm: (slot: SlotChoice | null, team: TeamDraft | null) => void;
  onClose: () => void;
}) {
  const cfg = target.walkInSlotSchedule;
  const isTeam = target.competition.participationType === "TEAM";
  const bounds = teamBounds(target.competition);
  const [team, setTeam] = useState<TeamDraft>(() => ({
    teamName: "",
    members: Array.from({ length: Math.max(1, bounds.min) }, (_, i) =>
      i === 0 ? { ic: self.ic ?? "", name: self.name } : { ic: "", name: "" }),
  }));
  const [teamErr, setTeamErr] = useState("");
  const setMember = (i: number, patch: Partial<TeamDraft["members"][number]>) =>
    setTeam((t) => ({ ...t, members: t.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const inputCls = "w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-sm dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-60";
  const [sessions,     setSessions]     = useState<SessionSlots[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsErr,     setSlotsErr]     = useState("");
  const [selected,     setSelected]     = useState<SlotChoice | null>(null);
  // Multi-day events: a date is picked first; the sessions are the same each day.
  const dates = cfg ? slotDateChoices(target.event.startDate, target.event.endDate, cfg) : [];
  const [slotDate, setSlotDate] = useState<string | null>(null);
  const needDate = dates.length > 0 && !slotDate;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load live slot availability (re-fetches when refreshKey changes, e.g. after SLOT_TAKEN)
  useEffect(() => {
    if (!cfg || needDate) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlotsLoading(true); setSlotsErr(""); setSelected(null);
    const sp = new URLSearchParams({ walkInCompetitionId: target.id, ...(slotDate && { date: slotDate }) });
    fetch(`/api/v2/participant/walkin/slots?${sp}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Ralat");
        return j;
      })
      .then((j) => { if (!cancelled) setSessions(j.sessions ?? []); })
      .catch(() => { if (!cancelled) setSlotsErr("Gagal memuatkan slot. Tutup dan buka semula."); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [cfg, target.id, refreshKey, needDate, slotDate]);

  const selectedSession = selected && sessions
    ? sessions.find((s) => s.n === selected.sessionNumber)
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`w-full ${cfg ? "max-w-lg" : "max-w-sm"} rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold dark:text-zinc-100">
            {isTeam ? "Daftar Pasukan" : cfg ? "Pilih Sesi & Slot" : "Sahkan Pendaftaran"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Details */}
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold dark:text-zinc-100">
            <span className="font-mono text-xs text-zinc-400 mr-1.5">{target.competition.code}</span>
            {target.competition.name}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{target.event.name}</p>
          {target.event.venue && (
            <p className="text-xs text-zinc-400 flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {target.event.venue}
            </p>
          )}
        </div>

        {/* Temporary team (TEAM competitions) */}
        {isTeam && (
          <div className="space-y-3">
            {!self.ic ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                No. IC anda tiada dalam rekod. Pendaftaran pasukan memerlukan No. IC — sila kemas kini profil anda.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Nama Pasukan</label>
                  <input value={team.teamName} disabled={registering}
                    onChange={(e) => setTeam((t) => ({ ...t, teamName: e.target.value }))}
                    placeholder="cth. Pasukan Robotik A" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Ahli Pasukan</p>
                    <span className="text-[11px] text-zinc-400">
                      {team.members.length} / {bounds.max}{bounds.min > 1 ? ` · min ${bounds.min}` : ""}
                    </span>
                  </div>
                  {team.members.map((m, i) => (
                    <div key={i} className="rounded-lg border border-zinc-100 dark:border-zinc-700 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-500">
                          Ahli {i + 1}{i === 0 && " (anda)"}
                        </span>
                        {i > 0 && team.members.length > bounds.min && (
                          <button type="button" aria-label={`Buang ahli ${i + 1}`} disabled={registering}
                            onClick={() => setTeam((t) => ({ ...t, members: t.members.filter((_, j) => j !== i) }))}
                            className="rounded p-0.5 text-zinc-400 hover:text-red-500">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <input value={m.ic} disabled={i === 0 || registering} inputMode="numeric"
                        onChange={(e) => setMember(i, { ic: e.target.value.replace(/[^\d]/g, "").slice(0, 12) })}
                        placeholder="No. Kad Pengenalan" className={`${inputCls} font-mono`} />
                      <input value={m.name} disabled={i === 0 || registering}
                        onChange={(e) => setMember(i, { name: e.target.value })}
                        placeholder="Nama penuh seperti dalam kad pengenalan" className={inputCls} />
                    </div>
                  ))}
                  {team.members.length < bounds.max && (
                    <button type="button" disabled={registering}
                      onClick={() => setTeam((t) => ({ ...t, members: [...t.members, { ic: "", name: "" }] }))}
                      className="w-full h-9 rounded-lg border border-dashed border-teal-300 dark:border-teal-700 text-xs font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 flex items-center justify-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Tambah Ahli
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Pasukan ini bersifat sementara sehingga disahkan oleh penganjur.
                </p>
              </>
            )}
          </div>
        )}

        {/* Date step (multi-day events) */}
        {cfg && dates.length > 0 && (
          needDate ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-teal-600" /> Langkah 1: Pilih Tarikh
              </p>
              <div className="grid grid-cols-2 gap-2">
                {dates.map((d) => (
                  <button key={d} type="button" disabled={registering}
                    onClick={() => setSlotDate(d)}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2.5 text-left hover:border-teal-400 transition-colors">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{fmtSlotDate(d, { weekday: "long" })}</p>
                    <p className="text-[11px] text-zinc-500">{fmtSlotDate(d, { day: "numeric", month: "long", year: "numeric" })}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 px-3 py-2">
              <p className="text-xs font-medium text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {fmtSlotDate(slotDate!)}
              </p>
              <button type="button" disabled={registering}
                onClick={() => { setSlotDate(null); setSelected(null); setSessions(null); }}
                className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 hover:underline">
                Tukar tarikh
              </button>
            </div>
          )
        )}

        {/* Slot picker (cinema style) */}
        {cfg && !needDate && (
          <div className="space-y-3">
            {dates.length > 0 && (
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Langkah 2: Pilih Sesi &amp; Slot</p>
            )}
            {/* Legend */}
            <div className="flex items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800" /> Tersedia
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded bg-zinc-300 dark:bg-zinc-600" /> Ditempah
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded bg-teal-500" /> Pilihan anda
              </span>
            </div>

            {slotsLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Memuatkan slot…</span>
              </div>
            )}
            {slotsErr && <p className="text-xs text-red-500">{slotsErr}</p>}

            {!slotsLoading && sessions && (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div key={s.n} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        Sesi {s.n}
                        <span className="ml-2 font-normal text-zinc-400">
                          {cfg.slotsPerSession - s.booked.length}/{cfg.slotsPerSession} tersedia
                        </span>
                      </p>
                      <p className="text-[10px] font-mono text-zinc-400">{fmtSlotMin(s.start)} – {fmtSlotMin(s.end)}</p>
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                      {Array.from({ length: cfg.slotsPerSession }, (_, i) => i + 1).map((slot) => {
                        const isBooked = s.booked.includes(slot);
                        const isSel = selected?.sessionNumber === s.n && selected?.slotNumber === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isBooked || registering}
                            onClick={() => setSelected({ sessionNumber: s.n, slotNumber: slot })}
                            className={`h-8 rounded-md text-[11px] font-semibold transition-colors ${
                              isBooked
                                ? "bg-zinc-300 dark:bg-zinc-600 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                                : isSel
                                  ? "bg-teal-500 text-white ring-2 ring-teal-300"
                                  : "bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:border-teal-400 hover:text-teal-600"
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selection summary */}
            {selected && selectedSession && (
              <p className="text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg px-3 py-2">
                Pilihan anda: Sesi {selected.sessionNumber} · Slot {selected.slotNumber} ({fmtSlotMin(selectedSession.start)} – {fmtSlotMin(selectedSession.end)})
              </p>
            )}
          </div>
        )}

        {/* Warning */}
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          Pendaftaran ini tidak boleh dibatalkan.
        </p>

        {/* Error */}
        {(teamErr || error) && (
          <p className="text-xs text-red-600 dark:text-red-400">{teamErr || error}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={registering}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              const slot = selected && { ...selected, ...(slotDate && { slotDate }) };
              if (!isTeam) { onConfirm(slot, null); return; }
              const err = teamDraftError(target.competition, team);
              setTeamErr(err);
              if (!err) onConfirm(slot, team);
            }}
            disabled={registering || (isTeam && !self.ic) || (cfg ? needDate || !selected || slotsLoading || !!slotsErr : false)}
            className="flex-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {registering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mendaftar…
              </>
            ) : (
              "Sahkan"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── QrModal ───────────────────────────────────────────────────────────── */

function QrModal({
  registrationId,
  competitionName,
  onClose,
}: {
  registrationId: string;
  competitionName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold dark:text-zinc-100">Kod QR Pendaftaran</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{competitionName}</p>

        <div className="flex justify-center py-2">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 bg-white">
            <QRCodeSVG value={registrationId} size={180} />
          </div>
        </div>

        <p className="text-center text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all">
          {registrationId}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 px-4 py-2 text-sm font-medium transition-colors"
        >
          Tutup
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ── AddMemberModal ────────────────────────────────────────────────────── */

const ADD_MEMBER_ERR: Record<string, string> = {
  INVALID_IC:               "No. IC tidak sah (6–12 digit, tanpa sengkang).",
  INVALID_NAME:             "Sila isikan nama penuh.",
  ALREADY_IN_TEAM:          "Peserta ini sudah menjadi ahli pasukan.",
  TEAM_FULL:                "Pasukan sudah mencapai bilangan ahli maksimum.",
  MEMBER_NOT_FOUND:         "No. IC tiada dalam rekod peserta. Peserta perlu mendaftar dahulu.",
  MEMBER_NOT_IN_CONTINGENT: "Ahli mesti daripada kontinjen yang sama dengan pasukan.",
  MEMBER_NOT_ELIGIBLE:      "Peserta tidak menepati kumpulan sasaran pertandingan ini.",
  PARTICIPANT_IN_SAME_EVENT: "Peserta sudah menyertai pertandingan lain dalam acara ini.",
  ALREADY_REGISTERED:       "Peserta ini sudah berdaftar untuk pertandingan walk-in ini (atau lain dalam acara ini).",
  NOT_REGISTERED:           "Penyertaan pasukan tidak dijumpai.",
  CHANGED:                  "Pasukan baru sahaja dikemas kini. Sila cuba lagi.",
};

/** Adds a member to a team walk-in entry, pending (IC + name) or verified (IC of a registered participant). */
function AddMemberModal({ wic, pending, onAdded, onClose }: {
  wic: WalkInEntry;
  /** Entry still awaiting verification: the member's name is typed in. */
  pending: boolean;
  onAdded: (members: string[]) => void;
  onClose: () => void;
}) {
  const [ic, setIc] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputCls = "w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-sm dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-60";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/v2/participant/walkin/team-member", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walkInCompetitionId: wic.id, ic, name }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr((ADD_MEMBER_ERR[j.error] ?? j.error ?? "Gagal menambah ahli.") + (j.detail && j.error !== "ALREADY_REGISTERED" ? ` (${j.detail})` : "")); return; }
    onAdded(j.data.members);
  }

  const ok = /^\d{6,12}$/.test(ic) && (!pending || name.trim().length >= 3);
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold dark:text-zinc-100">Tambah Ahli Pasukan</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono mr-1.5">{wic.competition.code}</span>{wic.competition.name}
        </p>
        <div className="space-y-2">
          <input value={ic} disabled={busy} inputMode="numeric" autoFocus
            onChange={(e) => setIc(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
            placeholder="No. Kad Pengenalan" className={`${inputCls} font-mono`} />
          {pending && (
            <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)}
              placeholder="Nama penuh seperti dalam kad pengenalan" className={inputCls} />
          )}
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {pending
              ? "Ahli akan disemak bersama pasukan semasa pengesahan oleh penganjur."
              : "Ahli mesti peserta berdaftar daripada kontinjen yang sama dan layak untuk pertandingan ini."}
          </p>
        </div>
        {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
            Batal
          </button>
          <button type="button" onClick={submit} disabled={busy || !ok}
            className="flex-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Tambah
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── TokenInfoModal ────────────────────────────────────────────────────── */

type ViblockTokenInfo = {
  token: string;
  event_name: string;
  name: string;
  sector: string;
  region: string;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
};

function TokenInfoModal({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<ViblockTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const id = setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(`/api/v2/walkin/viblock-token/${encodeURIComponent(token)}`)
        .then(r => r.json().then(j => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) throw new Error(j.error ?? "Failed");
          setInfo(j);
        })
        .catch(e => setError(e.message ?? "Gagal mendapatkan maklumat token."))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [token]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-base font-bold dark:text-zinc-100">Viblock Arena Token</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat maklumat token…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : info ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-4 py-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-violet-500 dark:text-violet-400 mb-1">Token</p>
              <p className="text-3xl font-black font-mono tracking-[0.3em] text-violet-800 dark:text-violet-200">{info.token}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-700 px-3 py-2">
                <p className="text-[10px] text-zinc-400 uppercase">Nama</p>
                <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{info.name}</p>
              </div>
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-700 px-3 py-2">
                <p className="text-[10px] text-zinc-400 uppercase">Sektor</p>
                <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{info.sector}</p>
              </div>
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-700 px-3 py-2">
                <p className="text-[10px] text-zinc-400 uppercase">Wilayah</p>
                <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{info.region}</p>
              </div>
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-700 px-3 py-2">
                <p className="text-[10px] text-zinc-400 uppercase">Status</p>
                <p className={`font-medium ${info.is_used ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {info.is_used ? "Sudah digunakan" : "Belum digunakan"}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-zinc-400 text-center">
              Dicipta: {new Date(info.created_at).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 px-4 py-2 text-sm font-medium transition-colors"
        >
          Tutup
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ── Main component ────────────────────────────────────────────────────── */

export function DashboardClient({
  participant,
  teams,
  totalTeams,
  competitions,
  totalCompetitions,
  walkInCompetitions,
  existingRegistrations,
  quizzlyCompetitions,
  eventEntries,
  fc1Competitions,
  droneIndividual,
  droneTeams,
  quizzlyRegistered,
  hasIc,
}: Props) {
  // ── Arena challenges ── keyed `fc1:${ecId}:${challengeId}` (FC-1),
  // `droneInd:${ecId}:${challengeId}` (individual Drone) and
  // `drone:${teamId}:${ecId}:${challengeId}` (team Drone)
  const individualArenas = [
    {
      kind: "fc1", title: "FC-1 Individu", partner: "FC-1",
      items: fc1Competitions, base: "/api/v2/participant/fc1/challenges",
    },
    {
      kind: "droneInd", title: "Eptim Drone Individu", partner: "Eptim Drone",
      items: droneIndividual, base: "/api/v2/participant/drone/individual/challenges",
    },
  ] as const;
  const [arenaBusy, setArenaBusy] = useState<string | null>(null);
  const [arenaErr, setArenaErr]   = useState<{ key: string; message: string } | null>(null);
  const [arenaLive, setArenaLive] = useState<Record<string, { registered: boolean; link: ArenaLink | null }>>(() => ({
    ...Object.fromEntries(individualArenas.flatMap((a) => a.items.flatMap((f) =>
      f.challenges.map((c) => [`${a.kind}:${f.id}:${c.id}`, { registered: c.registered, link: c.link }])))),
    ...Object.fromEntries(droneTeams.flatMap((d) =>
      d.challenges.map((c) => [`drone:${d.id}:${c.id}`, { registered: c.registered, link: c.link }]))),
  }));
  // Launch links live 5 minutes; re-render now and then so an open page flips
  // an expired "Mula cabaran" over to "Mohon pautan baharu" by itself.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  /** Has the participant registered any challenge of this individual event-competition? */
  const arenaHasReg = (kind: string, ecId: string) =>
    Object.entries(arenaLive).some(([k, v]) => v.registered && k.startsWith(`${kind}:${ecId}:`));

  // Register (creating the partner player on first use) and get a link in one
  // go, or — with the /link endpoint — reuse a still-valid link / get a new one.
  async function arenaPost(key: string, url: string, body: object, fallback: string) {
    setArenaBusy(key); setArenaErr(null);
    try {
      const res  = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? fallback);
      setArenaLive((p) => ({ ...p, [key]: { registered: true, link: (json as { link: ArenaLink | null }).link ?? null } }));
    } catch (e) {
      setArenaErr({ key, message: e instanceof Error ? e.message : fallback });
    } finally { setArenaBusy(null); }
  }

  // Links are single-use: once opened it's spent, so the row moves to "Mohon
  // pautan baharu". New tab only — see EptimCsiTeamButton for why there is no
  // "popup blocked" fallback on the window.open() return value.
  function openArenaLink(key: string, url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    setArenaLive((p) => ({ ...p, [key]: { ...p[key], link: null } }));
  }

  /** Props wiring one ArenaChallengeRow to its key, endpoints and request body. */
  function arenaRowProps(key: string, base: string, body: object, c: ArenaChallengeView) {
    return {
      c,
      live:     arenaLive[key] ?? { registered: c.registered, link: c.link },
      nowMs,
      busy:     arenaBusy === key,
      anyBusy:  arenaBusy !== null,
      error:    arenaErr?.key === key ? arenaErr.message : null,
      onRegister: () => arenaPost(key, base, body, "Pendaftaran cabaran gagal"),
      onRenew:    () => arenaPost(key, `${base}/link`, body, "Gagal mendapatkan pautan"),
      onOpen:     (url: string) => openArenaLink(key, url),
    };
  }
  const [quizzlyReg, setQuizzlyReg]       = useState(quizzlyRegistered);
  const [quizzlyBusy, setQuizzlyBusy]     = useState<string | null>(null); // "register" | eventCompetitionId
  const [quizzlyErr, setQuizzlyErr]       = useState("");
  const [tokens, setTokens]               = useState<Record<string, QuizzlyToken>>(
    Object.fromEntries(quizzlyCompetitions.flatMap((q) => (q.token ? [[q.id, q.token]] : []))),
  );
  const [shownTokens, setShownTokens]     = useState<Record<string, boolean>>({});
  const [copiedToken, setCopiedToken]     = useState<string | null>(null);

  async function registerQuizzly() {
    setQuizzlyBusy("register"); setQuizzlyErr("");
    try {
      const res  = await fetch("/api/v2/participant/quizzly/register", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Pendaftaran gagal");
      setQuizzlyReg(true);
    } catch (e) {
      setQuizzlyErr(e instanceof Error ? e.message : "Pendaftaran gagal");
    } finally { setQuizzlyBusy(null); }
  }

  async function requestToken(eventCompetitionId: string) {
    setQuizzlyBusy(eventCompetitionId); setQuizzlyErr("");
    try {
      const res = await fetch("/api/v2/participant/quizzly/token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventCompetitionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal memohon token");
      setTokens((prev) => ({ ...prev, [eventCompetitionId]: json as QuizzlyToken }));
      setShownTokens((prev) => ({ ...prev, [eventCompetitionId]: true }));
    } catch (e) {
      setQuizzlyErr(e instanceof Error ? e.message : "Gagal memohon token");
    } finally { setQuizzlyBusy(null); }
  }

  /**
   * "Penyertaan Tunggal Sahaja": in an event that allows only one competition
   * per participant, the first token taken (or an existing entry, e.g. one a
   * manager made) claims the event and every other competition in it locks.
   * Derived from live `tokens` state, so the siblings lock the moment a token is
   * issued. Returns the label of the claiming competition, or null.
   */
  function claimedBy(event: { id: string; allowMultipleParticipation: boolean }, competitionId: string): string | null {
    if (event.allowMultipleParticipation) return null;
    const label = (c: { code: string; name: string }) => `${c.code} ${c.name}`;
    // Live state first, so the lock appears the moment something is taken…
    const viaToken = quizzlyCompetitions.find(
      (o) => o.event.id === event.id && o.competition.id !== competitionId && tokens[o.id],
    );
    if (viaToken) return label(viaToken.competition);
    for (const a of individualArenas) {
      const via = a.items.find(
        (o) => o.event.id === event.id && o.competition.id !== competitionId && arenaHasReg(a.kind, o.id),
      );
      if (via) return label(via.competition);
    }
    // …then what the server already knew, including manager-made entries.
    return (eventEntries[event.id] ?? []).find((e) => e.competitionId !== competitionId)?.label ?? null;
  }

  function lockedBy(q: QuizzlyEntry): string | null {
    return tokens[q.id] ? null : claimedBy(q.event, q.competition.id);
  }

  async function copyToken(id: string, token: string) {
    await navigator.clipboard.writeText(token).catch(() => {});
    setCopiedToken(id);
    setTimeout(() => setCopiedToken((c) => (c === id ? null : c)), 1500);
  }
  const [registrations, setRegistrations] = useState<Record<string, WalkInReg>>(existingRegistrations);
  const [registerTarget, setRegisterTarget] = useState<WalkInEntry | null>(null);
  const [registering, setRegistering]     = useState(false);
  const [registerErr, setRegisterErr]     = useState("");
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);
  const [qrTarget, setQrTarget]           = useState<{ id: string; name: string } | null>(null);
  const [tokenTarget, setTokenTarget]     = useState<string | null>(null);
  const [addMemberTarget, setAddMemberTarget] = useState<WalkInEntry | null>(null);

  const handleRegister = useCallback(async (slot: SlotChoice | null, team: TeamDraft | null) => {
    if (!registerTarget) return;
    setRegistering(true);
    setRegisterErr("");
    try {
      const res = await fetch("/api/v2/participant/walkin/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walkInCompetitionId: registerTarget.id, ...(slot ?? {}), ...(team ?? {}) }),
      });
      const j = await res.json();
      if (!res.ok) {
        const teamMsg: Record<string, string> = {
          INVALID_TEAM_NAME:   "Sila isikan nama pasukan.",
          INVALID_MEMBERS:     "Setiap ahli perlu No. IC (6–12 digit) dan nama penuh.",
          TEAM_SIZE:           "Bilangan ahli pasukan tidak menepati syarat pertandingan.",
          DUPLICATE_MEMBER_IC: "No. IC ahli pasukan tidak boleh berulang.",
          DUPLICATE_SUBMISSION: "Salah seorang ahli sudah didaftarkan dalam pasukan lain untuk pertandingan ini.",
          SELF_NOT_IN_TEAM:    "Anda mesti menjadi ahli pasukan ini.",
          NO_IC:               "No. IC anda tiada dalam rekod.",
        };
        if (teamMsg[j.error]) {
          setRegisterErr(teamMsg[j.error]);
        } else if (j.error === "ALREADY_REGISTERED") {
          setRegisterErr(team ? "Salah seorang ahli sudah berdaftar untuk pertandingan ini." : "Anda sudah berdaftar.");
        } else if (j.error === "UNIQUE_PARTICIPATION") {
          setRegisterErr(team
            ? "Salah seorang ahli sudah berdaftar untuk pertandingan walk-in lain dalam acara ini."
            : "Anda sudah berdaftar untuk pertandingan walk-in lain dalam acara ini.");
        } else if (j.error === "SLOT_TAKEN") {
          setSlotRefreshKey((k) => k + 1); // refresh availability in the picker
          setRegisterErr("Slot baru sahaja ditempah. Sila pilih slot lain.");
        } else if (j.error === "SLOT_REQUIRED") {
          setRegisterErr("Sila pilih sesi dan slot.");
        } else if (j.error === "DATE_REQUIRED") {
          setRegisterErr("Sila pilih tarikh.");
        } else {
          setRegisterErr(j.message ?? "Gagal mendaftar.");
        }
      } else {
        const reg: WalkInReg = team
          ? {
              id: j.data.id, status: "SUBMITTED", viblockToken: null,
              slotDate: j.data.slotDate ?? "", sessionNumber: j.data.sessionNumber ?? null, slotNumber: j.data.slotNumber ?? null,
              team: { name: team.teamName.trim(), members: team.members.map((m) => m.name.trim().toUpperCase()) },
            }
          : j.data;
        setRegistrations((prev) => ({ ...prev, [registerTarget.id]: reg }));
        setRegisterTarget(null);
      }
    } finally {
      setRegistering(false);
    }
  }, [registerTarget]);

  const initials   = getInitials(participant.name);
  const eduLabel   = EDU_LABEL[participant.eduLevel] ?? participant.eduLevel;
  const previewTeams = teams.slice(0, 3);

  // Group walk-in by event
  const byEvent = new Map<string, { event: WalkInEntry["event"]; items: WalkInEntry[] }>();
  for (const wic of walkInCompetitions) {
    if (!byEvent.has(wic.event.id))
      byEvent.set(wic.event.id, { event: wic.event, items: [] });
    byEvent.get(wic.event.id)!.items.push(wic);
  }

  return (
    <div className="space-y-6">
      {/* ── Profile card ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 flex items-center gap-4">
        <div
          className="h-14 w-14 shrink-0 rounded-full flex items-center justify-center text-white text-xl font-bold select-none"
          style={{ background: "linear-gradient(135deg, #085782 0%, #0d9488 100%)" }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold leading-tight dark:text-zinc-100 truncate">
            {participant.name}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
            {participant.contingent.name}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {eduLabel}
            </span>
            {participant.classGrade && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                {participant.classGrade}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column: Teams + Competitions ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Teams */}
        <div className="md:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold dark:text-zinc-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" strokeWidth={1.8} />
              Pasukan Saya
            </h2>
            {totalTeams > 3 && (
              <Link
                href="/participant/team"
                className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
              >
                Lihat semua
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {previewTeams.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Users className="h-8 w-8 text-zinc-300 dark:text-zinc-600" strokeWidth={1.5} />
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Belum dalam mana-mana pasukan
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {previewTeams.map(({ team }) => {
                const style = STATUS_STYLE[team.status] ?? STATUS_STYLE.INACTIVE;
                return (
                  <li
                    key={team.id}
                    className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2.5 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium dark:text-zinc-100 leading-tight truncate">
                        {team.name}
                      </p>
                      <span
                        className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${style}`}
                      >
                        {team.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      <span className="font-mono mr-1">{team.competition.code}</span>
                      {team.competition.name}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Competitions */}
        <div className="md:col-span-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold dark:text-zinc-100 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-zinc-400" strokeWidth={1.8} />
              Pertandingan Layak
            </h2>
            {totalCompetitions > 6 && (
              <Link
                href="/participant/competitions"
                className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
              >
                Lihat semua ({totalCompetitions})
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {competitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Trophy className="h-8 w-8 text-zinc-300 dark:text-zinc-600" strokeWidth={1.5} />
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Tiada pertandingan layak
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {competitions.map((comp) => {
                const themeColor = comp.theme?.color ?? "#085782";
                return (
                  <div
                    key={comp.id}
                    className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 overflow-hidden"
                  >
                    <div className="h-1 w-full" style={{ backgroundColor: themeColor }} />
                    <div className="px-3 py-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-mono text-zinc-400">{comp.code}</p>
                        {comp.enrolled && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-3 w-3" />
                            Daftar
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium dark:text-zinc-200 leading-snug line-clamp-2">
                        {comp.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Asia Spark Quiz ─────────────────────────────────────────── */}
      {quizzlyCompetitions.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold dark:text-zinc-100">Asia Spark Quiz</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Kuiz dalam talian yang layak untuk anda, mengikut kumpulan sasaran
                {participant.classGrade ? ` dan ${participant.classGrade}` : ""}.
              </p>
            </div>

            {/* Account state — one registration covers every quiz below */}
            {quizzlyReg ? (
              <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 px-2.5 py-1 text-xs font-medium">
                <CheckCircle className="h-3.5 w-3.5" /> Akaun berdaftar
              </span>
            ) : (
              <button
                type="button"
                onClick={registerQuizzly}
                disabled={quizzlyBusy !== null || !hasIc}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {quizzlyBusy === "register"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <KeyRound className="h-3.5 w-3.5" />}
                Daftar Asia Spark Quiz
              </button>
            )}
          </div>

          {!hasIc && !quizzlyReg && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Nombor kad pengenalan diperlukan untuk mendaftar. Kemas kini di Profil dahulu.
            </p>
          )}
          {quizzlyErr && (
            <p className="text-xs text-red-500 dark:text-red-400">{quizzlyErr}</p>
          )}

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {quizzlyCompetitions.map((q) => { const locked = lockedBy(q); return (
              <div
                key={q.id}
                className={`px-4 py-3 flex items-start gap-3 flex-wrap sm:flex-nowrap transition-opacity ${locked ? "opacity-50" : ""}`}
              >
                <span className="mt-0.5 shrink-0 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-1.5">
                  <Gamepad2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    <span className="font-mono text-xs text-zinc-400 mr-1.5">{q.competition.code}</span>
                    {q.competition.name}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="truncate">{q.event.name}</span>
                    {(q.event.startDate || q.event.endDate) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {q.event.startDate === q.event.endDate
                          ? fmt(q.event.startDate)
                          : `${fmt(q.event.startDate) ?? "?"} – ${fmt(q.event.endDate) ?? "?"}`}
                      </span>
                    )}
                    {q.sessionTitle && <span className="truncate">{q.sessionTitle}</span>}
                  </div>

                  {/* Which quiz, and why this one */}
                  {q.quiz ? (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 font-medium">
                        {q.quiz.title}
                      </span>
                      <span className="text-zinc-400">
                        {q.assignBy === "grade" && q.quiz.grade
                          ? `untuk ${q.quiz.grade}`
                          : q.targetGroupName
                            ? `untuk ${q.targetGroupName}`
                            : ""}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                      Kuiz belum ditetapkan untuk kumpulan anda — hubungi penganjur.
                    </p>
                  )}
                  {q.course && (
                    <div className="mt-2">
                      <CourseButton eventCompetitionId={q.id} course={q.course} />
                    </div>
                  )}
                </div>

                {/* Token: request, reveal, copy, start */}
                <div className="shrink-0 self-center">
                  {!q.quiz ? null : !quizzlyReg ? (
                    <span className="text-[11px] text-zinc-400">Daftar dahulu</span>
                  ) : locked ? (
                    <div className="flex flex-col items-end gap-1 max-w-[14rem] text-right">
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 px-2.5 py-1.5 text-xs font-medium cursor-not-allowed"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Mohon token
                      </button>
                      <span className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                        Satu penyertaan sahaja bagi acara ini — anda telah memilih {locked}.
                      </span>
                    </div>
                  ) : !tokens[q.id] ? (
                    <button
                      type="button"
                      onClick={() => requestToken(q.id)}
                      disabled={quizzlyBusy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 text-xs font-medium transition-colors"
                    >
                      {quizzlyBusy === q.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <KeyRound className="h-3.5 w-3.5" />}
                      Mohon token
                    </button>
                  ) : tokens[q.id].expiredUnused ? (
                    <div className="flex flex-col items-end gap-1 max-w-[14rem] text-right">
                      <span className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                        Token tamat tempoh{tokens[q.id].expiresAt ? ` pada ${fmt(tokens[q.id].expiresAt)}` : ""} dan belum digunakan.
                      </span>
                      <button
                        type="button"
                        onClick={() => requestToken(q.id)}
                        disabled={quizzlyBusy !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 text-xs font-medium transition-colors"
                      >
                        {quizzlyBusy === q.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />}
                        Mohon token baharu
                      </button>
                    </div>
                  ) : tokens[q.id].state === "redeemed" ? (
                    <span className="inline-flex items-center gap-1 max-w-[14rem] text-right text-[11px] leading-snug text-green-600 dark:text-green-400">
                      <CheckCircle className="h-3.5 w-3.5 shrink-0" /> Token telah digunakan — kuiz telah dimulakan.
                    </span>
                  ) : tokens[q.id].state === "revoked" ? (
                    <span className="max-w-[14rem] text-right text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                      Token ini telah dibatalkan oleh penganjur. Hubungi penganjur.
                    </span>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        <code className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-sm font-mono tracking-[0.2em] text-zinc-800 dark:text-zinc-100">
                          {shownTokens[q.id] ? tokens[q.id].token : "••••••"}
                        </code>
                        <button
                          type="button"
                          title={shownTokens[q.id] ? "Sembunyi" : "Papar"}
                          onClick={() => setShownTokens((p) => ({ ...p, [q.id]: !p[q.id] }))}
                          className="rounded-md p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        >
                          {shownTokens[q.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          title="Salin token"
                          onClick={() => copyToken(q.id, tokens[q.id].token)}
                          className="rounded-md p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        >
                          {copiedToken === q.id
                            ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {tokens[q.id].startUrl && (
                        <a
                          href={tokens[q.id].startUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Mula kuiz <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                      {tokens[q.id].state === "not_yet_valid" && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          Boleh digunakan apabila pusingan dibuka
                        </span>
                      )}
                      {tokens[q.id].expiresAt && (
                        <span className="text-[10px] text-zinc-400">
                          Sah hingga {fmt(tokens[q.id].expiresAt)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ); })}
          </div>

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Token hanya boleh digunakan sekali. Jangan kongsi dengan orang lain — sesiapa yang
            memilikinya boleh menduduki kuiz sebagai anda.
          </p>
        </div>
      )}

      {/* ── Individual arenas: FC-1 Individu, Eptim Drone Individu ──── */}
      {individualArenas.map((arena) => arena.items.length > 0 && (
        <div key={arena.kind} className="space-y-4">
          <div>
            <h2 className="text-lg font-bold dark:text-zinc-100">{arena.title}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Daftar cabaran di sini untuk bermain di {arena.partner}. Pautan masuk sah 5 minit dan sekali guna —
              mohon pautan baharu jika tamat tempoh.
            </p>
            {!hasIc && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Nombor kad pengenalan diperlukan untuk mendaftar. Kemas kini di Profil dahulu.
              </p>
            )}
          </div>

          <div className="space-y-3">
            {arena.items.map((f) => {
              const locked = arenaHasReg(arena.kind, f.id) ? null : claimedBy(f.event, f.competition.id);
              return (
                <div
                  key={f.id}
                  className={`rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden transition-opacity ${locked ? "opacity-50" : ""}`}
                >
                  <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                        <span className="font-mono text-xs text-emerald-700/60 mr-1.5">{f.competition.code}</span>
                        {f.competition.name}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-emerald-700/70 dark:text-emerald-400/70">
                        <span className="truncate">{f.event.name}</span>
                        {(f.event.startDate || f.event.endDate) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" />
                            {f.event.startDate === f.event.endDate
                              ? fmt(f.event.startDate)
                              : `${fmt(f.event.startDate) ?? "?"} – ${fmt(f.event.endDate) ?? "?"}`}
                          </span>
                        )}
                        <span>untuk {f.targetGroupName}</span>
                      </div>
                    </div>
                    {(locked || f.course) && (
                      <div className="flex flex-col items-end gap-1.5">
                        {f.course && <CourseButton eventCompetitionId={f.id} course={f.course} />}
                        {locked && (
                          <span className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400 max-w-[16rem] text-right">
                            Satu penyertaan sahaja bagi acara ini — anda telah memilih {locked}.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {f.challenges.map((c) => (
                      <ArenaChallengeRow
                        key={c.id}
                        {...arenaRowProps(`${arena.kind}:${f.id}:${c.id}`, arena.base,
                          { eventCompetitionId: f.id, challengeId: c.id }, c)}
                        hideRegister={!!locked}
                        registerDisabled={!hasIc}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Eptim Drone (team) ──────────────────────────────────────── */}
      {droneTeams.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold dark:text-zinc-100">Eptim Drone</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Daftar cabaran untuk pasukan anda di sini untuk bermain di Eptim Drone. Pendaftaran dan keputusan
              dikongsi oleh semua ahli pasukan. Pautan masuk sah 5 minit dan sekali guna — mohon pautan baharu jika
              tamat tempoh.
            </p>
          </div>

          <div className="space-y-3">
            {droneTeams.map((d) => (
              <div key={d.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-3 bg-sky-50 dark:bg-sky-950/30 border-b border-sky-100 dark:border-sky-900">
                  <p className="text-sm font-semibold text-sky-900 dark:text-sky-200 truncate">
                    <span className="font-mono text-xs text-sky-700/60 mr-1.5">{d.competition.code}</span>
                    {d.competition.name}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sky-700/70 dark:text-sky-400/70">
                    <span className="flex items-center gap-1 font-medium">
                      <Users className="h-3 w-3 shrink-0" />{d.teamName}
                    </span>
                    <span className="truncate">{d.event.name}</span>
                    {(d.event.startDate || d.event.endDate) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {d.event.startDate === d.event.endDate
                          ? fmt(d.event.startDate)
                          : `${fmt(d.event.startDate) ?? "?"} – ${fmt(d.event.endDate) ?? "?"}`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {d.challenges.map((c) => (
                    <ArenaChallengeRow
                      key={c.id}
                      {...arenaRowProps(`drone:${d.id}:${c.id}`, "/api/v2/participant/drone/challenges",
                        { teamId: d.teamId, eventCompetitionId: d.eventCompetitionId, challengeId: c.id }, c)}
                      hideRegister={false}
                      registerDisabled={false}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Walk-in section ─────────────────────────────────────────── */}
      {walkInCompetitions.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold dark:text-zinc-100">Pertandingan Walk-in</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Daftar terus di kaunter pada hari acara, atau daftar awal di bawah.
            </p>
          </div>

          {Array.from(byEvent.values()).map(({ event, items }) => (
            <div
              key={event.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden"
            >
              {/* Event header */}
              <div className="px-4 py-3 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-100 dark:border-teal-900 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-teal-900 dark:text-teal-200">
                    {event.name}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-teal-700/70 dark:text-teal-400/70">
                    {event.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {event.venue}
                      </span>
                    )}
                    {(event.startDate || event.endDate) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {event.startDate === event.endDate
                          ? fmt(event.startDate)
                          : `${fmt(event.startDate) ?? "?"} – ${fmt(event.endDate) ?? "?"}`}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 tracking-wide uppercase">
                  Walk-in
                </span>
              </div>

              {/* Competition rows */}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((wic) => {
                  const reg  = registrations[wic.id];
                  const full = wic.maxSlots > 0 && wic.registrations >= wic.maxSlots && !reg;
                  const pct  = wic.maxSlots > 0
                    ? Math.min(100, Math.round((wic.registrations / wic.maxSlots) * 100))
                    : null;

                  return (
                    <div key={wic.id}>
                      {/* Main row */}
                      <div className="px-4 py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                        {(() => {
                          const team = wic.competition.participationType === "TEAM";
                          const Icon = team ? Users : User;
                          return (
                            <span
                              title={team ? "Pertandingan berpasukan" : "Pertandingan individu"}
                              className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${
                                team
                                  ? "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
                                  : "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300"
                              }`}>
                              <Icon className="h-4 w-4" />
                            </span>
                          );
                        })()}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            <span className="font-mono text-xs text-zinc-400 mr-1.5">
                              {wic.competition.code}
                            </span>
                            {wic.competition.name}
                          </p>
                          <p className={`text-xs font-medium mt-0.5 ${
                            wic.competition.participationType === "TEAM"
                              ? "text-violet-600 dark:text-violet-300"
                              : "text-sky-600 dark:text-sky-300"
                          }`}>
                            {wic.competition.participationType === "TEAM" ? "Berpasukan" : "Individu"}
                          </p>
                          {reg?.team && (
                            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 truncate">
                              <Users className="inline h-3 w-3 mr-1 -mt-0.5" />
                              <span className="font-medium">{reg.team.name}</span>
                              {reg.team.members.length > 0 && (
                                <span className="text-zinc-400"> · {reg.team.members.join(", ")}</span>
                              )}
                            </p>
                          )}
                          {reg?.team && (
                            reg.team.members.length < Math.max(1, wic.competition.maxTeamSize) ? (
                              <button type="button" onClick={() => setAddMemberTarget(wic)}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:underline">
                                <Plus className="h-3 w-3" /> Tambah ahli ({reg.team.members.length}/{Math.max(1, wic.competition.maxTeamSize)})
                              </button>
                            ) : (
                              <p className="mt-1 text-[11px] text-zinc-400">Pasukan penuh ({reg.team.members.length}/{Math.max(1, wic.competition.maxTeamSize)})</p>
                            )
                          )}
                        </div>

                        {/* Slot indicator */}
                        <div className="shrink-0 text-right space-y-1 min-w-[80px]">
                          <div className="flex items-center justify-end gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <Users className="h-3 w-3" />
                            <span>
                              {wic.registrations}
                              {wic.maxSlots > 0 ? ` / ${wic.maxSlots}` : " daftar"}
                            </span>
                          </div>
                          {pct !== null && (
                            <div className="w-20 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  full ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-teal-400"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Action */}
                        <div className="shrink-0">
                          {reg ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                                reg.status === "CONFIRMED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                              }`}>
                                {reg.status === "CONFIRMED" ? "Terdaftar" : reg.status === "SUBMITTED" ? "Menunggu pengesahan" : "Pre-daftar"}
                              </span>
                              {reg.status !== "SUBMITTED" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setQrTarget({ id: reg.id, name: wic.competition.name })
                                }
                                className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:border-teal-300 transition-colors"
                                title="Tunjuk QR"
                              >
                                <QrCode className="h-3.5 w-3.5" />
                              </button>
                              )}
                            </div>
                          ) : full ? (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
                              Penuh
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setRegisterErr("");
                                setRegisterTarget(wic);
                              }}
                              className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 text-xs font-medium transition-colors"
                            >
                              Daftar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Status message */}
                      {reg && (
                        <div className="px-4 pb-3 space-y-2">
                          {reg.sessionNumber != null && reg.slotNumber != null && (
                            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
                              <Clock className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                              <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                                {reg.slotDate && `${fmtSlotDate(reg.slotDate)} · `}
                                Sesi {reg.sessionNumber} · Slot {reg.slotNumber}
                                {(() => {
                                  if (!wic.walkInSlotSchedule) return null;
                                  const s = buildSlotSchedule(wic.walkInSlotSchedule).find(
                                    (b) => b.type === "session" && b.n === reg.sessionNumber,
                                  );
                                  return s && s.type === "session" ? ` · ${fmtSlotMin(s.start)} – ${fmtSlotMin(s.end)}` : null;
                                })()}
                              </p>
                            </div>
                          )}
                          {reg.status === "CONFIRMED" ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                                <PartyPopper className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  {reg.team
                                    ? `Pasukan ${reg.team.name} telah disahkan. Selamat bersaing — semoga berjaya!`
                                    : "Kehadiran anda telah disahkan. Selamat bersaing — semoga berjaya!"}
                                </p>
                              </div>
                              {reg.vibeBlocksToken && wic.useVibeblocks && (
                                <button
                                  type="button"
                                  onClick={() => copyToken(`vb:${reg.id}`, reg.vibeBlocksToken!)}
                                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors w-full text-left"
                                  title="Salin token"
                                >
                                  <Gamepad2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                                  <span className="flex-1 text-xs font-medium text-violet-600 dark:text-violet-400">
                                    Token {wic.gameName ?? "VibeBlocks"}{reg.team ? " (pasukan)" : ""}
                                  </span>
                                  <span className="text-sm font-bold font-mono tracking-widest text-violet-800 dark:text-violet-200">{reg.vibeBlocksToken}</span>
                                  {copiedToken === `vb:${reg.id}`
                                    ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                    : <Copy className="h-3.5 w-3.5 text-violet-400 shrink-0" />}
                                </button>
                              )}
                              {reg.viblockToken && wic.useViblockarena && (
                                <button
                                  type="button"
                                  onClick={() => setTokenTarget(reg.viblockToken)}
                                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors w-full text-left"
                                >
                                  <Gamepad2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                                  <span className="flex-1 text-xs font-medium text-violet-600 dark:text-violet-400">Viblock Arena Token</span>
                                  <span className="text-sm font-bold font-mono tracking-widest text-violet-800 dark:text-violet-200">{reg.viblockToken}</span>
                                  <Eye className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                                </button>
                              )}
                            </div>
                          ) : reg.status === "SUBMITTED" ? (
                            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                              <Clock className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                Pasukan sementara ini menunggu pengesahan penganjur. Hadir ke kaunter pada hari acara bersama ahli pasukan.
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                              <QrCode className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                              <p className="flex-1 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                Tunjukkan QR kod anda kepada penganjur di kaunter untuk disahkan kehadiran.
                              </p>
                              {/* pointer toward the QR button (top-right) */}
                              <div className="shrink-0 flex flex-col items-center gap-0.5 animate-bounce">
                                <ArrowUpRight className="h-4 w-4 text-amber-400 dark:text-amber-500" />
                                <span className="text-[9px] font-semibold text-amber-400 dark:text-amber-500 leading-none">
                                  QR
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {registerTarget && (
        <RegisterModal
          target={registerTarget}
          self={{ name: participant.name, ic: participant.ic }}
          registering={registering}
          error={registerErr}
          refreshKey={slotRefreshKey}
          onConfirm={handleRegister}
          onClose={() => { if (!registering) setRegisterTarget(null); }}
        />
      )}
      {qrTarget && (
        <QrModal
          registrationId={qrTarget.id}
          competitionName={qrTarget.name}
          onClose={() => setQrTarget(null)}
        />
      )}
      {addMemberTarget && registrations[addMemberTarget.id]?.team && (
        <AddMemberModal
          wic={addMemberTarget}
          pending={registrations[addMemberTarget.id].status === "SUBMITTED"}
          onAdded={(members) => {
            const id = addMemberTarget.id;
            setRegistrations((prev) => ({ ...prev, [id]: { ...prev[id], team: { ...prev[id].team!, members } } }));
            setAddMemberTarget(null);
          }}
          onClose={() => setAddMemberTarget(null)}
        />
      )}
      {tokenTarget && (
        <TokenInfoModal
          token={tokenTarget}
          onClose={() => setTokenTarget(null)}
        />
      )}
    </div>
  );
}
