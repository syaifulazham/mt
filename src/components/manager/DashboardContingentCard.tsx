"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Clock, LogOut, AlertCircle, Loader2, UserCheck } from "lucide-react";

type Peer = { id: string; name: string; email: string };

type ContingentLink = {
  contingentId: string;
  role: string;
  linkStatus: string;
  name: string;
  contingentType: string;
  contingentStatus: string;
  participantCount: number;
  teamCount: number;
};

// ── Leave / Handover dialog ───────────────────────────────────────────────────

function LeaveDialog({
  link,
  onClose,
  onLeft,
}: {
  link: ContingentLink;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [step, setStep] = useState<"confirm" | "handover" | "loading" | "error">("confirm");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLeave(newOwnerId?: string) {
    setStep("loading");
    const res = await fetch(`/api/v2/manager/contingents/${link.contingentId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOwnerId ? { newOwnerId } : {}),
    });
    const j = await res.json();

    if (res.ok) {
      onLeft();
      return;
    }

    if (j.error === "HANDOVER_REQUIRED") {
      setPeers(j.peers ?? []);
      setSelectedPeer(j.peers?.[0]?.id ?? "");
      setStep("handover");
      return;
    }

    if (j.error === "SOLE_OWNER") {
      setErrorMsg(j.message ?? "You are the only manager. Invite another manager before leaving.");
      setStep("error");
      return;
    }

    setErrorMsg(j.message ?? "Failed to leave. Please try again.");
    setStep("error");
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogOut className="h-4 w-4 text-red-500" />
                Leave contingent?
              </DialogTitle>
              <DialogDescription>
                You will lose access to <strong>{link.name}</strong>. You can request to join again later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleLeave()}>Leave</Button>
            </DialogFooter>
          </>
        )}

        {step === "handover" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-500" />
                Choose new primary manager
              </DialogTitle>
              <DialogDescription>
                As the primary manager, you must hand over the role before leaving.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 my-2">
              {peers.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                    selectedPeer === p.id ? "border-blue-500 bg-blue-50" : "border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="peer"
                    value={p.id}
                    checked={selectedPeer === p.id}
                    onChange={() => setSelectedPeer(p.id)}
                    className="sr-only"
                  />
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{p.name}</p>
                    <p className="text-xs text-zinc-400 truncate">{p.email}</p>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={!selectedPeer}
                onClick={() => handleLeave(selectedPeer)}
              >
                Handover &amp; Leave
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            <p className="text-sm text-zinc-500">Processing…</p>
          </div>
        )}

        {step === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Cannot leave
              </DialogTitle>
              <DialogDescription>{errorMsg}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function DashboardContingentCard({ link }: { link: ContingentLink }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const isPending = link.linkStatus === "PENDING";

  function handleLeft() {
    setLeaving(false);
    router.refresh();
  }

  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${isPending ? "border-amber-300" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{link.name}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className="text-xs">{link.contingentType}</Badge>
            <Badge
              variant={link.contingentStatus === "ACTIVE" ? "success" : "secondary"}
              className="text-xs"
            >
              {link.contingentStatus}
            </Badge>
            <span className="text-xs text-zinc-400">
              You are {link.role}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 shrink-0">
          {isPending ? (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-700 text-xs font-medium">
              <Clock className="h-3.5 w-3.5" />
              Pending Approval
            </div>
          ) : (
            <div className="text-right text-xs text-zinc-400 space-y-1">
              <p><span className="font-semibold text-zinc-700">{link.participantCount}</span> participants</p>
              <p><span className="font-semibold text-zinc-700">{link.teamCount}</span> teams</p>
            </div>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-zinc-400 hover:text-red-600 hover:bg-red-50"
            onClick={() => setLeaving(true)}
            title="Leave contingent"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isPending && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed">
          Your request to join this contingent is awaiting approval from the primary manager. You will be able to manage this contingent once approved.
        </p>
      )}

      {leaving && (
        <LeaveDialog link={link} onClose={() => setLeaving(false)} onLeft={handleLeft} />
      )}
    </div>
  );
}
