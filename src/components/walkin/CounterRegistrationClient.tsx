"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, Loader2, CheckCircle2, QrCode, X, ScanLine, UserCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";

type WicInfo = {
  id: string;
  endpointActive: boolean;
  maxSlots: number;
  event: { id: string; name: string; slug: string; venue: string | null; startDate: string | null };
  competition: { id: string; code: string; name: string; participationType: string };
  _count: { registrations: number };
};

type ParticipantResult = {
  id: string; name: string; ic: string | null; gender: string;
  age: number | null; eduLevel: string; classGrade: string | null;
  contingentId: string; contingentName: string;
  alreadyRegistered: boolean; registrationStatus: string | null;
};

type RegisteredResult = { id: string; status: string };

function QrModal({ regId, name, onClose }: { regId: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full" onClick={e => e.stopPropagation()}>
        <div className="w-full flex items-center justify-between">
          <p className="text-sm font-semibold">{name}</p>
          <button onClick={onClose}><X className="h-4 w-4 text-zinc-400" /></button>
        </div>
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-sm font-medium text-green-700">Pendaftaran berjaya!</p>
        <QRCodeSVG value={regId} size={180} level="M" />
        <p className="text-[10px] text-zinc-400 font-mono break-all text-center">{regId}</p>
        <Button size="sm" variant="outline" onClick={onClose} className="w-full">Tutup</Button>
      </div>
    </div>,
    document.body,
  );
}

