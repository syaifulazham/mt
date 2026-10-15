"use client";

import { useState } from "react";
import {
  ShieldCheck, Lock, LockOpen, ClipboardCheck, Megaphone, CheckCircle2, CircleDashed, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// The "announce completeness" subsection shared by regular judging
// (EventJudgingClient) and walk-in judging (WalkInJudgingManageClient).
//   OPEN       Admin / Super Admin: "Umumkan Selesai" (locks every judging form)
//   COMPLETED  Super Admin: "Verify" (results marked VERIFIED) or "Buka Semula"
//   VERIFIED   Super Admin: "Buka Semula"
// Rules are enforced server-side by transitionJudging (lib/judgingStatus.ts).

/** Judging lifecycle fields — see lib/judgingStatus.ts. */
export type JudgingState = {
  judgingStatus: string; // OPEN | COMPLETED | VERIFIED
  judgingCompletedAt: Date | string | null;
  judgingCompletedBy: string | null;
  judgingVerifiedAt: Date | string | null;
  judgingVerifiedBy: string | null;
};

/** A judging task (regular) or endpoint (walk-in), as the panel lists it. */
export type PanelTask = {
  id: string;
  label: string;
  /** Teams / participants with at least one score. */
  judged: number;
  /** When its judge announced it complete. */
  completedAt?: Date | string | null;
};

export const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  OPEN:      { label: "DIBUKA",   cls: "bg-sky-50 text-sky-700 border-sky-200" },
  COMPLETED: { label: "SELESAI",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  VERIFIED:  { label: "VERIFIED", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
};

export function fmtWhen(d: Date | string | null | undefined) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function JudgingStatusPanel({
  code, name, state, tasks, total, unit, taskNoun, statusUrl, canWrite, isSuperAdmin, onChanged,
}: {
  code: string;
  name: string;
  state: JudgingState;
  tasks: PanelTask[];
  /** Teams / participants to be judged. */
  total: number;
  /** "pasukan" or "peserta". */
  unit: string;
  /** "tugas" or "endpoint". */
  taskNoun: string;
  /** PATCH target for { action }. */
  statusUrl: string;
  canWrite: boolean;
  isSuperAdmin: boolean;
  onChanged: (judging: JudgingState) => void;
}) {
  const [confirm, setConfirm] = useState<"complete" | "verify" | "reopen" | null>(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");

  const status  = state.judgingStatus;
  const pending = tasks.filter(t => t.judged < total);
  const allDone = tasks.length > 0 && total > 0 && pending.length === 0;

  async function run(action: "complete" | "verify" | "reopen") {
    setBusy(true); setError("");
    try {
      const res = await fetch(statusUrl, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      onChanged(j.judging);
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally { setBusy(false); }
  }

  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.OPEN;

  return (
    <div className={cn(
      "px-5 py-4 space-y-3",
      status === "VERIFIED" ? "bg-emerald-50/50" : status === "COMPLETED" ? "bg-amber-50/40" : "bg-white",
    )}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {status === "VERIFIED" ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
              : status === "COMPLETED" ? <Lock className="h-4 w-4 text-amber-600" />
              : <ClipboardCheck className="h-4 w-4 text-zinc-400" />}
            <span className="text-sm font-semibold text-zinc-800">Status Penghakiman</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", chip.cls)}>{chip.label}</span>
          </div>
          <p className="text-xs text-zinc-500">
            {status === "OPEN" && `Borang penghakiman dibuka. Umumkan selesai apabila semua ${unit} telah dinilai — borang akan dikunci.`}
            {status === "COMPLETED" && <>Penghakiman diumumkan selesai oleh <b>{state.judgingCompletedBy}</b> pada {fmtWhen(state.judgingCompletedAt)}. Borang penghakiman dikunci; menunggu pengesahan Super Admin.</>}
            {status === "VERIFIED" && <>Keputusan disahkan (<b>VERIFIED</b>) oleh <b>{state.judgingVerifiedBy}</b> pada {fmtWhen(state.judgingVerifiedAt)}. Diumumkan selesai oleh {state.judgingCompletedBy} pada {fmtWhen(state.judgingCompletedAt)}.</>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "OPEN" && canWrite && (
            <Button size="sm" onClick={() => setConfirm("complete")} disabled={tasks.length === 0}
              title={tasks.length === 0 ? `Tiada ${taskNoun} penghakiman` : undefined}
              className="h-7 text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-white">
              <Megaphone className="h-3.5 w-3.5" /> Umumkan Selesai
            </Button>
          )}
          {status === "COMPLETED" && isSuperAdmin && (
            <Button size="sm" onClick={() => setConfirm("verify")}
              className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
              <ShieldCheck className="h-3.5 w-3.5" /> Verify
            </Button>
          )}
          {status !== "OPEN" && isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => setConfirm("reopen")}
              className="h-7 text-xs gap-1 border-zinc-300 text-zinc-700">
              <LockOpen className="h-3.5 w-3.5" /> Buka Semula
            </Button>
          )}
        </div>
      </div>

      {/* Completeness: judged per task, out of the total to judge */}
      {tasks.length > 0 && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {tasks.map(t => {
            const done = total > 0 && t.judged >= total;
            return (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                {done
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <CircleDashed className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <span className="truncate text-zinc-700">{t.label}</span>
                {t.completedAt && (
                  <span title={`Hakim mengumumkan selesai pada ${fmtWhen(t.completedAt)}`}
                    className="shrink-0 text-[9px] font-bold px-1.5 py-px rounded bg-amber-100 text-amber-700">
                    HAKIM: SELESAI
                  </span>
                )}
                <span className={cn("ml-auto tabular-nums", done ? "text-emerald-700" : "text-amber-700")}>
                  {t.judged}/{total} {unit} dinilai
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}

      <Dialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {confirm === "complete" ? "Umumkan penghakiman selesai?" : confirm === "verify" ? "Sahkan keputusan (VERIFIED)?" : "Buka semula penghakiman?"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-2 space-y-2 text-xs text-zinc-600">
            <p className="font-medium text-zinc-800">
              <span className="font-mono text-zinc-400 mr-1">{code}</span>{name}
            </p>
            {confirm === "complete" && (
              <>
                <p>Semua borang penghakiman bagi pertandingan ini akan <b>dikunci</b> — hakim tidak lagi boleh menambah atau mengubah markah. Hanya Super Admin boleh membuka semula.</p>
                {!allDone && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
                    {total === 0
                      ? `Tiada ${unit} didaftarkan untuk pertandingan ini.`
                      : `${pending.length} daripada ${tasks.length} ${taskNoun} belum menilai kesemua ${total} ${unit}.`}
                  </p>
                )}
              </>
            )}
            {confirm === "verify" && <p>Keputusan pertandingan ini akan ditanda <b>VERIFIED</b>. Borang kekal dikunci.</p>}
            {confirm === "reopen" && <p>Borang penghakiman akan dibuka semula dan hakim boleh mengubah markah. {status === "VERIFIED" && "Status VERIFIED akan dibatalkan."}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button>
            <Button onClick={() => confirm && run(confirm)} disabled={busy}
              className={cn("gap-1.5 text-white",
                confirm === "verify" ? "bg-emerald-600 hover:bg-emerald-700"
                : confirm === "complete" ? "bg-amber-500 hover:bg-amber-600"
                : "bg-zinc-700 hover:bg-zinc-800")}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirm === "complete" ? "Umumkan Selesai" : confirm === "verify" ? "Verify" : "Buka Semula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
