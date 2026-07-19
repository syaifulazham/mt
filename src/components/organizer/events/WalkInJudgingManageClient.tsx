"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Gavel, Plus, Trash2, Loader2, Copy, Check,
  Eye, EyeOff, Tag, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type EndpointItem = {
  id: string;
  routeSlug: string;
  passcode: string;
  label: string | null;
  status: "ACTIVE" | "CLOSED";
  createdAt: string | Date;
  judgingTemplate: { id: string; name: string; code: string };
};

type AssignedTemplate = {
  judgingTemplate: {
    id: string; name: string; code: string; description: string | null;
    _count: { criterions: number };
  };
};

type WicBlock = {
  id: string;
  competition: { id: string; code: string; name: string };
  _count: { registrations: number };
  judgingTemplates: AssignedTemplate[];
  judgingEndpoints: EndpointItem[];
};

type EventInfo = { id: string; name: string; slug: string; walkInCompetitions: WicBlock[] };

// ── Endpoint row ───────────────────────────────────────────────────────────────

function EndpointRow({
  endpoint, wicId, eventId, canWrite, onDelete, onStatusChange,
  revealed, onToggleReveal, copiedSlug, copiedPass, onCopySlug, onCopyPass,
}: {
  endpoint: EndpointItem;
  wicId: string;
  eventId: string;
  canWrite: boolean;
  onDelete: (id: string) => void;
  onStatusChange: (status: "ACTIVE" | "CLOSED") => void;
  revealed: boolean;
  onToggleReveal: () => void;
  copiedSlug: boolean;
  copiedPass: boolean;
  onCopySlug: () => void;
  onCopyPass: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/v2/organizer/events/${eventId}/walkin/${wicId}/judging-endpoints/${endpoint.id}`, { method: "DELETE" });
      onDelete(endpoint.id);
    } finally { setDeleting(false); }
  }

  async function toggleStatus() {
    setToggling(true);
    const next = endpoint.status === "ACTIVE" ? "CLOSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin/${wicId}/judging-endpoints/${endpoint.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
      });
      if (res.ok) onStatusChange(next);
    } finally { setToggling(false); }
  }

  return (
    <tr className={cn("border-b last:border-0 hover:bg-zinc-50/60 transition-colors", endpoint.status === "CLOSED" && "opacity-50")}>
      <td className="px-4 py-3 text-sm">
        {endpoint.label
          ? <span className="font-medium text-zinc-800">{endpoint.label}</span>
          : <span className="text-zinc-300 italic text-xs">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">
          {endpoint.judgingTemplate.code}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-mono text-zinc-500 truncate max-w-[180px]">
            /walkin-judging/{endpoint.routeSlug}
          </span>
          <button onClick={onCopySlug} title="Salin URL" className="p-0.5 rounded hover:bg-zinc-200 shrink-0">
            {copiedSlug
              ? <Check className="h-3.5 w-3.5 text-green-500" />
              : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {revealed ? (
            <button
              onClick={onCopyPass}
              title="Salin passcode"
              className="font-mono font-bold tracking-widest text-sm text-violet-700 hover:text-violet-500 transition-colors cursor-pointer"
            >
              {copiedPass ? <span className="text-green-600">Disalin!</span> : endpoint.passcode}
            </button>
          ) : (
            <span className="font-mono font-bold tracking-widest text-sm text-zinc-400">••••••</span>
          )}
          <button onClick={onToggleReveal} className="p-0.5 rounded hover:bg-zinc-100 shrink-0">
            {revealed ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-full",
          endpoint.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400",
        )}>
          {endpoint.status}
        </span>
      </td>
      {canWrite && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={toggleStatus}
              disabled={toggling}
              className="text-[11px] text-zinc-400 hover:text-zinc-700 font-medium whitespace-nowrap flex items-center gap-1"
            >
              {toggling && <Loader2 className="h-3 w-3 animate-spin" />}
              {endpoint.status === "ACTIVE" ? "Tutup" : "Buka"}
            </button>
            <button onClick={handleDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50">
              {deleting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                : <Trash2 className="h-3.5 w-3.5 text-red-400" />}
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WalkInJudgingManageClient({ event, canWrite }: { event: EventInfo; canWrite: boolean }) {
  const [wicList,     setWicList]     = useState<WicBlock[]>(event.walkInCompetitions);
  const [selectedWic, setSelectedWic] = useState<WicBlock | null>(event.walkInCompetitions[0] ?? null);

  const [revealedIds,  setRevealedIds]  = useState<Set<string>>(new Set());
  const [copiedSlugId, setCopiedSlugId] = useState<string | null>(null);
  const [copiedPassId, setCopiedPassId] = useState<string | null>(null);

  // Create dialog
  const [createFor,  setCreateFor]  = useState<{ wicId: string; template: AssignedTemplate["judgingTemplate"] } | null>(null);
  const [taskLabel,  setTaskLabel]  = useState("");
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState("");

  function updateWic(id: string, patch: Partial<WicBlock>) {
    setWicList(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
    setSelectedWic(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  }

  function toggleReveal(id: string) {
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function copySlug(endpoint: EndpointItem) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await navigator.clipboard.writeText(`${origin}/walkin-judging/${endpoint.routeSlug}`);
    setCopiedSlugId(endpoint.id);
    setTimeout(() => setCopiedSlugId(null), 2000);
  }

  async function copyPass(endpoint: EndpointItem) {
    await navigator.clipboard.writeText(endpoint.passcode);
    setCopiedPassId(endpoint.id);
    setTimeout(() => setCopiedPassId(null), 2000);
  }

  async function handleCreate() {
    if (!createFor || !selectedWic) return;
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/walkin/${createFor.wicId}/judging-endpoints`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ judgingTemplateId: createFor.template.id, label: taskLabel }),
        },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal");
      updateWic(createFor.wicId, {
        judgingEndpoints: [...(selectedWic.judgingEndpoints), j.data],
      });
      setCreateFor(null); setTaskLabel("");
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Gagal");
    } finally { setCreating(false); }
  }

  function handleEndpointDeleted(wicId: string, endpointId: string) {
    const wic = wicList.find(w => w.id === wicId);
    if (!wic) return;
    updateWic(wicId, {
      judgingEndpoints: wic.judgingEndpoints.filter(e => e.id !== endpointId),
    });
  }

  function handleStatusChanged(wicId: string, endpointId: string, status: "ACTIVE" | "CLOSED") {
    const wic = wicList.find(w => w.id === wicId);
    if (!wic) return;
    updateWic(wicId, {
      judgingEndpoints: wic.judgingEndpoints.map(e => e.id === endpointId ? { ...e, status } : e),
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/organizer/events/${event.slug}/manage/walkin`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-violet-500" />
            <h1 className="text-xl font-bold text-zinc-900">Walk-in Penghakiman</h1>
          </div>
          <p className="text-sm text-zinc-500">{event.name}</p>
        </div>
      </div>

      {wicList.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center text-zinc-400">
          <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Tiada pertandingan walk-in ditetapkan untuk acara ini.</p>
          <Link href={`/organizer/events/${event.slug}/manage/walkin`}
            className="text-xs text-violet-500 hover:underline mt-1 inline-block">
            Konfigurasi walk-in
          </Link>
        </div>
      ) : (
        <div className="flex gap-5">
          {/* Left: competition list */}
          <div className="w-56 shrink-0 space-y-1.5">
            {wicList.map(wic => (
              <button key={wic.id} type="button"
                onClick={() => setSelectedWic(wic)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                  selectedWic?.id === wic.id
                    ? "border-teal-300 bg-teal-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50",
                )}
              >
                <p className="text-sm font-medium text-zinc-800 truncate">{wic.competition.name}</p>
                <p className="text-[11px] text-zinc-400 font-mono">{wic.competition.code}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{wic._count.registrations} daftar</p>
              </button>
            ))}
          </div>

          {/* Right: templates + endpoints */}
          <div className="flex-1 min-w-0 space-y-4">
            {!selectedWic ? null : selectedWic.judgingTemplates.length === 0 ? (
              <div className="rounded-xl border bg-white p-10 text-center text-sm text-zinc-400">
                <Gavel className="h-7 w-7 mx-auto mb-3 opacity-30" />
                <p>Tiada judging template ditetapkan untuk pertandingan ini.</p>
                <Link href={`/organizer/events/${event.slug}/manage/walkin`}
                  className="text-xs text-violet-500 hover:underline mt-1 inline-block">
                  Tambah template di halaman walk-in
                </Link>
              </div>
            ) : (
              <>
                <div className="rounded-md bg-violet-50 border border-violet-100 px-3 py-2 text-[11px] text-violet-700">
                  URL penghakiman dan passcode dijana untuk setiap endpoint. Papan penghakiman peserta akan tersedia kemudian.
                </div>

                {selectedWic.judgingTemplates.map(({ judgingTemplate: tpl }) => {
                  const endpoints = selectedWic.judgingEndpoints.filter(e => e.judgingTemplate.id === tpl.id);
                  return (
                    <div key={tpl.id} className="rounded-xl border bg-white shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-zinc-50/70 border-b">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3.5 w-3.5 text-violet-400" />
                          <span className="text-sm font-medium text-violet-700">{tpl.name}</span>
                          <span className="text-[10px] bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded font-mono">
                            {tpl.code}
                          </span>
                          <span className="text-[10px] text-zinc-400">{tpl._count.criterions} kriteria</span>
                        </div>
                        {canWrite && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50"
                            onClick={() => { setCreateFor({ wicId: selectedWic.id, template: tpl }); setTaskLabel(""); setCreateErr(""); }}
                          >
                            <Plus className="h-3 w-3" /> Cipta Endpoint
                          </Button>
                        )}
                      </div>

                      {endpoints.length === 0 ? (
                        <p className="px-5 py-4 text-xs text-zinc-400 italic">Tiada endpoint penghakiman lagi.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-zinc-50/40">
                                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-40">Label</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-32">Template</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">URL</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-36">Passcode</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-24">Status</th>
                                {canWrite && <th className="px-4 py-2 w-28" />}
                              </tr>
                            </thead>
                            <tbody>
                              {endpoints.map(endpoint => (
                                <EndpointRow
                                  key={endpoint.id}
                                  endpoint={endpoint}
                                  wicId={selectedWic.id}
                                  eventId={event.id}
                                  canWrite={canWrite}
                                  revealed={revealedIds.has(endpoint.id)}
                                  onToggleReveal={() => toggleReveal(endpoint.id)}
                                  copiedSlug={copiedSlugId === endpoint.id}
                                  copiedPass={copiedPassId === endpoint.id}
                                  onCopySlug={() => copySlug(endpoint)}
                                  onCopyPass={() => copyPass(endpoint)}
                                  onDelete={() => handleEndpointDeleted(selectedWic.id, endpoint.id)}
                                  onStatusChange={(status) => handleStatusChanged(selectedWic.id, endpoint.id, status)}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Create endpoint dialog */}
      <Dialog open={!!createFor} onOpenChange={open => { if (!open) setCreateFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <Gavel className="h-4 w-4" /> Cipta Endpoint Penghakiman
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 px-4">
            <div className="rounded-md bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-700">
              Template: <span className="font-semibold">{createFor?.template.name}</span>
            </div>
            <div>
              <Label className="text-xs">Label (pilihan)</Label>
              <Input
                value={taskLabel}
                onChange={e => setTaskLabel(e.target.value)}
                placeholder="cth. Kaunter 1, Pusingan 1…"
                className="mt-1 h-8 text-sm"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
              <p className="text-[10px] text-zinc-400 mt-1">URL unik dan passcode akan dijana secara automatik.</p>
            </div>
            {createErr && <p className="text-xs text-red-500">{createErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFor(null)} disabled={creating}>Batal</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
              Jana Endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
