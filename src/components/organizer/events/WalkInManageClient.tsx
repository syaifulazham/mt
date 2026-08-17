"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Users, CheckCircle2, XCircle, Clock, QrCode, X, Loader2, Globe2, Link2, Copy, Eye, EyeOff, Gavel, ChevronDown, Plus, Gamepad2, Lock, Unlock, RefreshCw, KeyRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type JudgingTemplateSummary = {
  id: string; name: string; code: string; description: string | null;
  _count: { criterions: number };
};

type WalkInEndpointItem = {
  id: string; routeSlug: string; passcode: string; label: string | null; active: boolean; createdAt: string | Date;
};

type WalkInCompSummary = {
  id: string; competitionId: string; picName: string | null; maxSlots: number;
  publishToPortal: boolean;
  useViblockarena: boolean; useDronearena: boolean; useVibeblocks: boolean;
  viblockChallengeId: string | null; viblockChallengeLocked: boolean; judgingTemplatesLocked: boolean;
  competition: { id: string; code: string; name: string };
  _count: { registrations: number };
  endpoints: WalkInEndpointItem[];
};

type ViblockChallenge = {
  id: string; name: string; description: string | null; challenge_mode: string; status: string; order_index: number;
};

type VibeBlocksEvent = {
  event_id: string; challenge_id: string; name: string;
  status: "draft" | "open" | "closed";
  starts_at: string; ends_at: string; run_duration_sec: number;
};

type EventSummary = {
  id: string; name: string; slug: string;
  walkInCompetitions: WalkInCompSummary[];
  walkInEndpoints: WalkInEndpointItem[];
};

type Registration = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  method: "COUNTER" | "PORTAL";
  registeredBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  viblockToken: string | null;
  participant: { id: string; name: string; ic: string | null; gender: string; eduLevel: string; classGrade: string | null };
  contingent:  { id: string; name: string; shortName: string | null };
};

type Stats = { PENDING?: number; CONFIRMED?: number; REJECTED?: number; CANCELLED?: number };

