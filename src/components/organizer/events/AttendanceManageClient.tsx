"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Copy, Check, Power, PowerOff, Trash2,
  Loader2, QrCode, ExternalLink, ShieldCheck, Clock,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type EventSummary = { id: string; name: string; slug: string };

type Endpoint = {
  id: string;
  routeCode: string;
  passcode: string;
  label: string | null;
  active: boolean;
  retiredAt: string | null;
  createdAt: string;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ms-MY", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function endpointUrl(code: string) {
  if (typeof window === "undefined") return `/attendance/${code}`;
  return `${window.location.origin}/attendance/${code}`;
}

/* ─── Copy button ────────────────────────────────────────────────────────── */

function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "xs" }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  const cls = size === "xs"
    ? "p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
    : "p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors";
  return (
    <button type="button" onClick={handleCopy} className={cls} title="Salin">
      {copied
        ? <Check className={size === "xs" ? "h-3 w-3 text-emerald-500" : "h-3.5 w-3.5 text-emerald-500"} />
        : <Copy className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />}
    </button>
  );
}

/* ─── QR modal ───────────────────────────────────────────────────────────── */

function QrModal({ endpoint, onClose }: { endpoint: Endpoint; onClose: () => void }) {
  const url = endpointUrl(endpoint.routeCode);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 font-[family-name:var(--font-geist-sans)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-zinc-900">{endpoint.label ?? endpoint.routeCode}</p>
            <p className="text-xs text-zinc-400 font-mono">{endpoint.routeCode}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className="flex justify-center">
          <div className="p-3 bg-white border border-zinc-100 rounded-xl shadow-inner">
            <QRCodeSVG value={url} size={200} level="M" />
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 truncate font-mono">{url}</p>
            <CopyButton text={url} size="xs" />
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span className="text-xs text-zinc-500">Passcode:</span>
            <span className="text-xs font-bold font-mono text-zinc-800 tracking-widest">
              {endpoint.passcode}
            </span>
            <CopyButton text={endpoint.passcode} size="xs" />
          </div>
        </div>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <ExternalLink className="h-4 w-4" /> Buka Endpoint
        </a>
      </div>
    </div>
  );
}

/* ─── Create endpoint modal ──────────────────────────────────────────────── */

