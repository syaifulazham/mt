"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  MapPin,
  Users,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── types ──────────────────────────────────────────────────────────────────────

type TeamRef = {
  id: string;
  name: string;
  status: string;
  competitionId: string;
  contingentId: string;
  competition: { id: string; name: string; code: string };
  memberCount: number;
};

type EventEntry = {
  id: string;
  name: string;
  slug: string;
  status: string;
  scope: string;
  venue: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  participatingTeams: TeamRef[];
  eligibleTeams: TeamRef[];
};

// ── helpers ────────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  PUBLISHED: "bg-green-100 text-green-700 border-green-200",
  ACTIVE:    "bg-blue-100 text-blue-700 border-blue-200",
  COMPLETED: "bg-zinc-100 text-zinc-500 border-zinc-200",
  DRAFT:     "bg-yellow-100 text-yellow-700 border-yellow-200",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

// ── Add-team dialog ────────────────────────────────────────────────────────────

function AddTeamDialog({
  event,
  open,
  onClose,
  onAdded,
}: {
  event: EventEntry;
  open: boolean;
  onClose: () => void;
  onAdded: (eventId: string, team: TeamRef) => void;
}) {
  const [joining, setJoining] = useState<string | null>(null);

  async function join(team: TeamRef) {
    setJoining(team.id);
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id }),
      });
      if (res.ok) onAdded(event.id, team);
    } finally {
      setJoining(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah Pasukan ke {event.name}</DialogTitle>
        </DialogHeader>
        {event.eligibleTeams.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">Tiada pasukan yang layak untuk acara ini.</p>
        ) : (
          <ul className="divide-y max-h-80 overflow-y-auto">
            {event.eligibleTeams.map((team) => (
              <li key={team.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{team.name}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    {team.competition.code} · {team.memberCount} ahli
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={joining === team.id}
                  onClick={() => join(team)}
                >
                  {joining === team.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <><Plus className="h-3.5 w-3.5 mr-1" />Sertai</>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Mobile card view ───────────────────────────────────────────────────────────

function MobileEventCard({
  event,
  onRemoveTeam,
  onAddTeam,
}: {
  event: EventEntry;
  onRemoveTeam: (eventId: string, teamId: string) => void;
  onAddTeam: (event: EventEntry) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(teamId: string) {
    setRemoving(teamId);
    try {
      const res = await fetch(`/api/v2/manager/teams/${teamId}/events/${event.id}`, { method: "DELETE" });
      if (res.ok) onRemoveTeam(event.id, teamId);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="rounded-xl border bg-white dark:bg-zinc-900 dark:border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="h-4 w-4 text-sky-500 shrink-0" />
          <span className="text-sm font-semibold">{event.name}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_CLS[event.status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200"}`}>
            {event.status}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400 flex-wrap pl-6">
          {event.venue && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.venue}</span>}
          <span>{fmt(event.startDate)} – {fmt(event.endDate)}</span>
        </div>
      </div>
      <div className="px-4 py-3">
        {event.participatingTeams.length === 0 ? (
          <p className="text-xs text-zinc-400 italic py-1">Tiada pasukan berdaftar lagi.</p>
        ) : (
          <ul className="divide-y dark:divide-zinc-800">
            {event.participatingTeams.map((team) => (
              <li key={team.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{team.name}</p>
                  <p className="text-xs text-zinc-400">{team.competition.code} · {team.memberCount} ahli</p>
                </div>
                <Button
                  size="sm" variant="ghost"
                  className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  disabled={removing === team.id}
                  onClick={() => remove(team.id)}
                >
                  {removing === team.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {event.eligibleTeams.length > 0 && (
          <div className="mt-3 pt-3 border-t dark:border-zinc-800">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAddTeam(event)}>
              <Plus className="h-3.5 w-3.5" />Tambah Pasukan
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Desktop table view ─────────────────────────────────────────────────────────

function DesktopTable({
  events,
  onRemoveTeam,
  onAddTeam,
}: {
  events: EventEntry[];
  onRemoveTeam: (eventId: string, teamId: string) => void;
  onAddTeam: (event: EventEntry) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(teamId: string, eventId: string) {
    setRemoving(teamId);
    try {
      const res = await fetch(`/api/v2/manager/teams/${teamId}/events/${eventId}`, { method: "DELETE" });
      if (res.ok) onRemoveTeam(eventId, teamId);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="rounded-xl border overflow-hidden dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            <th className="px-4 py-2.5 text-left w-[28%]">Pasukan</th>
            <th className="px-4 py-2.5 text-left w-[35%]">Pertandingan</th>
            <th className="px-4 py-2.5 text-center w-[8%]">Ahli</th>
            <th className="px-4 py-2.5 text-left w-[14%]">Tarikh Mula</th>
            <th className="px-4 py-2.5 text-right w-[15%]"></th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-zinc-900">
          {events.map((event) => (
            <React.Fragment key={event.id}>
              {/* ── Event group header ── */}
              <tr key={`${event.id}-header`} className="border-t dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                <td colSpan={4} className="px-4 py-2 border-l-4 border-sky-500">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">{event.name}</span>
                    {event.venue && (
                      <span className="text-xs text-zinc-400 flex items-center gap-1 ml-2">
                        <MapPin className="h-3 w-3 shrink-0" />{event.venue}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400 ml-1">{fmt(event.startDate)}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right border-l-0">
                  {event.eligibleTeams.length > 0 && (
                    <Button size="sm" variant="outline" className="gap-1 h-7 px-2.5 text-xs" onClick={() => onAddTeam(event)}>
                      <Plus className="h-3 w-3" />Tambah
                    </Button>
                  )}
                </td>
              </tr>

              {/* ── Team rows ── */}
              {event.participatingTeams.length === 0 ? (
                <tr key={`${event.id}-empty`} className="border-t dark:border-zinc-800">
                  <td colSpan={5} className="px-4 py-3 text-xs text-zinc-400 italic pl-10">
                    Tiada pasukan berdaftar lagi.
                  </td>
                </tr>
              ) : (
                event.participatingTeams.map((team) => (
                  <tr key={`${event.id}-${team.id}`} className="border-t dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-2.5 font-medium pl-10 truncate max-w-0">
                      <span className="block truncate">{team.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300 truncate max-w-0">
                      <span className="block truncate">{team.competition.code} - {team.competition.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-zinc-500">{team.memberCount}</td>
                    <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap text-xs">{fmt(event.startDate)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        disabled={removing === team.id}
                        onClick={() => remove(team.id, event.id)}
                      >
                        {removing === team.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = {
  contingents: { id: string; name: string }[];
};

export function ManagerEventsClient({ contingents: _contingents }: Props) {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<EventEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/manager/events");
      if (!res.ok) throw new Error("Gagal memuatkan acara");
      const json = await res.json();
      setEvents(json.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleRemoveTeam(eventId: string, teamId: string) {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id !== eventId ? ev : {
          ...ev,
          participatingTeams: ev.participatingTeams.filter((t) => t.id !== teamId),
          eligibleTeams: [...ev.eligibleTeams, ev.participatingTeams.find((t) => t.id === teamId)!],
        }
      )
    );
  }

  function handleTeamAdded(eventId: string, team: TeamRef) {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id !== eventId ? ev : {
          ...ev,
          participatingTeams: [...ev.participatingTeams, team],
          eligibleTeams: ev.eligibleTeams.filter((t) => t.id !== team.id),
        }
      )
    );
    setAddTarget((prev) =>
      prev?.id !== eventId ? prev : {
        ...prev,
        participatingTeams: [...prev.participatingTeams, team],
        eligibleTeams: prev.eligibleTeams.filter((t) => t.id !== team.id),
      }
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />Memuatkan acara…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-500">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <p className="text-sm">{error}</p>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Cuba semula
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Acara</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Urus penyertaan pasukan mengikut acara</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />Muat semula
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-zinc-400">
          <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Tiada acara ditemui untuk pasukan anda.</p>
          <p className="text-xs mt-1">Daftarkan pasukan anda ke acara dari halaman Pasukan.</p>
        </div>
      ) : (
        <>
          {/* Wide table — lg and above */}
          <div className="hidden lg:block">
            <DesktopTable
              events={events}
              onRemoveTeam={handleRemoveTeam}
              onAddTeam={setAddTarget}
            />
          </div>

          {/* Narrow cards — below lg */}
          <div className="flex flex-col gap-4 lg:hidden">
            {events.map((event) => (
              <MobileEventCard
                key={event.id}
                event={event}
                onRemoveTeam={handleRemoveTeam}
                onAddTeam={setAddTarget}
              />
            ))}
          </div>
        </>
      )}

      {addTarget && (
        <AddTeamDialog
          event={addTarget}
          open={true}
          onClose={() => setAddTarget(null)}
          onAdded={handleTeamAdded}
        />
      )}
    </div>
  );
}