const STATUS_COLOR: Record<string, string> = {
  PENDING:   "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-green-50 text-green-700 border-green-200",
  REJECTED:  "bg-red-50 text-red-600 border-red-200",
  CANCELLED: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

function QrModal({ regId, participantName, competitionName, onClose }: {
  regId: string; participantName: string; competitionName: string; onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="w-full flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-800 truncate">{participantName}</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-zinc-500 text-center">{competitionName}</p>
        <QRCodeSVG value={regId} size={200} level="M" />
        <p className="text-[10px] text-zinc-400 font-mono break-all text-center">{regId}</p>
        <Button size="sm" variant="outline" onClick={onClose} className="w-full">Tutup</Button>
      </div>
    </div>,
    document.body,
  );
}

export function WalkInManageClient({ event, canWrite }: { event: EventSummary; canWrite: boolean }) {
  const [wicList,       setWicList]       = useState<WalkInCompSummary[]>(event.walkInCompetitions);
  const [selectedWic,   setSelectedWic]   = useState<WalkInCompSummary | null>(
    event.walkInCompetitions[0] ?? null,
  );
  // null = general endpoint panel is active
  const [showGeneral,   setShowGeneral]   = useState(false);
  const [generalEps,    setGeneralEps]    = useState<WalkInEndpointItem[]>(event.walkInEndpoints);

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats,         setStats]         = useState<Stats>({});
  const [loading,       setLoading]       = useState(false);
  const [statusFilter,  setStatusFilter]  = useState<string>("ALL");
  const [qrTarget,      setQrTarget]      = useState<Registration | null>(null);
  const [updating,      setUpdating]      = useState<string | null>(null);

  const [addingEndpoint,    setAddingEndpoint]    = useState(false);
  const [addingGeneralEp,   setAddingGeneralEp]   = useState(false);
  const [deletingEpId,      setDeletingEpId]      = useState<string | null>(null);
  const [copyMsg,           setCopyMsg]           = useState<string | null>(null);
  const [revealedEpIds,     setRevealedEpIds]     = useState<Set<string>>(new Set());
  const [togglingPortal,    setTogglingPortal]    = useState(false);

  // ── Judging templates ──
  const [assignedTemplates,   setAssignedTemplates]   = useState<JudgingTemplateSummary[]>([]);
  const [allTemplates,        setAllTemplates]        = useState<JudgingTemplateSummary[]>([]);
  const [templatesLoading,    setTemplatesLoading]    = useState(false);
  const [templatePickerOpen,  setTemplatePickerOpen]  = useState(false);
  const [assigningTemplateId, setAssigningTemplateId] = useState<string | null>(null);
  const [removingTemplateId,  setRemovingTemplateId]  = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ template: JudgingTemplateSummary; code: string } | null>(null);
  const [removeConfirmInput, setRemoveConfirmInput] = useState("");

  // ── Viblock challenges ──
  const [viblockChallenges,       setViblockChallenges]       = useState<ViblockChallenge[]>([]);
  const [viblockChallengesLoading, setViblockChallengesLoading] = useState(false);
  const [savingChallenge,          setSavingChallenge]          = useState(false);

  // ── Drone challenges ──
  const [droneChallenges,        setDroneChallenges]        = useState<{ id: string; name: string; status: string }[]>([]);
  const [droneChallengesLoading, setDroneChallengesLoading] = useState(false);
  const [unlockConfirm,            setUnlockConfirm]            = useState<{ code: string; target: "viblock" | "judging" } | null>(null);
  const [unlockInput,              setUnlockInput]              = useState("");
  const [togglingLock,             setTogglingLock]             = useState(false);
  const [vibeBlocksEvents,         setVibeBlocksEvents]         = useState<VibeBlocksEvent[]>([]);
  const [vibeBlocksEventsLoading,  setVibeBlocksEventsLoading]  = useState(false);
  const [vibeBlocksActionId,       setVibeBlocksActionId]       = useState<string | null>(null);

  const loadRegistrations = useCallback(async (wicId: string, filter: string) => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (filter !== "ALL") sp.set("status", filter);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${wicId}/registrations?${sp}`);
    const j   = await res.json();
    setRegistrations(j.data ?? []);
    setStats(j.stats ?? {});
    setLoading(false);
  }, [event.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selectedWic) loadRegistrations(selectedWic.id, statusFilter); }, [selectedWic, statusFilter, loadRegistrations]);

  // Auto-refresh registrations every 30s
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (!selectedWic) return;
    refreshRef.current = setInterval(() => {
      loadRegistrations(selectedWic.id, statusFilter);
    }, 30_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [selectedWic, statusFilter, loadRegistrations]);

  const [viblockActionId, setViblockActionId] = useState<string | null>(null);
  const [droneActionId,   setDroneActionId]   = useState<string | null>(null);

  async function viblockRegisterParticipant(regId: string) {
    if (!selectedWic) return;
    setViblockActionId(regId);
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/viblock`, { method: "POST" });
      const j = await res.json();
      if (res.ok) {
        setRegistrations(prev => prev.map(r => r.id === regId ? { ...r, viblockToken: j.token } : r));
      }
    } finally {
      setViblockActionId(null);
    }
  }

  async function viblockRenewParticipantToken(regId: string) {
    if (!selectedWic) return;
    setViblockActionId(regId);
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/viblock`, { method: "PATCH" });
      const j = await res.json();
      if (res.ok) {
        setRegistrations(prev => prev.map(r => r.id === regId ? { ...r, viblockToken: j.token } : r));
      }
    } finally {
      setViblockActionId(null);
    }
  }

  const [viblockTokenView, setViblockTokenView] = useState<{ regId: string; token: string } | null>(null);
  const [viblockTokenInfo, setViblockTokenInfo] = useState<{ token: string; name: string; is_used: boolean; used_at: string | null; created_at: string } | null>(null);
  const [viblockTokenLoading, setViblockTokenLoading] = useState(false);

  async function viblockViewToken(regId: string, token: string) {
    if (!selectedWic) return;
    setViblockTokenView({ regId, token });
    setViblockTokenInfo(null);
    setViblockTokenLoading(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/viblock`);
      if (res.ok) {
        const j = await res.json();
        setViblockTokenInfo(j);
      }
    } finally {
      setViblockTokenLoading(false);
    }
  }

  async function vibeBlocksRegisterParticipant(regId: string) {
    if (!selectedWic) return;
    setVibeBlocksActionId(regId);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/vibeblocks`,
        { method: "POST" },
      );
      const j = await res.json();
      if (res.ok)
        setRegistrations(prev => prev.map(r =>
          r.id === regId ? { ...r, viblockToken: `${j.entryToken}:${j.entryId}` } : r,
        ));
    } finally {
      setVibeBlocksActionId(null);
    }
  }

  async function vibeBlocksRenewParticipantToken(regId: string) {
    if (!selectedWic) return;
    setVibeBlocksActionId(regId);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/vibeblocks`,
        { method: "PATCH" },
      );
      const j = await res.json();
      if (res.ok)
        setRegistrations(prev => prev.map(r =>
          r.id === regId ? { ...r, viblockToken: `${j.entryToken}:${j.entryId}` } : r,
        ));
    } finally {
      setVibeBlocksActionId(null);
    }
  }

  async function droneRegisterParticipant(regId: string) {
    if (!selectedWic) return;
    setDroneActionId(regId);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/drone`,
        { method: "POST" },
      );
      const j = await res.json();
      if (res.ok) {
        const stored = (j.competitionToken && j.endpointId)
          ? `${j.userid}|${j.password}|${j.accessToken}|${j.competitionToken}|${j.endpointId}`
          : `${j.userid}|${j.password}|${j.accessToken}`;
        setRegistrations(prev => prev.map(r =>
          r.id === regId ? { ...r, viblockToken: stored } : r,
        ));
      }
    } finally {
      setDroneActionId(null);
    }
  }

  async function droneRefreshToken(regId: string) {
    if (!selectedWic) return;
    setDroneActionId(regId);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/drone`,
        { method: "PATCH" },
      );
      const j = await res.json();
      if (res.ok)
        setRegistrations(prev => prev.map(r => {
          if (r.id !== regId || !r.viblockToken) return r;
          const stored = (j.competitionToken && j.endpointId)
            ? `${j.userid}|${j.password}|${j.accessToken}|${j.competitionToken}|${j.endpointId}`
            : `${j.userid}|${j.password}|${j.accessToken}`;
          return { ...r, viblockToken: stored };
        }));
    } finally {
      setDroneActionId(null);
    }
  }

  async function droneNewToken(regId: string) {
    if (!selectedWic) return;
    setDroneActionId(regId);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/registrations/${regId}/drone?force=true`,
        { method: "POST" },
      );
      const j = await res.json();
      if (res.ok) {
        const stored = (j.competitionToken && j.endpointId)
          ? `${j.userid}|${j.password}|${j.accessToken}|${j.competitionToken}|${j.endpointId}`
          : `${j.userid}|${j.password}|${j.accessToken}`;
        setRegistrations(prev => prev.map(r =>
          r.id === regId ? { ...r, viblockToken: stored } : r,
        ));
      }
    } finally {
      setDroneActionId(null);
    }
  }

  // Load viblock challenges when selected competition has viblock enabled
  useEffect(() => {
    const id = setTimeout(() => {
      if (!selectedWic?.useViblockarena) { setViblockChallenges([]); return; }
      setViblockChallengesLoading(true);
      fetch(`/api/v2/organizer/events/${event.id}/walkin/viblock-challenges`)
        .then(r => r.json())
        .then(j => setViblockChallenges(j.challenges ?? []))
        .catch(() => setViblockChallenges([]))
        .finally(() => setViblockChallengesLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [selectedWic?.useViblockarena, event.id]);

  // Load VibeBlocks events when selected competition has VibeBlocks enabled
  useEffect(() => {
    const id = setTimeout(() => {
      if (!selectedWic?.useVibeblocks) { setVibeBlocksEvents([]); return; }
      setVibeBlocksEventsLoading(true);
      fetch(`/api/v2/organizer/events/${event.id}/walkin/vibeblocks-events`)
        .then(r => r.json())
        .then(j => setVibeBlocksEvents(j.events ?? []))
        .catch(() => setVibeBlocksEvents([]))
        .finally(() => setVibeBlocksEventsLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [selectedWic?.useVibeblocks, event.id]);

  // Load Drone challenges when selected competition has Drone enabled
  useEffect(() => {
    const id = setTimeout(() => {
      if (!selectedWic?.useDronearena) { setDroneChallenges([]); return; }
      setDroneChallengesLoading(true);
      fetch(`/api/v2/organizer/events/${event.id}/walkin/drone-challenges`)
        .then(r => r.json())
        .then(j => setDroneChallenges(j.challenges ?? []))
        .catch(() => setDroneChallenges([]))
        .finally(() => setDroneChallengesLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [selectedWic?.useDronearena, event.id]);

  async function setViblockChallenge(challengeId: string | null) {
    if (!selectedWic) return;
    setSavingChallenge(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viblockChallengeId: challengeId }),
    });
    if (res.ok) updateWic(selectedWic.id, { viblockChallengeId: challengeId });
    setSavingChallenge(false);
  }

  async function setVibeBlocksEvent(eventId: string | null) {
    if (!selectedWic) return;
    setSavingChallenge(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viblockChallengeId: eventId }),
    });
    if (res.ok) updateWic(selectedWic.id, { viblockChallengeId: eventId });
    setSavingChallenge(false);
  }

  async function setDroneChallenge(challengeId: string | null) {
    if (!selectedWic) return;
    setSavingChallenge(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viblockChallengeId: challengeId }),
    });
    if (res.ok) updateWic(selectedWic.id, { viblockChallengeId: challengeId });
    setSavingChallenge(false);
  }

  async function lockChallenge() {
    if (!selectedWic) return;
    setTogglingLock(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viblockChallengeLocked: true }),
    });
    if (res.ok) updateWic(selectedWic.id, { viblockChallengeLocked: true });
    setTogglingLock(false);
  }

  function requestUnlock(target: "viblock" | "judging") {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setUnlockConfirm({ code, target });
    setUnlockInput("");
  }

  async function executeUnlock() {
    if (!selectedWic || !unlockConfirm) return;
    setTogglingLock(true);
    const field = unlockConfirm.target === "viblock" ? "viblockChallengeLocked" : "judgingTemplatesLocked";
    setUnlockConfirm(null);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: false }),
    });
    if (res.ok) updateWic(selectedWic.id, { [field]: false } as Partial<WalkInCompSummary>);
    setTogglingLock(false);
  }

  async function lockJudgingTemplates() {
    if (!selectedWic) return;
    setTogglingLock(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgingTemplatesLocked: true }),
    });
    if (res.ok) updateWic(selectedWic.id, { judgingTemplatesLocked: true });
    setTogglingLock(false);
  }

  // Load judging templates when a walk-in competition is selected
  // Deferred via setTimeout so setState calls don't run synchronously
  // within the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!selectedWic) return;
    const id = setTimeout(() => {
      setAssignedTemplates([]);
      setAllTemplates([]);
      setTemplatesLoading(true);
      Promise.all([
        fetch(`/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/judging-templates`),
        fetch("/api/v2/organizer/judging/templates"),
      ]).then(async ([aRes, allRes]) => {
        const [aJson, allJson] = await Promise.all([aRes.json(), allRes.json()]);
        setAssignedTemplates(aJson.data ?? []);
        setAllTemplates(allJson.templates ?? []);
      }).finally(() => setTemplatesLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [selectedWic, event.id]);

  // Close template picker when clicking outside
  useEffect(() => {
    if (!templatePickerOpen) return;
    function handler() { setTemplatePickerOpen(false); }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [templatePickerOpen]);

  async function assignTemplate(templateId: string) {
    if (!selectedWic) return;
    setAssigningTemplateId(templateId);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/judging-templates`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ judgingTemplateId: templateId }) }
      );
      if (res.ok) {
        const tpl = allTemplates.find(t => t.id === templateId);
        if (tpl) setAssignedTemplates(prev => [...prev, tpl]);
        setTemplatePickerOpen(false);
      }
    } finally {
      setAssigningTemplateId(null);
    }
  }

  function confirmRemove(template: JudgingTemplateSummary) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setRemoveConfirm({ template, code });
    setRemoveConfirmInput("");
  }

  async function executeRemove() {
    if (!selectedWic || !removeConfirm) return;
    setRemovingTemplateId(removeConfirm.template.id);
    setRemoveConfirm(null);
    try {
      await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${selectedWic.id}/judging-templates/${removeConfirm.template.id}`,
        { method: "DELETE" }
      );
      setAssignedTemplates(prev => prev.filter(t => t.id !== removeConfirm.template.id));
    } finally {
      setRemovingTemplateId(null);
    }
  }

  async function updateStatus(reg: Registration, status: string) {
    setUpdating(reg.id);
    const res = await fetch(
      `/api/v2/organizer/events/${event.id}/walkin/${selectedWic!.id}/registrations/${reg.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) },
    );
    if (res.ok) {
      setRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, status: status as Registration["status"] } : r));
      setStats(prev => {
        const s = { ...prev };
        s[reg.status] = (s[reg.status] ?? 1) - 1;
        s[status as keyof Stats] = (s[status as keyof Stats] ?? 0) + 1;
        return s;
      });
    }
    setUpdating(null);
  }

  function updateWic(id: string, patch: Partial<WalkInCompSummary>) {
    setWicList(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
    setSelectedWic(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  }

  async function togglePortal(wic: WalkInCompSummary) {
    setTogglingPortal(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${wic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishToPortal: !wic.publishToPortal }),
    });
    if (res.ok) updateWic(wic.id, { publishToPortal: !wic.publishToPortal });
    setTogglingPortal(false);
  }

  async function addEndpoint(wic: WalkInCompSummary) {
    setAddingEndpoint(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${wic.id}/endpoint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const j   = await res.json();
    if (res.ok) updateWic(wic.id, { endpoints: [...wic.endpoints, j.data] });
    setAddingEndpoint(false);
  }

  async function deleteEndpoint(wic: WalkInCompSummary, endpointId: string) {
    setDeletingEpId(endpointId);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/${wic.id}/endpoint/${endpointId}`, { method: "DELETE" });
    if (res.ok) updateWic(wic.id, { endpoints: wic.endpoints.filter(e => e.id !== endpointId) });
    setDeletingEpId(null);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopyMsg("Disalin!"); setTimeout(() => setCopyMsg(null), 2000); });
  }

  async function addGeneralEndpoint() {
    setAddingGeneralEp(true);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/endpoint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const j   = await res.json();
    if (res.ok) setGeneralEps(prev => [...prev, j.data]);
    setAddingGeneralEp(false);
  }

  async function deleteGeneralEndpoint(endpointId: string) {
    setDeletingEpId(endpointId);
    const res = await fetch(`/api/v2/organizer/events/${event.id}/walkin/endpoint/${endpointId}`, { method: "DELETE" });
    if (res.ok) setGeneralEps(prev => prev.filter(e => e.id !== endpointId));
    setDeletingEpId(null);
  }

  const statusTabs = ["ALL", "PENDING", "CONFIRMED", "REJECTED"];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/organizer/events/${event.slug}/manage`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Walk-in Registration</h1>
          <p className="text-sm text-zinc-500">{event.name}</p>
        </div>
      </div>

      {wicList.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center text-zinc-400">
          <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Tiada pertandingan walk-in ditetapkan untuk acara ini.</p>
          <p className="text-xs mt-1">Tambah pertandingan walk-in pada halaman tetapan acara terlebih dahulu.</p>
        </div>
      ) : (
        <div className="flex gap-5">
          {/* Left: competition list */}
          <div className="w-56 shrink-0 space-y-1.5">
            {/* General endpoint entry */}
            {canWrite && (
              <button type="button"
                onClick={() => { setShowGeneral(true); setSelectedWic(null); }}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  showGeneral
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <p className="text-sm font-medium text-zinc-800 truncate">Semua Pertandingan</p>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">{generalEps.length} endpoint kaunter</p>
              </button>
            )}
            {wicList.map(wic => (
              <button key={wic.id} type="button"
                onClick={() => { setSelectedWic(wic); setShowGeneral(false); }}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  !showGeneral && selectedWic?.id === wic.id
                    ? "border-teal-300 bg-teal-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                <p className="text-sm font-medium text-zinc-800 truncate">{wic.competition.name}</p>
                <p className="text-[11px] text-zinc-400 font-mono">{wic.competition.code}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{wic._count.registrations} daftar</p>
              </button>
            ))}
          </div>

          {/* Right: registrations / general endpoint management */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* General endpoint panel */}
            {showGeneral && canWrite && (
              <div className="rounded-xl border bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe2 className="h-4 w-4 text-indigo-500" />
                    <p className="text-sm font-semibold text-zinc-800">Endpoint Kaunter Umum</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                    onClick={addGeneralEndpoint} disabled={addingGeneralEp}>
                    {addingGeneralEp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Tambah
                  </Button>
                </div>
                <p className="text-xs text-zinc-400">Endpoint ini boleh mendaftarkan peserta ke mana-mana pertandingan walk-in dalam acara ini.</p>
                {generalEps.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">Tiada endpoint aktif. Klik Tambah untuk jana endpoint kaunter umum.</p>
                ) : (
                  <>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-zinc-500">Kaunter</th>
                            <th className="px-3 py-2 text-left font-medium text-zinc-500">URL</th>
                            <th className="px-3 py-2 text-left font-medium text-zinc-500">Passcode</th>
                            <th className="px-3 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {generalEps.map(ep => (
                            <tr key={ep.id} className="hover:bg-zinc-50/60">
                              <td className="px-3 py-2 font-medium text-zinc-800">{ep.label ?? ep.routeSlug}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <code className="text-indigo-700 truncate max-w-[160px]">/walkin/{ep.routeSlug}</code>
                                  <button type="button"
                                    onClick={() => copyToClipboard(`${window.location.origin}/walkin/${ep.routeSlug}`)}
                                    className="text-zinc-400 hover:text-indigo-600 transition-colors shrink-0" title="Salin URL">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <code className="font-bold tracking-widest text-zinc-800">
                                    {revealedEpIds.has(ep.id) ? ep.passcode : "••••••"}
                                  </code>
                                  <button type="button"
                                    onClick={() => setRevealedEpIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(ep.id)) next.delete(ep.id); else next.add(ep.id);
                                      return next;
                                    })}
                                    className="text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                                    title={revealedEpIds.has(ep.id) ? "Sembunyikan" : "Tunjukkan"}>
                                    {revealedEpIds.has(ep.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  </button>
                                  {revealedEpIds.has(ep.id) && (
                                    <button type="button"
                                      onClick={() => copyToClipboard(ep.passcode)}
                                      className="text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                                      title="Salin passcode">
                                      <Copy className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <button type="button"
                                  onClick={() => deleteGeneralEndpoint(ep.id)}
                                  disabled={deletingEpId === ep.id}
                                  className="text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-40">
                                  {deletingEpId === ep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {copyMsg && <p className="text-[10px] text-emerald-600">{copyMsg}</p>}
                  </>
                )}
              </div>
            )}

            {selectedWic && (
              <>
                {/* Configuration card */}
                {canWrite && (
                  <div className="rounded-xl border bg-white p-4 space-y-4">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Konfigurasi</p>

                    {/* Portal publish toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm text-zinc-700">Siarkan ke portal peserta</span>
                        {selectedWic.publishToPortal && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Aktif</span>
                        )}
                      </div>
                      <button type="button" role="switch" aria-checked={selectedWic.publishToPortal}
                        disabled={togglingPortal}
                        onClick={() => togglePortal(selectedWic)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${selectedWic.publishToPortal ? "bg-emerald-500" : "bg-zinc-200"}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${selectedWic.publishToPortal ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>

                    {/* Counter endpoints */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5" /> Endpoint kaunter
                        </p>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                          onClick={() => addEndpoint(selectedWic)} disabled={addingEndpoint}>
                          {addingEndpoint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                          Tambah
                        </Button>
                      </div>
                      {selectedWic.endpoints.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic">Tiada endpoint aktif.</p>
                      ) : (
                        <>
                          <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-zinc-50 border-b">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-zinc-500">Kaunter</th>
                                  <th className="px-3 py-2 text-left font-medium text-zinc-500">URL</th>
                                  <th className="px-3 py-2 text-left font-medium text-zinc-500">Passcode</th>
                                  <th className="px-3 py-2 w-8" />
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {selectedWic.endpoints.map(ep => (
                                  <tr key={ep.id} className="hover:bg-zinc-50/60">
                                    <td className="px-3 py-2 font-medium text-zinc-800">{ep.label ?? ep.routeSlug}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1.5">
                                        <code className="text-indigo-700 truncate max-w-[160px]">/walkin/{ep.routeSlug}</code>
                                        <button type="button"
                                          onClick={() => copyToClipboard(`${window.location.origin}/walkin/${ep.routeSlug}`)}
                                          className="text-zinc-400 hover:text-indigo-600 transition-colors shrink-0" title="Salin URL">
                                          <Copy className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1.5">
                                        <code className="font-bold tracking-widest text-zinc-800">
                                          {revealedEpIds.has(ep.id) ? ep.passcode : "••••••"}
                                        </code>
                                        <button type="button"
                                          onClick={() => setRevealedEpIds(prev => {
                                            const next = new Set(prev);
                                            next.has(ep.id) ? next.delete(ep.id) : next.add(ep.id);
                                            return next;
                                          })}
                                          className="text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                                          title={revealedEpIds.has(ep.id) ? "Sembunyikan" : "Tunjukkan"}>
                                          {revealedEpIds.has(ep.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                        {revealedEpIds.has(ep.id) && (
                                          <button type="button"
                                            onClick={() => copyToClipboard(ep.passcode)}
                                            className="text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                                            title="Salin passcode">
                                            <Copy className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <button type="button"
                                        onClick={() => deleteEndpoint(selectedWic, ep.id)}
                                        disabled={deletingEpId === ep.id}
                                        className="text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-40">
                                        {deletingEpId === ep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {copyMsg && <p className="text-[10px] text-emerald-600">{copyMsg}</p>}
                        </>
                      )}
                    </div>

                    {/* Viblock Arena Challenge */}
                    {selectedWic.useViblockarena && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                            <Gamepad2 className="h-3.5 w-3.5" /> Viblock Arena Challenge
                          </p>
                          {selectedWic.viblockChallengeId && (
                            <button
                              type="button"
                              onClick={selectedWic.viblockChallengeLocked ? () => requestUnlock("viblock") : lockChallenge}
                              disabled={togglingLock}
                              className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                                selectedWic.viblockChallengeLocked
                                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                              }`}
                            >
                              {selectedWic.viblockChallengeLocked
                                ? <><Lock className="h-3 w-3" /> Locked</>
                                : <><Unlock className="h-3 w-3" /> Lock</>}
                            </button>
                          )}
                        </div>
                        {viblockChallengesLoading ? (
                          <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading challenges…
                          </div>
                        ) : viblockChallenges.length === 0 ? (
                          <p className="text-xs text-zinc-400 italic py-1">No challenges available from Viblock Arena.</p>
                        ) : (
                          <div className="space-y-1.5">
                            <select
                              value={selectedWic.viblockChallengeId ?? ""}
                              onChange={(e) => setViblockChallenge(e.target.value || null)}
                              disabled={savingChallenge || selectedWic.viblockChallengeLocked}
                              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 disabled:opacity-60 ${
                                selectedWic.viblockChallengeLocked
                                  ? "border-amber-200 bg-amber-50 cursor-not-allowed"
                                  : "border-zinc-200 bg-white"
                              }`}
                            >
                              <option value="">— Tiada challenge dipilih —</option>
                              {viblockChallenges.map(ch => (
                                <option key={ch.id} value={ch.id}>
                                  {ch.name} ({ch.challenge_mode})
                                </option>
                              ))}
                            </select>
                            {selectedWic.viblockChallengeId && (
                              <p className="text-[10px] text-violet-600">
                                Challenge ID: <code className="font-mono">{selectedWic.viblockChallengeId}</code>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* VibeBlocks Event */}
                    {selectedWic.useVibeblocks && (
                      <div className="space-y-2">
                        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <Gamepad2 className="h-3.5 w-3.5" /> VibeBlocks Competition Event
                        </p>
                        {vibeBlocksEventsLoading ? (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading events…
                          </div>
                        ) : vibeBlocksEvents.length === 0 ? (
                          <p className="text-xs text-zinc-400 italic">No events available from VibeBlocks.</p>
                        ) : (
                          <div className="space-y-1.5">
                            <select
                              value={selectedWic.viblockChallengeId ?? ""}
                              onChange={(e) => setVibeBlocksEvent(e.target.value || null)}
                              disabled={savingChallenge || selectedWic.viblockChallengeLocked}
                              className="w-full rounded-md border border-input bg-background text-xs h-7 px-2 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                            >
                              <option value="">— Tiada event dipilih —</option>
                              {vibeBlocksEvents.map(ev => (
                                <option key={ev.event_id} value={ev.event_id}>
                                  {ev.name} ({ev.status})
                                </option>
                              ))}
                            </select>
                            {selectedWic.viblockChallengeId && (
                              <p className="text-[10px] text-emerald-600">
                                Event ID: <code className="font-mono">{selectedWic.viblockChallengeId}</code>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Drone Challenge */}
                    {selectedWic.useDronearena && (
                      <div className="space-y-2">
                        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <Gamepad2 className="h-3.5 w-3.5" /> Eptim Drone Challenge
                        </p>
                        {droneChallengesLoading ? (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading challenges…
                          </div>
                        ) : droneChallenges.length === 0 ? (
                          <p className="text-xs text-zinc-400 italic">No challenges available from Eptim Drone.</p>
                        ) : (
                          <div className="space-y-1.5">
                            <select
                              value={selectedWic.viblockChallengeId ?? ""}
                              onChange={(e) => setDroneChallenge(e.target.value || null)}
                              disabled={savingChallenge}
                              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 disabled:opacity-60"
                            >
                              <option value="">— Tiada challenge dipilih —</option>
                              {droneChallenges.map(ch => (
                                <option key={ch.id} value={ch.id}>
                                  {ch.name} ({ch.status})
                                </option>
                              ))}
                            </select>
                            {selectedWic.viblockChallengeId && (
                              <p className="text-[10px] text-sky-600">
                                Challenge ID: <code className="font-mono">{selectedWic.viblockChallengeId}</code>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Judging Templates */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <Gavel className="h-3.5 w-3.5" /> Judging Templates
                        </p>
                        <div className="flex items-center gap-2">
                          {assignedTemplates.length > 0 && (
                            <button
                              type="button"
                              onClick={selectedWic.judgingTemplatesLocked ? () => requestUnlock("judging") : lockJudgingTemplates}
                              disabled={togglingLock}
                              className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                                selectedWic.judgingTemplatesLocked
                                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                              }`}
                            >
                              {selectedWic.judgingTemplatesLocked
                                ? <><Lock className="h-3 w-3" /> Locked</>
                                : <><Unlock className="h-3 w-3" /> Lock</>}
                            </button>
                          )}
                        {!selectedWic.judgingTemplatesLocked && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setTemplatePickerOpen(v => !v); }}
                              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add template
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            {templatePickerOpen && (
                              <div className="absolute right-0 top-6 z-50 w-72 rounded-lg border bg-white shadow-lg overflow-hidden">
                                <div className="px-3 py-2 border-b text-xs font-semibold text-zinc-500 bg-zinc-50">
                                  Available Templates
                                </div>
                                <div className="max-h-56 overflow-y-auto">
                                  {allTemplates.filter(t => !assignedTemplates.some(a => a.id === t.id)).length === 0 ? (
                                    <p className="px-3 py-4 text-xs text-zinc-400 text-center">All templates already assigned.</p>
                                  ) : (
                                    allTemplates
                                      .filter(t => !assignedTemplates.some(a => a.id === t.id))
                                      .map(t => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); assignTemplate(t.id); }}
                                          disabled={assigningTemplateId === t.id}
                                          className="w-full text-left px-3 py-2.5 hover:bg-violet-50 border-b last:border-0 flex items-center gap-2"
                                        >
                                          {assigningTemplateId === t.id
                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400 shrink-0" />
                                            : <Gavel className="h-3.5 w-3.5 text-zinc-300 shrink-0" />
                                          }
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-zinc-800 truncate">{t.name}</p>
                                            <p className="text-[10px] text-zinc-400 font-mono">{t.code} · {t._count.criterions} criteria</p>
                                          </div>
                                        </button>
                                      ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        </div>
                      </div>
                      {templatesLoading ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-zinc-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading templates…
                        </div>
                      ) : assignedTemplates.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic py-1">No judging templates assigned.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {assignedTemplates.map(t => (
                            <div key={t.id} className="flex items-center gap-2 rounded-md border border-violet-100 bg-violet-50 px-3 py-2">
                              <Gavel className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-violet-800 truncate">{t.name}</p>
                                <p className="text-[10px] text-zinc-400 font-mono">{t.code} · {t._count.criterions} criteria</p>
                              </div>
                              {!selectedWic.judgingTemplatesLocked && (
                                <button
                                  type="button"
                                  onClick={() => confirmRemove(t)}
                                  disabled={removingTemplateId === t.id}
                                  className="p-0.5 rounded hover:bg-violet-100 shrink-0"
                                >
                                  {removingTemplateId === t.id
                                    ? <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                                    : <X className="h-3 w-3 text-violet-400" />
                                  }
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Menunggu", key: "PENDING",   icon: Clock,          cls: "text-amber-600 bg-amber-50" },
                    { label: "Disahkan", key: "CONFIRMED", icon: CheckCircle2,   cls: "text-green-600 bg-green-50" },
                    { label: "Ditolak",  key: "REJECTED",  icon: XCircle,        cls: "text-red-600 bg-red-50" },
                  ].map(({ label, key, icon: Icon, cls }) => (
                    <div key={key} className={`rounded-xl border p-4 flex items-center gap-3 ${cls} border-current/20`}>
                      <Icon className="h-5 w-5 opacity-70 shrink-0" />
                      <div>
                        <p className="text-2xl font-bold tabular-nums">{stats[key as keyof Stats] ?? 0}</p>
                        <p className="text-xs opacity-70">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status filter + refresh */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {statusTabs.map(s => (
                      <button key={s} type="button"
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          statusFilter === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {s === "ALL" ? "Semua" : s}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedWic && loadRegistrations(selectedWic.id, statusFilter)}
                    disabled={loading}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                    title="Muat semula senarai"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Muat Semula
                  </button>
                </div>

                {/* Registration table */}
                <div className="rounded-xl border bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Peserta</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Kontinjen</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Kaedah</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Masa Daftar</th>
                        {selectedWic?.useViblockarena && <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Viblock</th>}
                        {selectedWic?.useVibeblocks  && <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">VibeBlocks</th>}
                        {selectedWic?.useDronearena  && <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Drone</th>}
                        {canWrite && <th className="px-4 py-3 w-32" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loading ? (
                        <tr><td colSpan={(canWrite ? 7 : 6) + (selectedWic?.useViblockarena ? 1 : 0) + (selectedWic?.useVibeblocks ? 1 : 0) + (selectedWic?.useDronearena ? 1 : 0)} className="px-4 py-10 text-center text-zinc-400">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        </td></tr>
                      ) : registrations.length === 0 ? (
                        <tr><td colSpan={(canWrite ? 7 : 6) + (selectedWic?.useViblockarena ? 1 : 0) + (selectedWic?.useVibeblocks ? 1 : 0) + (selectedWic?.useDronearena ? 1 : 0)} className="px-4 py-10 text-center text-xs text-zinc-400">
                          Tiada pendaftaran{statusFilter !== "ALL" ? ` dengan status ${statusFilter}` : ""}.
                        </td></tr>
                      ) : registrations.map((reg, i) => (
                        <tr key={reg.id} className="hover:bg-zinc-50/60">
                          <td className="px-4 py-3 text-xs text-zinc-400 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-zinc-900">{reg.participant.name}</p>
                            <p className="text-[11px] text-zinc-400">{reg.participant.eduLevel}{reg.participant.classGrade ? ` · ${reg.participant.classGrade}` : ""}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600">
                            {reg.contingent.shortName ?? reg.contingent.name}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-[10px] ${reg.method === "COUNTER" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
                              {reg.method}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[reg.status]}`}>
                              {reg.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-400">
                            {new Date(reg.createdAt).toLocaleString("ms-MY", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          {selectedWic?.useViblockarena && (
                            <td className="px-4 py-3">
                              {reg.viblockToken ? (
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
                                    <Gamepad2 className="h-3 w-3" />
                                    {reg.viblockToken}
                                  </span>
                                  <button type="button" onClick={() => viblockViewToken(reg.id, reg.viblockToken!)}
                                    disabled={viblockActionId === reg.id}
                                    className="p-1 rounded text-violet-500 hover:text-violet-700 hover:bg-violet-50 transition-colors disabled:opacity-40" title="Lihat token">
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  {canWrite && (
                                    <button type="button" onClick={() => viblockRenewParticipantToken(reg.id)}
                                      disabled={viblockActionId === reg.id}
                                      className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-40" title="Renew token">
                                      {viblockActionId === reg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </div>
                              ) : canWrite ? (
                                <button type="button" onClick={() => viblockRegisterParticipant(reg.id)}
                                  disabled={viblockActionId === reg.id}
                                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40">
                                  {viblockActionId === reg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gamepad2 className="h-3 w-3" />}
                                  Daftar
                                </button>
                              ) : (
                                <span className="text-[10px] text-zinc-400 italic">Belum didaftar</span>
                              )}
                            </td>
                          )}
                          {selectedWic?.useVibeblocks && (() => {
                            const raw = reg.viblockToken ?? "";
                            const idx = raw.indexOf(":");
                            const entryToken = idx > 0 ? raw.slice(0, idx) : raw;
                            return (
                              <td className="px-4 py-3">
                                {raw ? (
                                  <div className="flex items-center gap-1">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      {entryToken}
                                    </span>
                                    {canWrite && (
                                      <button type="button" onClick={() => vibeBlocksRenewParticipantToken(reg.id)}
                                        disabled={vibeBlocksActionId === reg.id}
                                        className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-40" title="Ganti token">
                                        {vibeBlocksActionId === reg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                ) : canWrite ? (
                                  <button type="button" onClick={() => vibeBlocksRegisterParticipant(reg.id)}
                                    disabled={vibeBlocksActionId === reg.id}
                                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40">
                                    {vibeBlocksActionId === reg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gamepad2 className="h-3 w-3" />}
                                    Daftar
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-zinc-400 italic">Belum didaftar</span>
                                )}
                              </td>
                            );
                          })()}
                          {selectedWic?.useDronearena && (() => {
                            const raw = reg.viblockToken ?? "";
                            const parts = raw.split("|");
                            const isDrone = (parts.length === 3 || parts.length === 5) && !!parts[0] && !!parts[1] && !!parts[2];
                            const competitionToken = isDrone && parts.length === 5 ? parts[3] : null;
                            return (
                              <td className="px-4 py-3">
                                {isDrone ? (
                                  <div className="flex items-center gap-1">
                                    {competitionToken ? (
                                      <span className="inline-flex items-center text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 tracking-widest">
                                        {competitionToken}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-zinc-400 italic">—</span>
                                    )}
                                    {canWrite && (
                                      <>
                                        <button type="button" onClick={() => droneRefreshToken(reg.id)}
                                          disabled={droneActionId === reg.id}
                                          className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-40" title="Refresh token (jana semula access token)">
                                          {droneActionId === reg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                        </button>
                                        <button type="button" onClick={() => droneNewToken(reg.id)}
                                          disabled={droneActionId === reg.id}
                                          className="p-1 rounded text-violet-500 hover:text-violet-700 hover:bg-violet-50 transition-colors disabled:opacity-40" title="Token baharu (daftar semula sepenuhnya)">
                                          {droneActionId === reg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : canWrite ? (
                                  <button type="button" onClick={() => droneRegisterParticipant(reg.id)}
                                    disabled={droneActionId === reg.id}
                                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40">
                                    {droneActionId === reg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gamepad2 className="h-3 w-3" />}
                                    Daftar
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-zinc-400 italic">Belum didaftar</span>
                                )}
                              </td>
                            );
                          })()}
                          {canWrite && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setQrTarget(reg)}
                                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors" title="Tunjuk QR">
                                  <QrCode className="h-4 w-4" />
                                </button>
                                {reg.status === "PENDING" && (
                                  <button type="button"
                                    onClick={() => updateStatus(reg, "CONFIRMED")}
                                    disabled={updating === reg.id}
                                    className="p-1 rounded text-green-500 hover:text-green-700 hover:bg-green-50 transition-colors disabled:opacity-40" title="Sahkan">
                                    {updating === reg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                  </button>
                                )}
                                {reg.status === "PENDING" && (
                                  <button type="button"
                                    onClick={() => updateStatus(reg, "REJECTED")}
                                    disabled={updating === reg.id}
                                    className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40" title="Tolak">
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {qrTarget && (
        <QrModal
          regId={qrTarget.id}
          participantName={qrTarget.participant.name}
          competitionName={selectedWic?.competition.name ?? ""}
          onClose={() => setQrTarget(null)}
        />
      )}

      {/* Viblock token info modal */}
      {viblockTokenView && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setViblockTokenView(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-violet-600" />
                <p className="font-semibold text-zinc-900 text-sm">Viblock Arena Token</p>
              </div>
              <button onClick={() => setViblockTokenView(null)} className="text-zinc-400 hover:text-zinc-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            {viblockTokenLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat maklumat token…
              </div>
            ) : viblockTokenInfo ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-4 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-violet-500 mb-1">Token</p>
                  <p className="text-3xl font-black font-mono tracking-[0.3em] text-violet-800">{viblockTokenInfo.token}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-zinc-100 px-3 py-2">
                    <p className="text-[10px] text-zinc-400 uppercase">Nama</p>
                    <p className="font-medium text-zinc-800 truncate">{viblockTokenInfo.name}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-100 px-3 py-2">
                    <p className="text-[10px] text-zinc-400 uppercase">Status</p>
                    <p className={`font-medium ${viblockTokenInfo.is_used ? "text-amber-600" : "text-emerald-600"}`}>
                      {viblockTokenInfo.is_used ? "Sudah digunakan" : "Belum digunakan"}
                    </p>
                  </div>
                </div>
                {viblockTokenInfo.used_at && (
                  <p className="text-[10px] text-zinc-400 text-center">
                    Digunakan: {new Date(viblockTokenInfo.used_at).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 text-center">
                  Dicipta: {new Date(viblockTokenInfo.created_at).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 text-center py-4">Gagal mendapatkan maklumat token.</p>
            )}

            <Button size="sm" variant="outline" onClick={() => setViblockTokenView(null)} className="w-full">
              Tutup
            </Button>
          </div>
        </div>,
        document.body,
      )}

      {/* Template removal confirmation modal */}
      {removeConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setRemoveConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Gavel className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-zinc-900 text-sm">Buang Judging Template?</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Anda akan membuang <span className="font-semibold text-zinc-700">{removeConfirm.template.name}</span> daripada pertandingan ini.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-center space-y-1">
              <p className="text-[11px] text-zinc-400 uppercase tracking-widest">Taip kod ini untuk sahkan</p>
              <p className="text-2xl font-black font-mono tracking-[0.35em] text-zinc-800 select-none">
                {removeConfirm.code}
              </p>
            </div>

            <input
              autoFocus
              type="text"
              maxLength={5}
              value={removeConfirmInput}
              onChange={e => setRemoveConfirmInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter" && removeConfirmInput === removeConfirm.code) executeRemove(); }}
              placeholder="_ _ _ _ _"
              className="w-full text-center font-mono tracking-[0.35em] text-lg border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 uppercase"
            />

            <div className="flex gap-2">
              <button type="button" onClick={() => setRemoveConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
                Batal
              </button>
              <button type="button"
                onClick={executeRemove}
                disabled={removeConfirmInput !== removeConfirm.code}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Buang
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Challenge unlock confirmation modal */}
      {unlockConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setUnlockConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Unlock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-zinc-900 text-sm">Buka Kunci Challenge?</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Challenge yang dikunci menghalang perubahan tidak sengaja. Taip kod di bawah untuk buka kunci.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-center space-y-1">
              <p className="text-[11px] text-zinc-400 uppercase tracking-widest">Taip kod ini untuk buka kunci</p>
              <p className="text-2xl font-black font-mono tracking-[0.35em] text-zinc-800 select-none">
                {unlockConfirm.code}
              </p>
            </div>

            <input
              autoFocus
              type="text"
              maxLength={5}
              value={unlockInput}
              onChange={e => setUnlockInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter" && unlockInput === unlockConfirm.code) executeUnlock(); }}
              placeholder="_ _ _ _ _"
              className="w-full text-center font-mono tracking-[0.35em] text-lg border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 uppercase"
            />

            <div className="flex gap-2">
              <button type="button" onClick={() => setUnlockConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
                Batal
              </button>
              <button type="button"
                onClick={executeUnlock}
                disabled={unlockInput !== unlockConfirm.code}
                className="flex-1 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Buka Kunci
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