function CreateModal({
  eventId,
  onCreated,
  onClose,
}: {
  eventId: string;
  onCreated: (ep: Endpoint) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/attendance/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Gagal mencipta endpoint."); return; }
      onCreated(json.data);
    } catch {
      setErr("Ralat sambungan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 font-[family-name:var(--font-geist-sans)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-zinc-900">Endpoint Kehadiran Baharu</h3>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Label Kaunter
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !saving && handleCreate()}
            placeholder="cth. Kaunter Utama, Pintu A…"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <p className="text-xs text-zinc-400">
            Biarkan kosong untuk label automatik (Kaunter N).
          </p>
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cipta
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Active endpoint row ────────────────────────────────────────────────── */

function EndpointRow({
  ep, busy, confirmDelete,
  onQr, onToggle, onDeleteRequest, onDeleteCancel, onDeleteConfirm,
}: {
  ep: Endpoint; busy: boolean; confirmDelete: boolean;
  onQr: () => void; onToggle: () => void;
  onDeleteRequest: () => void; onDeleteCancel: () => void; onDeleteConfirm: () => void;
}) {
  const url = endpointUrl(ep.routeCode);
  return (
    <tr className="hover:bg-zinc-50/70 transition-colors group">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
            Aktif
          </span>
          <span className="font-semibold text-zinc-900 text-sm">{ep.label ?? ep.routeCode}</span>
        </div>
      </td>

      <td className="px-4 py-3.5 hidden md:table-cell">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-zinc-500">/attendance/{ep.routeCode}</span>
          <CopyButton text={url} size="xs" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-zinc-300 hover:text-blue-600 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </td>

      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-zinc-800 tracking-widest">{ep.passcode}</span>
          <CopyButton text={ep.passcode} size="xs" />
        </div>
      </td>

      <td className="px-4 py-3.5 hidden lg:table-cell">
        <span className="text-xs text-zinc-400">{fmtDate(ep.createdAt)}</span>
      </td>

      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-0.5">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-600 font-medium">Padam?</span>
              <button
                type="button"
                onClick={onDeleteConfirm}
                disabled={busy}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ya"}
              </button>
              <button
                type="button"
                onClick={onDeleteCancel}
                className="text-xs px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Tidak
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onQr}
                title="Papar QR"
                className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <QrCode className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onToggle}
                disabled={busy}
                title="Pensyen endpoint"
                className="p-1.5 rounded-lg text-zinc-300 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onDeleteRequest}
                title="Padam"
                className="p-1.5 rounded-lg text-zinc-300 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─── Retired endpoint row ───────────────────────────────────────────────── */

function RetiredRow({
  ep, busy, confirmDelete,
  onToggle, onDeleteRequest, onDeleteCancel, onDeleteConfirm,
}: {
  ep: Endpoint; busy: boolean; confirmDelete: boolean;
  onToggle: () => void;
  onDeleteRequest: () => void; onDeleteCancel: () => void; onDeleteConfirm: () => void;
}) {
  return (
    <tr className="hover:bg-zinc-50/70 transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 inline-block" />
            Dipensyen
          </span>
          <span className="text-zinc-500 text-sm">{ep.label ?? ep.routeCode}</span>
        </div>
      </td>
      <td className="px-4 py-3.5 hidden md:table-cell">
        <span className="font-mono text-xs text-zinc-400">{ep.routeCode}</span>
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <Clock className="h-3 w-3" />
          {ep.retiredAt ? fmtDate(ep.retiredAt) : "—"}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-0.5">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-600 font-medium">Padam?</span>
              <button
                type="button"
                onClick={onDeleteConfirm}
                disabled={busy}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ya"}
              </button>
              <button
                type="button"
                onClick={onDeleteCancel}
                className="text-xs px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Tidak
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggle}
                disabled={busy}
                title="Aktifkan semula"
                className="p-1.5 rounded-lg text-zinc-300 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onDeleteRequest}
                title="Padam"
                className="p-1.5 rounded-lg text-zinc-300 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export function AttendanceManageClient({ event }: { event: EventSummary }) {
  const [endpoints, setEndpoints]       = useState<Endpoint[]>([]);
  const [loading, setLoading]           = useState(true);
  const [creating, setCreating]         = useState(false);
  const [qrTarget, setQrTarget]         = useState<Endpoint | null>(null);
  const [actionBusy, setActionBusy]     = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/attendance/endpoints`);
      const json = await res.json();
      setEndpoints(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => { fetchEndpoints(); }, [fetchEndpoints]);

  async function handleToggleActive(ep: Endpoint) {
    setActionBusy(ep.id);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/attendance/endpoints/${ep.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !ep.active }),
        },
      );
      const json = await res.json();
      if (res.ok) setEndpoints((prev) => prev.map((e) => (e.id === ep.id ? json.data : e)));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/attendance/endpoints/${id}`,
        { method: "DELETE" },
      );
      if (res.ok) { setEndpoints((prev) => prev.filter((e) => e.id !== id)); setDeleteConfirm(null); }
    } finally {
      setActionBusy(null);
    }
  }

  const active  = endpoints.filter((e) => e.active);
  const retired = endpoints.filter((e) => !e.active);

  return (
    <div className="min-h-screen bg-zinc-50 font-[family-name:var(--font-geist-sans)]">

      {/* Sticky header */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href={`/organizer/events/${event.slug}/manage`}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-zinc-900 tracking-tight">Log Kehadiran Peserta</h1>
            <p className="text-xs text-zinc-400 truncate">{event.name}</p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Endpoint Baharu
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Jumlah",    value: endpoints.length, color: "text-zinc-900" },
            { label: "Aktif",     value: active.length,    color: "text-emerald-600" },
            { label: "Dipensyen", value: retired.length,   color: "text-amber-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-zinc-100 shadow-sm px-5 py-4">
              <p className={`text-3xl font-extrabold tabular-nums ${color}`}>{value}</p>
              <p className="text-xs text-zinc-400 mt-0.5 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* How-it-works banner */}
        <div className="rounded-2xl bg-blue-50 border border-blue-100 px-5 py-4 flex gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-blue-900">Cara penggunaan</p>
            <p className="text-xs text-blue-700/80 leading-relaxed">
              Setiap endpoint mempunyai URL unik dan passcode 6 digit. Berikan kepada operator kaunter —
              mereka buka URL, masukkan passcode, kemudian imbas QR kod kontingen untuk catat kehadiran.
              Pensyen endpoint untuk menutupnya; pengguna yang cuba akses akan diarahkan ke halaman pemberitahuan.
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-2 text-zinc-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuatkan endpoint…
          </div>
        )}

        {/* Active endpoints */}
        {!loading && active.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 px-1">
              Endpoint Aktif
            </h2>
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/60">
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Label</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest hidden md:table-cell">Pautan</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Passcode</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest hidden lg:table-cell">Dicipta</th>
                    <th className="w-32 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {active.map((ep) => (
                    <EndpointRow
                      key={ep.id}
                      ep={ep}
                      busy={actionBusy === ep.id}
                      confirmDelete={deleteConfirm === ep.id}
                      onQr={() => setQrTarget(ep)}
                      onToggle={() => handleToggleActive(ep)}
                      onDeleteRequest={() => setDeleteConfirm(ep.id)}
                      onDeleteCancel={() => setDeleteConfirm(null)}
                      onDeleteConfirm={() => handleDelete(ep.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Retired endpoints */}
        {!loading && retired.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 px-1">
              Endpoint Dipensyen
            </h2>
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden opacity-70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/60">
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Label</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest hidden md:table-cell">Kod</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest hidden lg:table-cell">Dipensyen pada</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {retired.map((ep) => (
                    <RetiredRow
                      key={ep.id}
                      ep={ep}
                      busy={actionBusy === ep.id}
                      confirmDelete={deleteConfirm === ep.id}
                      onToggle={() => handleToggleActive(ep)}
                      onDeleteRequest={() => setDeleteConfirm(ep.id)}
                      onDeleteCancel={() => setDeleteConfirm(null)}
                      onDeleteConfirm={() => handleDelete(ep.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Empty state */}
        {!loading && endpoints.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center">
              <QrCode className="h-8 w-8 text-zinc-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-zinc-700">Tiada endpoint lagi</p>
              <p className="text-xs text-zinc-400 max-w-xs">
                Cipta endpoint pertama untuk mula merekodkan kehadiran melalui QR kod kontingen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" /> Buat Endpoint Pertama
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {creating && (
        <CreateModal
          eventId={event.id}
          onCreated={(ep) => {
            setEndpoints((prev) => [ep, ...prev]);
            setCreating(false);
            setQrTarget(ep);
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {qrTarget && <QrModal endpoint={qrTarget} onClose={() => setQrTarget(null)} />}
    </div>
  );
}
