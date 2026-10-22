"use client";

import { useEffect, useState } from "react";
import { Flag, Loader2, Lock, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TaskJudgingState, TaskLockMap } from "@/lib/judgingStatus";
import { confirmationCode } from "@/lib/confirmationCode";

// "Penghakiman Selesai" on the judge-facing boards, shared by regular judging
// (/judging/[slug] → /api/judging/[slug]) and walk-in judging
// (/walkin-judging/[slug] → /api/walkin-judging/[slug]). A judge completes
// their task nationally ("Kebangsaan") or for one state; locks come back as a
// TaskLockMap (national + per state).

/** How often an open board or form re-checks whether judging has been announced complete. */
export const STATUS_POLL_MS = 10_000;


/** Lock map from a board / status / complete response (older shape: `judging` only). */
export function lockMapOf(j: { judging?: TaskJudgingState | null; locks?: TaskLockMap | null } | null | undefined): TaskLockMap | null {
  if (j?.locks) return j.locks;
  return j?.judging ? { national: j.judging, states: {} } : null;
}

/** Is a team / participant of `stateId` locked? Returns the message to show, or null. */
export function lockedFor(locks: TaskLockMap | null, stateId: string | null | undefined): string | null {
  if (!locks) return null;
  if (locks.national.locked) return locks.national.message ?? "Penghakiman telah dikunci.";
  const st = stateId ? locks.states[stateId] : undefined;
  return st?.locked ? (st.message ?? "Penghakiman negeri ini telah dikunci.") : null;
}

/**
 * Lock state of one judging task / endpoint: seeded from the board load, then
 * polled from `${apiBase}/status`, so an announcement by this judge, by the
 * judge of the competition's last open task or by an organizer reaches every
 * open screen. `announce(stateId)` posts to `${apiBase}/complete`.
 */
