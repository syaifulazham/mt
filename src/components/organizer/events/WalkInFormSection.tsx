"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Link2, Copy, XCircle, FileText, Search, CheckCircle2,
  UserX, X, QrCode, Download, FileDown,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";

type FormEndpoint = {
  id: string; routeSlug: string; label: string | null; active: boolean; createdAt: string | Date;
};
type Submission = {
  id: string; ic: string; name: string; schoolName: string | null;
  sessionNumber: number | null; slotNumber: number | null;
  status: "PENDING" | "PROCESSED" | "NO_MATCH";
  createdAt: string | Date; processedAt: string | Date | null;
  walkInCompetition: { id: string; competition: { code: string; name: string } };
  participant: { id: string; name: string } | null;
};
type Counts = { PENDING: number; PROCESSED: number; NO_MATCH: number };
type ParticipantHit = {
  id: string; name: string; ic: string | null;
  age: number | null; eduLevel: string; classGrade: string | null;
  contingentName: string;
};

const STATUS_META: Record<Submission["status"], { label: string; cls: string }> = {
  PENDING:   { label: "Pending",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PROCESSED: { label: "Processed",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  NO_MATCH:  { label: "No Match",      cls: "bg-red-50 text-red-600 border-red-200" },
};

export function WalkInFormSection({ eventId, canWrite }: { eventId: string; canWrite: boolean }) {
  const [formEps,        setFormEps]        = useState<FormEndpoint[]>([]);
  const [addingFormEp,   setAddingFormEp]   = useState(false);
  const [deletingEpId,   setDeletingEpId]   = useState<string | null>(null);
  const [copyMsg,        setCopyMsg]        = useState<string | null>(null);
  const [qrEndpoint,     setQrEndpoint]     = useState<FormEndpoint | null>(null);

  const [subs,        setSubs]        = useState<Submission[]>([]);
  const [counts,      setCounts]      = useState<Counts>({ PENDING: 0, PROCESSED: 0, NO_MATCH: 0 });
  const [filter,      setFilter]      = useState<Submission["status"]>("PENDING");
  const [subsLoading, setSubsLoading] = useState(false);
  const [searchQ,     setSearchQ]     = useState("");

  const [processing,      setProcessing]      = useState<Submission | null>(null);
  const [procQ,           setProcQ]           = useState("");
  const [procResults,     setProcResults]     = useState<ParticipantHit[]>([]);
  const [procSearching,   setProcSearching]   = useState(false);
  const [procSelected,    setProcSelected]    = useState<ParticipantHit | null>(null);
  const [procBusy,        setProcBusy]        = useState(false);
  const [procErr,         setProcErr]         = useState("");

  const loadEndpoints = useCallback(async () => {
    const j = await fetch(`/api/v2/organizer/events/${eventId}/walkin/form-endpoint`).then(r => r.json());
    setFormEps(j.data ?? []);
  }, [eventId]);

  const loadSubs = useCallback(async () => {
    setSubsLoading(true);
    const j = await fetch(`/api/v2/organizer/events/${eventId}/walkin/form-submissions?status=${filter}`).then(r => r.json());
    setSubs(j.data ?? []);
    if (j.counts) setCounts(j.counts);
    setSubsLoading(false);
  }, [eventId, filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadEndpoints(); }, [loadEndpoints]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadSubs(); }, [loadSubs]);

  async function addFormEndpoint() {
    setAddingFormEp(true);
    const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin/form-endpoint`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const j = await res.json();
    if (res.ok) setFormEps(prev => [...prev, j.data]);
    setAddingFormEp(false);
  }

  async function deleteFormEndpoint(epId: string) {
    setDeletingEpId(epId);
    const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin/form-endpoint/${epId}`, { method: "DELETE" });
    if (res.ok) setFormEps(prev => prev.filter(e => e.id !== epId));
    setDeletingEpId(null);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopyMsg("Disalin!"); setTimeout(() => setCopyMsg(null), 2000); });
  }

  function openProcess(sub: Submission) {
    setProcessing(sub);
    setProcQ(sub.ic);
    setProcSelected(null);
    setProcErr("");
    searchParticipants(sub.ic);
  }

  async function searchParticipants(q: string) {
    setProcQ(q); setProcSelected(null);
    if (q.trim().length < 2) { setProcResults([]); return; }
    setProcSearching(true);
    const j = await fetch(`/api/v2/organizer/events/${eventId}/walkin/form-submissions/search-participants?q=${encodeURIComponent(q)}`).then(r => r.json());
    setProcResults(j.data ?? []);
    setProcSearching(false);
  }

  async function processSubmission(action: "match" | "no_match") {
    if (!processing) return;
    setProcBusy(true); setProcErr("");
    const res = await fetch(`/api/v2/organizer/events/${eventId}/walkin/form-submissions/${processing.id}/process`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, participantId: procSelected?.id }),
    });
    const j = await res.json();
    if (!res.ok) {
      setProcErr(
        j.error === "SLOT_TAKEN" ? "Slot telah diambil oleh pendaftaran lain."
        : j.error === "ALREADY_REGISTERED" ? "Peserta ini sudah berdaftar untuk pertandingan ini."
        : j.error === "UNIQUE_PARTICIPATION" ? "Peserta sudah berdaftar untuk pertandingan walk-in lain dalam acara ini."
        : j.error === "ALREADY_PROCESSED" ? "Borang ini telah diproses."
        : (j.message ?? j.error ?? "Gagal memproses."),
      );
    } else {
      setProcessing(null);
      loadSubs();
    }
    setProcBusy(false);
  }

  const FILTER_TABS: { key: Submission["status"]; label: string }[] = [
    { key: "PENDING",   label: "Pending" },
    { key: "PROCESSED", label: "Processed" },
    { key: "NO_MATCH",  label: "No Match" },
  ];

  return (
    <>
      {/* ── Endpoint Borang Awam ─────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-zinc-800">Endpoint Borang Awam</p>
          </div>
          {canWrite && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              onClick={addFormEndpoint} disabled={addingFormEp}>
              {addingFormEp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Tambah
            </Button>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          Pautan awam untuk mendaftar peserta walk-in — halaman pendaratan + borang pendaftaran (tanpa passcode).
        </p>
        {formEps.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">Tiada endpoint borang. Klik Tambah untuk jana pautan borang awam.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-zinc-500">Borang</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-500">URL</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {formEps.map(ep => (
                  <tr key={ep.id} className="hover:bg-zinc-50/60">
                    <td className="px-3 py-2 font-medium text-zinc-800">{ep.label ?? ep.routeSlug}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <code className="text-emerald-700 truncate max-w-[200px]">/borang/{ep.routeSlug}</code>
                        <button type="button"
                          onClick={() => copyToClipboard(`${window.location.origin}/borang/${ep.routeSlug}`)}
                          className="text-zinc-400 hover:text-emerald-600 transition-colors shrink-0" title="Salin URL">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button type="button"
                          onClick={() => setQrEndpoint(ep)}
                          className="text-zinc-400 hover:text-indigo-600 transition-colors" title="Papar QR Code">
                          <QrCode className="h-3.5 w-3.5" />
                        </button>
                        {canWrite && (
                          <button type="button"
                            onClick={() => deleteFormEndpoint(ep.id)}
                            disabled={deletingEpId === ep.id}
                            className="text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-40">
                            {deletingEpId === ep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {copyMsg && <p className="text-[10px] text-emerald-600">{copyMsg}</p>}
      </div>

      {/* ── Menunggu Diproses ────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-800">Menunggu Diproses</p>
          <div className="flex items-center gap-2">
            {subs.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => {
                  const sorted = [...subs].sort((a, b) => {
                    const cA = a.walkInCompetition.competition.name;
                    const cB = b.walkInCompetition.competition.name;
                    if (cA !== cB) return cA.localeCompare(cB);
                    if ((a.sessionNumber ?? 0) !== (b.sessionNumber ?? 0)) return (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0);
                    return (a.slotNumber ?? 0) - (b.slotNumber ?? 0);
                  });
                  const rows = sorted.map(s => [
                    s.walkInCompetition.competition.name,
                    s.sessionNumber != null ? `Sesi ${s.sessionNumber}` : "",
                    s.slotNumber != null ? String(s.slotNumber) : "",
                    s.name,
                    s.ic,
                    s.status,
                  ]);
                  const csv = [["Pertandingan", "Sesi", "Slot", "Nama", "IC", "Status"], ...rows]
                    .map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
                  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(blob);
                  link.download = `borang-submissions-${filter.toLowerCase()}.csv`;
                  link.click();
                }}>
                <FileDown className="h-3.5 w-3.5" /> CSV
              </Button>
            )}
            <div className="flex items-center gap-1">
              {FILTER_TABS.map(t => (
                <button key={t.key} type="button"
                  onClick={() => setFilter(t.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    filter === t.key
                      ? t.key === "PENDING" ? "bg-amber-50 border-amber-300 text-amber-700"
                        : t.key === "PROCESSED" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-red-50 border-red-300 text-red-600"
                      : "border-zinc-200 text-zinc-400 hover:text-zinc-600"
                  }`}>
                  {t.label} <span className="font-normal">({counts[t.key]})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Cari nama, IC, atau pertandingan…"
            className="w-full h-8 rounded-lg border border-zinc-200 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>

        {subsLoading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Memuatkan…</span>
          </div>
        ) : subs.length === 0 ? (
          <p className="text-xs text-zinc-400 italic py-2">Tiada borang dalam status ini.</p>
        ) : (() => {
          const q = searchQ.trim().toLowerCase();
          const filtered = q ? subs.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.ic.toLowerCase().includes(q) ||
            s.walkInCompetition.competition.name.toLowerCase().includes(q) ||
            s.walkInCompetition.competition.code.toLowerCase().includes(q) ||
            (s.schoolName && s.schoolName.toLowerCase().includes(q))
          ) : subs;
          if (filtered.length === 0) return <p className="text-xs text-zinc-400 italic py-2">Tiada padanan untuk &quot;{searchQ.trim()}&quot;</p>;
          const sorted = [...filtered].sort((a, b) => {
            const cA = a.walkInCompetition.competition.name;
            const cB = b.walkInCompetition.competition.name;
            if (cA !== cB) return cA.localeCompare(cB);
            if ((a.sessionNumber ?? 0) !== (b.sessionNumber ?? 0)) return (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0);
            return (a.slotNumber ?? 0) - (b.slotNumber ?? 0);
          });
          const grouped: Record<string, { code: string; name: string; items: Submission[] }> = {};
          for (const s of sorted) {
            const key = s.walkInCompetition.id;
            if (!grouped[key]) grouped[key] = { code: s.walkInCompetition.competition.code, name: s.walkInCompetition.competition.name, items: [] };
            grouped[key].items.push(s);
          }
          return (
            <div className="space-y-4">
              {Object.entries(grouped).map(([key, g]) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-400">{g.code}</span>
                    <p className="text-xs font-semibold text-zinc-700">{g.name}</p>
                    <span className="text-[10px] text-zinc-400">({g.items.length})</span>
                  </div>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50 border-b">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium text-zinc-500">Sesi</th>
                          <th className="px-3 py-1.5 text-left font-medium text-zinc-500">Slot</th>
                          <th className="px-3 py-1.5 text-left font-medium text-zinc-500">Nama</th>
                          <th className="px-3 py-1.5 text-left font-medium text-zinc-500">IC</th>
                          <th className="px-3 py-1.5 text-left font-medium text-zinc-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {g.items.map(s => {
                          const meta = STATUS_META[s.status];
                          const clickable = s.status === "PENDING" && canWrite;
                          return (
                            <tr key={s.id}
                              onClick={() => clickable && openProcess(s)}
                              className={`${clickable ? "cursor-pointer hover:bg-amber-50/40" : ""}`}>
                              <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                                {s.sessionNumber != null ? `Sesi ${s.sessionNumber}` : "—"}
                              </td>
                              <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                                {s.slotNumber != null ? s.slotNumber : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-zinc-800">{s.name}</p>
                                {s.schoolName && <p className="text-[10px] text-zinc-400 truncate max-w-[160px]">{s.schoolName}</p>}
                              </td>
                              <td className="px-3 py-2 font-mono text-zinc-600">{s.ic}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${meta.cls}`}>
                                  {meta.label}
                                </span>
                                {s.status === "PROCESSED" && s.participant && (
                                  <p className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[140px]">→ {s.participant.name}</p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ── QR Code dialog ────────────────────────────────────────────── */}
      {qrEndpoint && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setQrEndpoint(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <p className="text-sm font-bold text-zinc-900">QR Code Borang</p>
              <button type="button" onClick={() => setQrEndpoint(null)}
                className="text-zinc-400 hover:text-zinc-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
              <div className="relative bg-white p-4 rounded-xl border shadow-sm">
                <QRCodeCanvas
                  id="qr-canvas"
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/borang/${qrEndpoint.routeSlug}`}
                  size={220}
                  level="H"
                  marginSize={2}
                  imageSettings={{
                    src: "/logo-mt.svg",
                    x: undefined,
                    y: undefined,
                    height: 44,
                    width: 44,
                    excavate: true,
                  }}
                />
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs font-mono text-zinc-500">/borang/{qrEndpoint.routeSlug}</p>
                <p className="text-[10px] text-zinc-400">{qrEndpoint.label ?? "Borang Awam Walk-in"}</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs"
                  onClick={() => {
                    const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement | null;
                    if (!canvas) return;
                    const link = document.createElement("a");
                    link.download = `qr-borang-${qrEndpoint.routeSlug}.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                  }}>
                  <Download className="h-3.5 w-3.5" /> Muat Turun
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs"
                  onClick={() => copyToClipboard(`${window.location.origin}/borang/${qrEndpoint.routeSlug}`)}>
                  <Copy className="h-3.5 w-3.5" /> Salin URL
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Process dialog ───────────────────────────────────────────────── */}
      {processing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !procBusy && setProcessing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <p className="text-sm font-bold text-zinc-900">Proses Borang</p>
              <button type="button" onClick={() => !procBusy && setProcessing(null)}
                className="text-zinc-400 hover:text-zinc-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Submitted details */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-zinc-900">{processing.name}</p>
                  <span className="font-mono text-xs text-zinc-600">{processing.ic}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500">
                  {processing.schoolName && <span className="col-span-2">Sekolah: <strong className="text-zinc-700">{processing.schoolName}</strong></span>}
                  <span>Pertandingan: <strong className="text-zinc-700">{processing.walkInCompetition.competition.name}</strong></span>
                  {processing.sessionNumber != null && (
                    <span>Slot: <strong className="text-zinc-700">Sesi {processing.sessionNumber} · Slot {processing.slotNumber}</strong></span>
                  )}
                </div>
              </div>

              {/* IC search */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold tracking-widest uppercase text-zinc-400">
                  Cari peserta dalam pangkalan data (IC / Nama)
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                  <input value={procQ} onChange={e => searchParticipants(e.target.value)}
                    placeholder="Cari IC atau nama…"
                    className="w-full h-9 rounded-lg border border-zinc-200 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  {procSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-400" />}
                </div>

                {procQ.trim().length >= 2 && !procSearching && procResults.length === 0 && (
                  <p className="text-xs text-zinc-400 italic px-1">Tiada padanan. Anda boleh tandakan sebagai &quot;Tiada Padanan&quot;.</p>
                )}
                {procResults.length > 0 && (
                  <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
                    {procResults.map(p => {
                      const sel = procSelected?.id === p.id;
                      return (
                        <button key={p.id} type="button"
                          onClick={() => setProcSelected(sel ? null : p)}
                          className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${sel ? "bg-indigo-50" : "hover:bg-zinc-50"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-800 truncate">{p.name}</p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              <span className="font-mono">{p.ic ?? "—"}</span> · {p.contingentName} · {p.eduLevel}{p.classGrade ? ` ${p.classGrade}` : ""}
                            </p>
                          </div>
                          {sel && <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {procErr && <p className="text-xs text-red-500">{procErr}</p>}

              <div className="flex gap-2">
                <Button
                  onClick={() => processSubmission("match")}
                  disabled={!procSelected || procBusy}
                  className="flex-1 gap-1.5">
                  {procBusy && procSelected ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Sahkan &amp; Daftar
                </Button>
                <Button variant="outline"
                  onClick={() => processSubmission("no_match")}
                  disabled={procBusy}
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                  <UserX className="h-4 w-4" />
                  Tiada Padanan
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
