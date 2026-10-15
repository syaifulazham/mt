"use client";

import { useEffect, useState } from "react";
import { Flag, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TaskJudgingState } from "@/lib/judgingStatus";

// "Penghakiman Selesai" on the judge-facing boards, shared by regular judging
// (/judging/[slug] → /api/judging/[slug]) and walk-in judging
// (/walkin-judging/[slug] → /api/walkin-judging/[slug]).

/** How often an open board or form re-checks whether judging has been announced complete. */
export const STATUS_POLL_MS = 10_000;

// Confirmation code: 5 random characters, without look-alikes (0/O, 1/I/L) so a
// judge can't mistype what they read.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function confirmationCode(len = 5) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}

/**
 * Lock state of one judging task / endpoint: seeded from the board load, then
 * polled from `${apiBase}/status`, so an announcement by this judge, by the
 * judge of the competition's last open task or by an organizer reaches every
 * open screen. `announce` posts to `${apiBase}/complete`.
 */
export function useJudgingCompletion(apiBase: string, active: boolean, passcode: () => string) {
  const [judging, setJudging]       = useState<TaskJudgingState | null>(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!active) return;
    const tick = () =>
      fetch(`${apiBase}/status`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (j?.judging) setJudging(j.judging); })
        .catch(() => {});
    const t = setInterval(tick, STATUS_POLL_MS);
    return () => clearInterval(t);
  }, [apiBase, active]);

  /** Returns an error message, or null on success. */
  async function announce(): Promise<string | null> {
    try {
      const res = await fetch(`${apiBase}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: passcode() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return j.error === "WRONG_PASSCODE" ? "Sesi tamat. Log masuk semula." : (j.error ?? "Gagal mengumumkan.");
      setJudging(j.judging);
      setCompleting(false);
      return null;
    } catch { return "Ralat rangkaian."; }
  }

  return { judging, setJudging, locked: judging?.locked ?? false, completing, setCompleting, announce };
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

/** Banner under the header while locked (green once VERIFIED). */
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

/** Confirmation: the judge types the shown 5-character code. */
export function CompleteDialog({
  scoredCount, total, unit, onCancel, onConfirm,
}: {
  scoredCount: number; total: number;
  /** "pasukan" or "peserta". */
  unit: string;
  onCancel: () => void; onConfirm: () => Promise<string | null>;
}) {
  const [code]            = useState(confirmationCode);
  const [typed, setTyped] = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const matches = typed.trim().toUpperCase() === code;

  async function submit() {
    if (!matches) return;
    setBusy(true); setError("");
    const err = await onConfirm();
    if (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Flag className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Umumkan penghakiman selesai?</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Borang penghakiman ini akan <b>dikunci</b> — markah tidak lagi boleh ditambah atau diubah.
              Hanya Super Admin boleh membukanya semula.
            </p>
          </div>
        </div>

        {scoredCount < total && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Baru {scoredCount} daripada {total} {unit} dinilai.
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
          <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={submit} disabled={!matches || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Sahkan Selesai
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Polls `${apiBase}/status` while an individual scoring form is open; returns
 * the lock message once locked (null otherwise) so the form can disable saving.
 */
export function useFormLock(apiBase: string, active: boolean) {
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      fetch(`${apiBase}/status`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (j?.judging?.locked) setLockedMsg(j.judging.message ?? "Penghakiman telah dikunci."); })
        .catch(() => {});
    }, STATUS_POLL_MS);
    return () => clearInterval(t);
  }, [apiBase, active]);
  return [lockedMsg, setLockedMsg] as const;
}