export function useJudgingCompletion(apiBase: string, active: boolean, passcode: () => string) {
  const [locks, setLocks]           = useState<TaskLockMap | null>(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!active) return;
    const tick = () =>
      fetch(`${apiBase}/status`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => { const m = lockMapOf(j); if (m) setLocks(m); })
        .catch(() => {});
    const t = setInterval(tick, STATUS_POLL_MS);
    return () => clearInterval(t);
  }, [apiBase, active]);

  /** stateId null = the whole task. Returns an error message, or null on success. */
  async function announce(stateId: string | null): Promise<string | null> {
    try {
      const res = await fetch(`${apiBase}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode(), stateId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return j.error === "WRONG_PASSCODE" ? "Sesi tamat. Log masuk semula." : (j.error ?? "Gagal mengumumkan.");
      setLocks(lockMapOf(j));
      setCompleting(false);
      return null;
    } catch { return "Ralat rangkaian."; }
  }

  const judging = locks?.national ?? null;
  return { locks, setLocks, judging, locked: judging?.locked ?? false, completing, setCompleting, announce };
}

/** The header button. */
export function CompleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      className="shrink-0 h-8 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold"
    >
      <Flag className="h-3.5 w-3.5" /> Penghakiman Selesai
    </Button>
  );
}

/** Banner under the header while the whole task is locked (green once VERIFIED). */
export function JudgingLockBanner({ judging }: { judging: TaskJudgingState }) {
  const verified = judging.judgingStatus === "VERIFIED";
  return (
    <div className={cn("border-t px-4 py-2.5", verified ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100")}>
      <div className="max-w-5xl mx-auto flex items-center gap-2 text-xs">
        {verified
          ? <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          : <Lock className="h-4 w-4 text-amber-600 shrink-0" />}
        <span className={verified ? "text-emerald-800" : "text-amber-800"}>
          <b>
            {verified ? "Keputusan VERIFIED."
              : judging.judgingStatus === "COMPLETED" ? "Penghakiman pertandingan selesai."
              : "Penghakiman selesai."}
          </b>{" "}
          {judging.message}
          {judging.taskCompletedAt && (
            <> · {new Date(judging.taskCompletedAt).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}</>
          )}
        </span>
      </div>
    </div>
  );
}

/** Strip listing the states locked on this task (when the task as a whole is still open). */
export function StateLockStrip({ locks, stateNames }: { locks: TaskLockMap | null; stateNames: Map<string, string> }) {
  if (!locks || locks.national.locked) return null;
  const locked = Object.entries(locks.states).filter(([, s]) => s.locked);
  if (locked.length === 0) return null;
  return (
    <div className="border-t px-4 py-2 bg-amber-50/70 border-amber-100">
      <div className="max-w-5xl mx-auto flex items-start gap-2 text-xs text-amber-800">
        <MapPin className="h-4 w-4 text-amber-600 shrink-0 mt-px" />
        <span>
          <b>Dikunci bagi negeri:</b>{" "}
          {locked.map(([id, s], i) => (
            <span key={id}>
              {i > 0 && ", "}
              {stateNames.get(id) ?? "—"}
              <span className="text-amber-600">
                {s.judgingStatus === "VERIFIED" ? " (VERIFIED)" : s.reason === "state" ? " (selesai)" : " (tugas anda selesai)"}
              </span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** A choice in the completion dialog: the whole task (id null) or one state. */
export type CompleteScope = { id: string | null; name: string; total: number; scored: number; locked: boolean };

/** Confirmation: pick Kebangsaan or a state, then type the shown 5-character code. */
export function CompleteDialog({
  scopes, unit, onCancel, onConfirm,
}: {
  /** First entry is the national scope (id null). Locked scopes are shown disabled. */
  scopes: CompleteScope[];
  /** "pasukan" or "peserta". */
  unit: string;
  onCancel: () => void; onConfirm: (stateId: string | null) => Promise<string | null>;
}) {
  const [code]            = useState(confirmationCode);
  const [typed, setTyped] = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const [scopeId, setScopeId] = useState<string | null>(scopes.find(s => !s.locked)?.id ?? null);
  const scope   = scopes.find(s => s.id === scopeId) ?? scopes[0];
  const matches = typed.trim().toUpperCase() === code;

  async function submit() {
    if (!matches || scope?.locked) return;
    setBusy(true); setError("");
    const err = await onConfirm(scope?.id ?? null);
    if (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Flag className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Umumkan penghakiman selesai?</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Borang penghakiman akan <b>dikunci</b> bagi skop yang dipilih — markah tidak lagi boleh ditambah atau diubah.
              Hanya Super Admin boleh membukanya semula.
            </p>
          </div>
        </div>

        {/* Scope: Kebangsaan or one state */}
        {scopes.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-600">Skop:</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
              {scopes.map(s => (
                <label key={s.id ?? "__national"} className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs cursor-pointer",
                  s.locked ? "opacity-50 cursor-not-allowed" : "hover:bg-zinc-50",
                  scopeId === s.id && !s.locked && "bg-amber-50",
                )}>
                  <input type="radio" name="scope" disabled={s.locked} checked={scopeId === s.id}
                    onChange={() => setScopeId(s.id)} className="accent-amber-500" />
                  <span className={cn("flex-1", s.id === null && "font-semibold")}>{s.name}</span>
                  <span className="tabular-nums text-zinc-400">
                    {s.locked ? "Dikunci" : `${s.scored}/${s.total}`}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {scope && !scope.locked && scope.scored < scope.total && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Baru {scope.scored} daripada {scope.total} {unit} dinilai{scope.id ? ` bagi ${scope.name}` : ""}.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs text-zinc-600">Taip kod di bawah untuk mengesahkan:</p>
          <p className="select-none text-center font-mono text-2xl font-bold tracking-[0.4em] text-zinc-900 bg-zinc-100 rounded-lg py-2">
            {code}
          </p>
          <Input
            value={typed}
            onChange={e => setTyped(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="Kod pengesahan"
            maxLength={5}
            autoFocus
            autoComplete="off"
            className="text-center font-mono tracking-[0.3em] text-lg h-11"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Batal</Button>
          <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={submit} disabled={!matches || busy || !!scope?.locked}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Sahkan Selesai
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Builds the dialog's scopes from the board's units: Kebangsaan first, then
 * each state present, with scored / total counts and whether it's locked.
 */
export function completeScopes(
  units: { stateId: string | null; stateName: string | null; scored: boolean }[],
  locks: TaskLockMap | null,
): CompleteScope[] {
  const byState = new Map<string, { name: string; total: number; scored: number }>();
  for (const u of units) {
    if (!u.stateId) continue;
    const cur = byState.get(u.stateId) ?? { name: u.stateName ?? "—", total: 0, scored: 0 };
    cur.total++; if (u.scored) cur.scored++;
    byState.set(u.stateId, cur);
  }
  return [
    { id: null, name: "Kebangsaan (semua negeri)", total: units.length, scored: units.filter(u => u.scored).length, locked: !!locks?.national.locked },
    ...[...byState.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, s]) => ({ id, ...s, locked: !!lockedFor(locks, id) })),
  ];
}

/**
 * Polls `${apiBase}/status` while an individual scoring form is open; returns
 * the lock message once the form's team / participant (of `stateId`) is
 * locked — nationally or for its state — so the form can disable saving.
 */
export function useFormLock(apiBase: string, active: boolean, stateId: string | null | undefined) {
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      fetch(`${apiBase}/status`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => { const msg = lockedFor(lockMapOf(j), stateId); if (msg) setLockedMsg(msg); })
        .catch(() => {});
    }, STATUS_POLL_MS);
    return () => clearInterval(t);
  }, [apiBase, active, stateId]);
  return [lockedMsg, setLockedMsg] as const;
}
