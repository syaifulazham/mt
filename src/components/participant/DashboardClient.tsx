"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  Users,
  Trophy,
  MapPin,
  Calendar,
  ArrowRight,
  ArrowUpRight,
  X,
  CheckCircle,
  QrCode,
  Loader2,
  PartyPopper,
  Gamepad2,
  Eye,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

type Participant = {
  id: string;
  name: string;
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
  registrations: number;
  event: {
    id: string;
    name: string;
    slug: string;
    venue: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  competition: { id: string; code: string; name: string; participationType: string };
};

type Props = {
  participant: Participant;
  teams: TeamEntry[];
  totalTeams: number;
  competitions: CompetitionEntry[];
  totalCompetitions: number;
  walkInCompetitions: WalkInEntry[];
  existingRegistrations: Record<string, { id: string; status: string; viblockToken: string | null }>;
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

function RegisterModal({
  target,
  registering,
  error,
  onConfirm,
  onClose,
}: {
  target: WalkInEntry;
  registering: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // Close on Escape
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
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold dark:text-zinc-100">Sahkan Pendaftaran</h2>
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

        {/* Warning */}
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          Pendaftaran ini tidak boleh dibatalkan.
        </p>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
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
            onClick={onConfirm}
            disabled={registering}
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
}: Props) {
  const [registrations, setRegistrations] = useState<Record<string, { id: string; status: string; viblockToken: string | null }>>(existingRegistrations);
  const [registerTarget, setRegisterTarget] = useState<WalkInEntry | null>(null);
  const [registering, setRegistering]     = useState(false);
  const [registerErr, setRegisterErr]     = useState("");
  const [qrTarget, setQrTarget]           = useState<{ id: string; name: string } | null>(null);
  const [tokenTarget, setTokenTarget]     = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    if (!registerTarget) return;
    setRegistering(true);
    setRegisterErr("");
    try {
      const res = await fetch("/api/v2/participant/walkin/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walkInCompetitionId: registerTarget.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        setRegisterErr(
          j.error === "ALREADY_REGISTERED"
            ? "Anda sudah berdaftar."
            : (j.message ?? "Gagal mendaftar."),
        );
      } else {
        setRegistrations((prev) => ({ ...prev, [registerTarget.id]: j.data }));
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
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            <span className="font-mono text-xs text-zinc-400 mr-1.5">
                              {wic.competition.code}
                            </span>
                            {wic.competition.name}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5 capitalize">
                            {wic.competition.participationType.toLowerCase()}
                          </p>
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
                                {reg.status === "CONFIRMED" ? "Terdaftar" : "Pre-daftar"}
                              </span>
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
                        <div className="px-4 pb-3">
                          {reg.status === "CONFIRMED" ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                                <PartyPopper className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  Kehadiran anda telah disahkan. Selamat bersaing — semoga berjaya!
                                </p>
                              </div>
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
          registering={registering}
          error={registerErr}
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
      {tokenTarget && (
        <TokenInfoModal
          token={tokenTarget}
          onClose={() => setTokenTarget(null)}
        />
      )}
    </div>
  );
}
