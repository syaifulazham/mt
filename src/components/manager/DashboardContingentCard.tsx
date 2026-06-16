"use client";

import { useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Clock, LogOut, AlertCircle, Loader2, UserCheck, MapPin, Users, Dumbbell, Swords, ChevronRight } from "lucide-react";

type Peer = { id: string; name: string; email: string };

type Locality = "BANDAR" | "SUB_BANDAR" | "LUAR_BANDAR" | "PEDALAMAN_1" | "PEDALAMAN_2" | "PEDALAMAN_3";

type ContingentLink = {
  contingentId: string;
  role: string;
  linkStatus: string;
  name: string;
  contingentType: string;
  contingentStatus: string;
  locality: string | null;
  participantCount: number;
  teamCount: number;
  trainerCount: number;
  zoneName: string | null;
  stateName: string | null;
  stateFlagUrl: string | null;
};

// ── Leave / Handover dialog ───────────────────────────────────────────────────

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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
  const [confirmCode] = useState(genCode);
  const [codeInput, setCodeInput] = useState("");

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
            <div className="space-y-3 py-1">
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Type this code to confirm</p>
                <p className="text-2xl font-mono font-bold tracking-[0.3em] text-red-600">{confirmCode}</p>
              </div>
              <input
                type="text"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono tracking-widest text-center uppercase"
                placeholder="_ _ _ _ _"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                maxLength={5}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={codeInput !== confirmCode}
                onClick={() => handleLeave()}
              >
                Leave
              </Button>
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
                    selectedPeer === p.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
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

// ── Locality reminder ─────────────────────────────────────────────────────────

function LocalityReminder({ contingentId, onSaved }: { contingentId: string; onSaved: () => void }) {
  const t = useTranslations("dashboard.card");
  const [value, setValue] = useState<Locality | "">("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    await fetch(`/api/v2/manager/contingents/${contingentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locality: value }),
    });
    setSaving(false);
    onSaved();
  }

  const LABELS: Record<Locality, string> = {
    BANDAR:      "Bandar",
    SUB_BANDAR:  "Sub-Bandar",
    LUAR_BANDAR: "Luar Bandar",
    PEDALAMAN_1: "Pedalaman 1",
    PEDALAMAN_2: "Pedalaman 2",
    PEDALAMAN_3: "Pedalaman 3",
  };

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("localityTitle")}</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">{t("localityDesc")}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as Locality | "")}
          className="flex-1 h-8 rounded-md border border-amber-300 bg-white dark:bg-zinc-900 dark:border-amber-700 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
        >
          <option value="">— {t("localityPlaceholder")} —</option>
          {(Object.entries(LABELS) as [Locality, string][]).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <Button
          size="sm"
          className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          disabled={!value || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("localitySave")}
        </Button>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function DashboardContingentCard({ link }: { link: ContingentLink }) {
  const t = useTranslations("dashboard.card");
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const isPending = link.linkStatus === "PENDING";
  const roleLabel = link.role === "OWNER" ? t("roleMain") : t("roleOther");

  function handleLeft() {
    setLeaving(false);
    router.refresh();
  }

  return (
    <div className={`rounded-xl border bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-sm overflow-hidden ${isPending ? "border-amber-300 dark:border-amber-700" : ""}`}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-base leading-tight truncate dark:text-zinc-100">{link.name}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className="text-[11px] px-1.5 py-0">{link.contingentType}</Badge>
            <span className="text-xs text-zinc-400">{roleLabel}</span>
            {isPending && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-700">
                <Clock className="h-3 w-3" /> {t("pending")}
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0"
          onClick={() => setLeaving(true)}
          title="Leave contingent"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Info + Stats row ─────────────────────────────────────────── */}
      {!isPending && (
        <div className="mx-5 mb-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">

          {/* State / Zone card */}
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5">
            {link.stateFlagUrl
              ? <img src={link.stateFlagUrl} alt={link.stateName ?? ""} className="h-8 w-12 object-cover rounded border border-zinc-200 dark:border-zinc-700 shrink-0" />
              : <div className="h-8 w-12 rounded border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-700 shrink-0" />
            }
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight truncate dark:text-zinc-200">{link.stateName ?? t("statPlaceholder")}</p>
              {link.zoneName && <p className="text-[11px] text-zinc-400 truncate">{link.zoneName}</p>}
            </div>
          </div>

          {/* Stats card */}
          <div className="flex items-stretch divide-x divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden w-full sm:w-auto">
            {[
              { icon: Users,    value: link.participantCount, label: t("statParticipants") },
              { icon: Dumbbell, value: link.trainerCount,     label: t("statTrainers") },
              { icon: Swords,   value: link.teamCount,        label: t("statTeams") },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex flex-col items-center justify-center px-4 py-2.5 flex-1 sm:flex-initial sm:min-w-[64px]">
                <Icon className="h-3.5 w-3.5 text-zinc-400 mb-1" strokeWidth={1.8} />
                <p className="text-lg font-bold leading-none dark:text-zinc-100">{value}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick links ──────────────────────────────────────────────── */}
      {!isPending && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 divide-x divide-zinc-100 dark:divide-zinc-800 grid grid-cols-3">
          {[
            { href: "/manager/participants", label: t("linkParticipants") },
            { href: "/manager/teams",        label: t("linkTeams") },
            { href: "/manager/trainers",     label: t("linkTrainers") },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-center gap-1 py-2.5 text-xs text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              {label} <ChevronRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}

      {/* ── Pending message ──────────────────────────────────────────── */}
      {isPending && (
        <p className="mx-5 mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400">
          {t("pendingDesc")}
        </p>
      )}

      {/* ── Locality reminder ────────────────────────────────────────── */}
      {!isPending && !link.locality && link.role !== "VIEWER" && (
        <div className="mx-5 mb-4">
          <LocalityReminder contingentId={link.contingentId} onSaved={() => router.refresh()} />
        </div>
      )}

      {leaving && (
        <LeaveDialog link={link} onClose={() => setLeaving(false)} onLeft={handleLeft} />
      )}
    </div>
  );
}
