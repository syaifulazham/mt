"use client";

import { useState } from "react";
import { Loader2, LockOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ResultsJudging } from "@/components/organizer/judging/JudgingBadge";

/**
 * Super Admin verification from the results pages (regular and walk-in): the
 * same transitions as the judging pages' "Status Penghakiman" panel, through
 * the same judging-status endpoint (rules enforced by transitionJudging).
 *   COMPLETED  → "Verify" (results marked VERIFIED) or "Buka Semula"
 *   VERIFIED   → "Buka Semula"
 * Nothing while judging is still OPEN — completion is announced on the
 * judging page, where its progress is visible.
 */
export function JudgingVerifyActions({
  code, name, judging, onChanged,
}: {
  code: string;
  name: string;
  judging: ResultsJudging;
  onChanged: (judging: ResultsJudging) => void;
}) {
  const [confirm, setConfirm] = useState<"verify" | "reopen" | null>(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");

  if (!judging.statusUrl || judging.status === "OPEN") return null;

  async function run(action: "verify" | "reopen") {
    setBusy(true); setError("");
    try {
      const res = await fetch(judging.statusUrl!, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      const s = j.judging as { judgingStatus: string; judgingVerifiedAt: string | null; judgingVerifiedBy: string | null };
      onChanged({ ...judging, status: s.judgingStatus, verifiedAt: s.judgingVerifiedAt, verifiedBy: s.judgingVerifiedBy });
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally { setBusy(false); }
  }

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        {judging.status === "COMPLETED" && (
          <Button size="sm" onClick={() => setConfirm("verify")}
            className="h-6 px-2 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
            <ShieldCheck className="h-3 w-3" /> Verify
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setConfirm("reopen")}
          className="h-6 px-2 text-[11px] gap-1 border-zinc-300 text-zinc-600">
          <LockOpen className="h-3 w-3" /> Buka Semula
        </Button>
      </span>

      <Dialog open={confirm !== null} onOpenChange={open => { if (!open) { setConfirm(null); setError(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {confirm === "verify" ? "Sahkan keputusan (VERIFIED)?" : "Buka semula penghakiman?"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-2 space-y-2 text-xs text-zinc-600">
            <p className="font-medium text-zinc-800">
              <span className="font-mono text-zinc-400 mr-1">{code}</span>{name}
            </p>
            {confirm === "verify" && <p>Keputusan pertandingan ini akan ditanda <b>VERIFIED</b>. Borang penghakiman kekal dikunci.</p>}
            {confirm === "reopen" && (
              <p>Borang penghakiman akan dibuka semula dan hakim boleh mengubah markah.
                {judging.status === "VERIFIED" && " Status VERIFIED akan dibatalkan."}</p>
            )}
            {error && <p className="text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button>
            <Button onClick={() => confirm && run(confirm)} disabled={busy}
              className={cn("gap-1.5 text-white", confirm === "verify" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-700 hover:bg-zinc-800")}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirm === "verify" ? "Verify" : "Buka Semula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
