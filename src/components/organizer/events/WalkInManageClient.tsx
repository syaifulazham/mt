"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Users, CheckCircle2, XCircle, Clock, QrCode, X, Loader2, Globe2, Link2, Copy, Eye, EyeOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type WalkInEndpointItem = {
  id: string; routeSlug: string; passcode: string; label: string | null; active: boolean; createdAt: string | Date;
};

type WalkInCompSummary = {
  id: string; competitionId: string; picName: string | null; maxSlots: number;
  publishToPortal: boolean;
  competition: { id: string; code: string; name: string };
  _count: { registrations: number };
  endpoints: WalkInEndpointItem[];
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

                {/* Status filter */}
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
                        {canWrite && <th className="px-4 py-3 w-32" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loading ? (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        </td></tr>
                      ) : registrations.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-zinc-400">
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
    </div>
  );
}
