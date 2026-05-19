"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Trophy, Mail, CheckCircle2, BookOpen, Copy, AlertCircle, KeyRound, GraduationCap, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// ── Types ──────────────────────────────────────────────────────────────────────

type Team = {
  id: string;
  name: string;
  email: string | null;
  lmsUserId: string | null;
  lmsPassword: string | null;
  lmsCourseEnrolled: boolean;
  competition: {
    id: string; name: string; code: string;
    maxTeamSize: number; minTeamSize: number;
    eptimEduCourseId: string | null;
  };
};

type Credentials = { username: string; password: string; enrolled: boolean };

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy}
      className="ml-1 shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors"
      title="Copy">
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Credentials modal ──────────────────────────────────────────────────────────

function CredentialsDialog({
  creds, teamName, onClose,
}: {
  creds: Credentials | null;
  teamName: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!creds} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" /> Bengkel MT Account Ready
          </DialogTitle>
          <DialogDescription className="text-xs mt-1">
            Account created for <strong>{teamName}</strong>. Share these credentials with the team.
          </DialogDescription>
        </DialogHeader>

        {creds && (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border bg-zinc-50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Username</span>
                <div className="flex items-center font-mono text-zinc-800 font-medium">
                  {creds.username}<CopyBtn text={creds.username} />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Password</span>
                <div className="flex items-center font-mono text-zinc-800 font-medium">
                  {creds.password}<CopyBtn text={creds.password} />
                </div>
              </div>
            </div>
            {creds.enrolled && (
              <p className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                Automatically enrolled in the linked course.
              </p>
            )}
            <p className="text-[11px] text-zinc-400">
              Username is derived from the team email. Password is shown once — save it now.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Team row ───────────────────────────────────────────────────────────────────

function TeamRow({
  team,
  onJoined,
  onEnrolled,
}: {
  team: Team;
  onJoined: (teamId: string, creds: Credentials) => void;
  onEnrolled: (teamId: string) => void;
}) {
  const [joining,   setJoining]   = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [err,       setErr]       = useState("");

  const hasAccount  = !!team.lmsUserId;
  const hasCourse   = !!team.competition.eptimEduCourseId;
  const courseEnrolled = team.lmsCourseEnrolled;

  async function join() {
    setJoining(true); setErr("");
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/lms`, { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onJoined(team.id, j.data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setJoining(false); }
  }

  async function enrol() {
    setEnrolling(true); setErr("");
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/lms/enrol`, { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onEnrolled(team.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setEnrolling(false); }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors">
      {/* Team name + email */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-800 truncate">{team.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Mail className="h-3 w-3 text-zinc-400 shrink-0" />
          <span className={`text-xs truncate ${team.email ? "text-zinc-500" : "text-zinc-300 italic"}`}>
            {team.email ?? "No email set"}
          </span>
        </div>
        {err && (
          <p className="flex items-center gap-1 text-[11px] text-red-600 mt-1">
            <AlertCircle className="h-3 w-3 shrink-0" />{err}
          </p>
        )}
      </div>

      {/* Status / actions */}
      <div className="shrink-0 flex items-center gap-2">
        {!hasAccount ? (
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={joining || !team.email}
            onClick={join}
            title={!team.email ? "Set team email first (in Teams page)" : undefined}
          >
            {joining
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <KeyRound className="h-3.5 w-3.5" />}
            Join Bengkel
          </Button>
        ) : courseEnrolled ? (
          <BadgeCheck className="h-8 w-8 text-blue-500" />
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />Registered
            </div>
            {hasCourse && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                disabled={enrolling}
                onClick={enrol}
              >
                {enrolling
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <GraduationCap className="h-3.5 w-3.5" />}
                Enrol to Course
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main BengkelClient ─────────────────────────────────────────────────────────

export function BengkelClient() {
  const [teams,   setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [creds,   setCreds]   = useState<{ teamId: string; teamName: string; data: Credentials } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/manager/teams");
      const j   = await res.json();
      const fetched: Team[] = j.data ?? [];
      setTeams(fetched);

      // Sync enrollment status for registered teams whose DB flag may be stale
      const toSync = fetched.filter(
        t => t.lmsUserId && t.competition.eptimEduCourseId && !t.lmsCourseEnrolled
      );
      if (toSync.length > 0) {
        const results = await Promise.allSettled(
          toSync.map(t =>
            fetch(`/api/v2/manager/teams/${t.id}/lms/enrol`, { method: "POST" })
              .then(r => ({ id: t.id, ok: r.ok }))
          )
        );
        const enrolledIds = new Set(
          results
            .filter((r): r is PromiseFulfilledResult<{ id: string; ok: boolean }> => r.status === "fulfilled" && r.value.ok)
            .map(r => r.value.id)
        );
        if (enrolledIds.size > 0) {
          setTeams(prev => prev.map(t => enrolledIds.has(t.id) ? { ...t, lmsCourseEnrolled: true } : t));
        }
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleJoined(teamId: string, data: Credentials) {
    const team = teams.find(t => t.id === teamId);
    if (team) setCreds({ teamId, teamName: team.name, data });
    setTeams(prev => prev.map(t =>
      t.id === teamId ? { ...t, lmsUserId: data.username, lmsCourseEnrolled: data.enrolled } : t
    ));
  }

  function handleEnrolled(teamId: string) {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, lmsCourseEnrolled: true } : t));
  }

  // Group by competition
  const grouped = teams.reduce<Record<string, Team[]>>((acc, t) => {
    if (!acc[t.competition.id]) acc[t.competition.id] = [];
    acc[t.competition.id].push(t);
    return acc;
  }, {});

  const enrolled = teams.filter(t => t.lmsUserId).length;
  const total    = teams.length;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Bengkel MT</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Register your teams for the Bengkel MT online learning platform.
          {total > 0 && ` ${enrolled}/${total} teams enrolled.`}
        </p>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="rounded-full bg-blue-50 p-4">
            <Trophy className="h-8 w-8 text-blue-400" />
          </div>
          <p className="font-medium">No teams yet</p>
          <p className="text-sm text-zinc-500">Create teams on the Teams page first.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([, compTeams]) => {
            const comp = compTeams[0].competition;
            return (
              <div key={comp.id} className="rounded-xl border bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-zinc-50/80">
                  <Trophy className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-600">{comp.name}</span>
                  <span className="text-[10px] text-zinc-400 font-mono">({comp.code})</span>
                </div>
                <div className="divide-y">
                  {compTeams.map(t => (
                    <TeamRow key={t.id} team={t} onJoined={handleJoined} onEnrolled={handleEnrolled} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CredentialsDialog
        creds={creds?.data ?? null}
        teamName={creds?.teamName ?? ""}
        onClose={() => setCreds(null)}
      />
    </div>
  );
}
