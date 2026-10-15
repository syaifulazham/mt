"use client";

import { useState } from "react";
import { ShieldCheck, Lock, LockOpen, Megaphone, CheckCircle2, CircleDashed, Loader2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { JudgingRow } from "@/lib/judgingStatus";

// The "announce completeness" table shared by regular judging
// (EventJudgingClient) and walk-in judging (WalkInJudgingManageClient): one row
// for the whole competition ("Semua") and one per state that has teams /
// participants, each with its own lifecycle:
//   OPEN       Admin / Super Admin: "Selesai" (locks that row's judging forms)
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

export const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  OPEN:      { label: "DIBUKA",   cls: "bg-sky-50 text-sky-700 border-sky-200" },
  COMPLETED: { label: "SELESAI",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  VERIFIED:  { label: "VERIFIED", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
};

export function fmtWhen(d: Date | string | null | undefined) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "";
}

type Action = "complete" | "verify" | "reopen";

export function JudgingStatusTable({
  code, name, rows: allRows, taskLabels, unit, statusUrl, canWrite, isSuperAdmin, onChanged,
  showStates = true, nationalLabel = "Semua",
}: {
  code: string;
  name: string;
  /** "Semua" first, then states — from eventJudgingProgress / walkInJudgingProgress. */
  rows: JudgingRow[];
  /** Task id → label, for the per-task breakdown. */
  taskLabels: Record<string, string>;
  /** "pasukan" or "peserta". */
  unit: string;
  /** PATCH target for { action, stateId? }. */
  statusUrl: string;
  canWrite: boolean;
  isSuperAdmin: boolean;
  onChanged: (stateId: string | null, judging: JudgingState) => void;
  /** Show the per-state rows (false = the national row only). */
  showStates?: boolean;
  /** Label of the national row ("Kebangsaan" for NATIONAL events). */
  nationalLabel?: string;
}) {
  const rows = showStates ? allRows : allRows.filter(r => r.stateId === null);
  const [confirm, setConfirm] = useState<{ action: Action; row: JudgingRow } | null>(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const hasTasks = (rows[0]?.tasks.length ?? 0) > 0;

  async function run(action: Action, row: JudgingRow) {
    setBusy(true); setError("");
    try {
      const res = await fetch(statusUrl, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, stateId: row.stateId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      onChanged(row.stateId, j.judging);
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally { setBusy(false); }
  }

  const national = rows[0];
  const nationalLocked = national && national.judgingStatus !== "OPEN";

  return (
    <div className="px-5 py-4 space-y-2 bg-white">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-800">Status Penghakiman</span>
        <span className="text-[11px] text-zinc-400">
          Umumkan selesai bagi semua negeri atau satu negeri — borang {unit} berkenaan akan dikunci.
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-50 border-b text-[11px] font-medium text-zinc-500">
              <th className="px-3 py-2 text-left">Negeri</th>
              <th className="px-3 py-2 text-left w-40">Dinilai</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right w-56">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const chip = STATUS_CHIP[row.judgingStatus] ?? STATUS_CHIP.OPEN;
              const done = row.total > 0 && row.judgedAll >= row.total;
              const judgesDone = row.tasks.filter(t => t.completedAt).length;
              const isNational = row.stateId === null;
              // A state row under a locked national row is covered by it.
              const covered = !isNational && nationalLocked;
              const breakdown = row.tasks
                .map(t => `${taskLabels[t.id] ?? "Tugas"}: ${t.judged}/${row.total}${t.completedAt ? ` · hakim selesai ${fmtWhen(t.completedAt)}` : ""}`)
                .join("\n");
              return (
                <tr key={row.stateId ?? "__all"} className={cn(
                  "border-b last:border-0",
                  isNational && "bg-zinc-50/60 font-medium",
                  row.judgingStatus === "VERIFIED" ? "bg-emerald-50/60" : row.judgingStatus === "COMPLETED" ? "bg-amber-50/40" : "",
                )}>
                  <td className="px-3 py-2 text-zinc-800">{isNational ? nationalLabel : row.stateName}</td>
                  <td className="px-3 py-2" title={breakdown || undefined}>
                    <span className="inline-flex items-center gap-1.5">
                      {done
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        : <CircleDashed className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      <span className={cn("tabular-nums", done ? "text-emerald-700" : "text-amber-700")}>{row.judgedAll}/{row.total}</span>
                      {judgesDone > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded bg-amber-100 text-amber-700">
                          HAKIM {judgesDone}/{row.tasks.length}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      {row.judgingStatus === "VERIFIED" ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        : row.judgingStatus === "COMPLETED" ? <Lock className="h-3.5 w-3.5 text-amber-600" /> : null}
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", chip.cls)}>{chip.label}</span>
                      {row.judgingStatus === "COMPLETED" && (
                        <span className="text-[10px] text-zinc-500">{row.judgingCompletedBy} · {fmtWhen(row.judgingCompletedAt)}</span>
                      )}
                      {row.judgingStatus === "VERIFIED" && (
                        <span className="text-[10px] text-zinc-500">disahkan {row.judgingVerifiedBy} · {fmtWhen(row.judgingVerifiedAt)}</span>
                      )}
                      {covered && row.judgingStatus === "OPEN" && (
                        <span className="text-[10px] text-zinc-400 italic">dikunci melalui &quot;Semua&quot;</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      {row.judgingStatus === "OPEN" && canWrite && !covered && (
                        <Button size="sm" onClick={() => setConfirm({ action: "complete", row })} disabled={!hasTasks}
                          title={!hasTasks ? "Tiada tugas penghakiman" : undefined}
                          className="h-6 px-2 text-[11px] gap-1 bg-amber-500 hover:bg-amber-600 text-white">
                          <Megaphone className="h-3 w-3" /> Selesai
                        </Button>
                      )}
                      {row.judgingStatus === "COMPLETED" && isSuperAdmin && (
                        <Button size="sm" onClick={() => setConfirm({ action: "verify", row })}
                          className="h-6 px-2 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                          <ShieldCheck className="h-3 w-3" /> Verify
                        </Button>
                      )}
                      {row.judgingStatus !== "OPEN" && isSuperAdmin && (
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ action: "reopen", row })}
                          className="h-6 px-2 text-[11px] gap-1 border-zinc-300 text-zinc-700">
                          <LockOpen className="h-3 w-3" /> Buka Semula
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}

      <Dialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {confirm?.action === "complete" ? "Umumkan penghakiman selesai?" : confirm?.action === "verify" ? "Sahkan keputusan (VERIFIED)?" : "Buka semula penghakiman?"}
            </DialogTitle>
          </DialogHeader>
          {confirm && (
            <div className="px-4 py-2 space-y-2 text-xs text-zinc-600">
              <p className="font-medium text-zinc-800">
                <span className="font-mono text-zinc-400 mr-1">{code}</span>{name}
              </p>
              <p>Skop: <b>{confirm.row.stateId === null ? (nationalLabel === "Semua" ? "Semua negeri" : nationalLabel) : confirm.row.stateName}</b></p>
              {confirm.action === "complete" && (
                <>
                  <p>Borang penghakiman bagi {confirm.row.stateId === null ? `semua ${unit}` : `${unit} negeri ini`} akan <b>dikunci</b> — hakim tidak lagi boleh menambah atau mengubah markah. Hanya Super Admin boleh membuka semula.</p>
                  {confirm.row.judgedAll < confirm.row.total && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
                      {confirm.row.total === 0
                        ? `Tiada ${unit} didaftarkan.`
                        : `Baru ${confirm.row.judgedAll} daripada ${confirm.row.total} ${unit} dinilai oleh semua tugas.`}
                    </p>
                  )}
                </>
              )}
              {confirm.action === "verify" && <p>Keputusan {confirm.row.stateId === null ? "pertandingan ini" : "negeri ini"} akan ditanda <b>VERIFIED</b> dan boleh dipaparkan. Borang kekal dikunci.</p>}
              {confirm.action === "reopen" && <p>Borang penghakiman akan dibuka semula dan hakim boleh mengubah markah. {confirm.row.judgingStatus === "VERIFIED" && "Status VERIFIED akan dibatalkan."}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button>
            <Button onClick={() => confirm && run(confirm.action, confirm.row)} disabled={busy}
              className={cn("gap-1.5 text-white",
                confirm?.action === "verify" ? "bg-emerald-600 hover:bg-emerald-700"
                : confirm?.action === "complete" ? "bg-amber-500 hover:bg-amber-600"
                : "bg-zinc-700 hover:bg-zinc-800")}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirm?.action === "complete" ? "Umumkan Selesai" : confirm?.action === "reopen" ? "Buka Semula" : "Verify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Apply a transition result to the table's rows in place (the poll then confirms). */
export function applyRowChange(rows: JudgingRow[], stateId: string | null, judging: JudgingState): JudgingRow[] {
  const iso = (d: Date | string | null) => d == null ? null : typeof d === "string" ? d : d.toISOString();
  return rows.map(r => r.stateId !== stateId ? r : {
    ...r,
    judgingStatus: judging.judgingStatus,
    judgingCompletedAt: iso(judging.judgingCompletedAt), judgingCompletedBy: judging.judgingCompletedBy,
    judgingVerifiedAt: iso(judging.judgingVerifiedAt),   judgingVerifiedBy: judging.judgingVerifiedBy,
    // Reopening a row also reopens the judges' announcements for it.
    ...(judging.judgingStatus === "OPEN" && { tasks: r.tasks.map(t => ({ ...t, completedAt: null })) }),
  });
}