export function CounterRegistrationClient({ slug }: { slug: string }) {
  const [wic, setWic] = useState<WicInfo | null>(null);
  const [loadErr, setLoadErr] = useState("");

  // Gate
  const [passcode,  setPasscode]  = useState("");
  const [gateErr,   setGateErr]   = useState("");
  const [authed,    setAuthed]    = useState(false);

  // Register tab
  const [q,            setQ]            = useState("");
  const [searching,    setSearching]    = useState(false);
  const [results,      setResults]      = useState<ParticipantResult[]>([]);
  const [selected,     setSelected]     = useState<ParticipantResult | null>(null);
  const [registeredBy, setRegisteredBy] = useState("");
  const [registering,  setRegistering]  = useState(false);
  const [regResult,    setRegResult]    = useState<RegisteredResult | null>(null);
  const [regErr,       setRegErr]       = useState("");

  // Scan QR tab
  const [tab,        setTab]        = useState<"register" | "scan">("register");
  const [scanInput,  setScanInput]  = useState("");
  const [confirming, setConfirming] = useState(false);
  const [scanResult, setScanResult] = useState<{ name?: string; message?: string } | null>(null);
  const [scanErr,    setScanErr]    = useState("");

  // Load WIC info on mount
  useEffect(() => {
    fetch(`/api/v2/walkin/${slug}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) { setLoadErr("Endpoint tidak dijumpai atau tidak aktif."); return; }
        setWic(j.data);
      })
      .catch(() => setLoadErr("Ralat memuatkan maklumat endpoint."));
  }, [slug]);

  async function handleGate() {
    if (!passcode.trim()) return;
    // Validate passcode by calling the participants endpoint
    const res = await fetch(`/api/v2/walkin/${slug}/participants?q=test&passcode=${encodeURIComponent(passcode)}`);
    if (res.status === 403) { setGateErr("Passcode tidak sah."); return; }
    setAuthed(true); setGateErr("");
  }

  async function handleSearch(value: string) {
    setQ(value);
    setSelected(null);
    if (value.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/v2/walkin/${slug}/participants?q=${encodeURIComponent(value)}&passcode=${encodeURIComponent(passcode)}`);
    const j   = await res.json();
    setResults(j.data ?? []);
    setSearching(false);
  }

  async function handleRegister() {
    if (!selected) return;
    setRegistering(true); setRegErr("");
    const res = await fetch(`/api/v2/walkin/${slug}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: selected.id, passcode, registeredBy: registeredBy.trim() || null }),
    });
    const j = await res.json();
    if (!res.ok) {
      setRegErr(j.error === "ALREADY_REGISTERED" ? "Peserta sudah berdaftar." : (j.message ?? j.error ?? "Gagal mendaftar."));
    } else {
      setRegResult(j.data);
      setSelected(null); setQ(""); setResults([]);
    }
    setRegistering(false);
  }

  async function handleConfirmScan() {
    const rid = scanInput.trim();
    if (!rid) return;
    setConfirming(true); setScanErr(""); setScanResult(null);
    const res = await fetch(`/api/v2/walkin/${slug}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: rid, passcode }),
    });
    const j = await res.json();
    if (!res.ok) {
      setScanErr(j.message ?? j.error ?? "Gagal mengesahkan.");
    } else {
      setScanResult({ name: j.data?.participant?.name, message: j.message });
      setScanInput("");
    }
    setConfirming(false);
  }

  if (loadErr) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="bg-white rounded-xl border p-8 max-w-sm text-center space-y-2">
        <p className="text-sm font-medium text-red-600">{loadErr}</p>
      </div>
    </div>
  );

  if (!wic) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
    </div>
  );

  // Gate screen
  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-zinc-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg border p-8 max-w-sm w-full space-y-5">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto mb-3">
            <UserCheck className="h-6 w-6 text-teal-600" />
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Walk-in Registration</h1>
          <p className="text-sm font-medium text-zinc-700">{wic.competition.name}</p>
          <p className="text-xs text-zinc-400">{wic.event.name}</p>
          {wic.event.venue && <p className="text-xs text-zinc-400">{wic.event.venue}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-600">Passcode Kaunter</label>
          <input
            type="password"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleGate()}
            placeholder="Masukkan passcode..."
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {gateErr && <p className="text-xs text-red-500">{gateErr}</p>}
          <Button onClick={handleGate} className="w-full bg-teal-600 hover:bg-teal-500">Masuk</Button>
        </div>
        <div className="text-center">
          <span className="text-[11px] text-zinc-400">
            {wic._count.registrations} pendaftaran
            {wic.maxSlots > 0 ? ` / ${wic.maxSlots} slot` : ""}
          </span>
        </div>
      </div>
    </div>
  );

  // Main screen
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
          <UserCheck className="h-4 w-4 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 truncate">{wic.competition.name}</p>
          <p className="text-xs text-zinc-400 truncate">{wic.event.name}</p>
        </div>
        <span className="text-xs text-zinc-500 whitespace-nowrap">
          {wic._count.registrations}{wic.maxSlots > 0 ? `/${wic.maxSlots}` : ""} daftar
        </span>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b flex">
        {([["register", "Daftar Peserta", Search], ["scan", "Imbas QR", ScanLine]] as const).map(([t, label, Icon]) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-teal-600 text-teal-700" : "border-transparent text-zinc-400 hover:text-zinc-600"
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {tab === "register" && (
          <>
            {/* Staff name */}
            <input value={registeredBy} onChange={e => setRegisteredBy(e.target.value)}
              placeholder="Nama kakitangan (pilihan)"
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <input value={q} onChange={e => handleSearch(e.target.value)}
                placeholder="Cari peserta (nama atau IC)…"
                className="w-full h-10 rounded-lg border border-input bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500" />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zinc-400" />}
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="rounded-xl border bg-white divide-y overflow-hidden">
                {results.map(p => (
                  <button key={p.id} type="button"
                    disabled={p.alreadyRegistered}
                    onClick={() => setSelected(p)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      p.alreadyRegistered ? "opacity-50 cursor-not-allowed bg-zinc-50" :
                      selected?.id === p.id ? "bg-teal-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-zinc-400">{p.contingentName} · {p.eduLevel}{p.classGrade ? ` ${p.classGrade}` : ""}</p>
                    </div>
                    {p.alreadyRegistered ? (
                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">{p.registrationStatus}</span>
                    ) : selected?.id === p.id ? (
                      <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full shrink-0">Dipilih</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            {/* Selected participant confirm */}
            {selected && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-teal-900">{selected.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600">
                  <span>Kontinjen: <strong>{selected.contingentName}</strong></span>
                  <span>Tahap: <strong>{selected.eduLevel}{selected.classGrade ? ` ${selected.classGrade}` : ""}</strong></span>
                  {selected.ic && <span>IC (masked): <strong>{selected.ic}</strong></span>}
                  {selected.age && <span>Umur: <strong>{selected.age}</strong></span>}
                </div>
                {regErr && <p className="text-xs text-red-500">{regErr}</p>}
                <Button onClick={handleRegister} disabled={registering}
                  className="w-full bg-teal-600 hover:bg-teal-500 gap-2">
                  {registering && <Loader2 className="h-4 w-4 animate-spin" />}
                  Daftar Sekarang
                </Button>
              </div>
            )}
          </>
        )}

        {tab === "scan" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">Imbas QR kod peserta portal atau masukkan ID pendaftaran secara manual.</p>
            <div className="flex gap-2">
              <input value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConfirmScan()}
                placeholder="ID Pendaftaran / Imbas QR…"
                className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500" />
              <Button onClick={handleConfirmScan} disabled={confirming || !scanInput.trim()}
                className="bg-teal-600 hover:bg-teal-500 gap-1.5">
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Sahkan
              </Button>
            </div>
            {scanErr && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{scanErr}</div>
            )}
            {scanResult && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">{scanResult.name ? `${scanResult.name} — Disahkan!` : "Berjaya disahkan!"}</p>
                  {scanResult.message && <p className="text-xs text-green-600">{scanResult.message}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {regResult && (
        <QrModal
          regId={regResult.id}
          name={selected?.name ?? "Peserta"}
          onClose={() => setRegResult(null)}
        />
      )}
    </div>
  );
}
