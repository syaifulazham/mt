"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

type Cert = {
  code: string; programme: string; year: number; name: string; competition: string; stage: string;
  achievement: string | null;
  pelibatan: { label: string; level: string; marks: number };
  pencapaian: { level: string; marks: number } | null;
  issuedAt: string;
};
type Result =
  | { result: "VALID"; certificate: Cert }
  | { result: "WITHDRAWN"; code: string }
  | { result: "NOT_FOUND" | "INVALID_FORMAT" }
  | { result: "ERROR"; message: string };

export function PajskVerifyClient({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const auto = useRef(false);

  const verify = useCallback(async (value: string) => {
    setBusy(true); setRes(null);
    try {
      const r = await fetch("/api/v2/pajsk/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value }),
      });
      if (r.status === 429) { setRes({ result: "ERROR", message: "Terlalu banyak semakan. Cuba lagi sebentar lagi." }); return; }
      const j = await r.json().catch(() => null);
      setRes(j?.result ? j : { result: "ERROR", message: "Semakan gagal. Cuba lagi." });
    } catch {
      setRes({ result: "ERROR", message: "Semakan gagal. Semak sambungan internet anda." });
    } finally { setBusy(false); }
  }, []);

  // A QR scan lands here with ?kod=…: check it straight away, once.
  useEffect(() => {
    if (initialCode && !auto.current) {
      auto.current = true;
      verify(initialCode);
    }
  }, [initialCode, verify]);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mt.svg" alt="Malaysia Techlympics" className="mx-auto h-10 w-auto" />
          <h1 className="mt-4 flex items-center justify-center gap-2 text-xl font-bold">
            <ShieldCheck className="h-5 w-5 text-[#085782]" /> Sahkan Sijil PAJSK
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Masukkan kod pengesahan 10 aksara yang tertera pada sijil.</p>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); if (code.trim()) verify(code); }}
          className="flex gap-2 rounded-xl border bg-white p-3 shadow-sm"
        >
          <input
            value={code} onChange={e => setCode(e.target.value)} maxLength={20} autoComplete="off" spellCheck={false}
            placeholder="XXXXX-XXXXX" aria-label="Kod pengesahan"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-lg uppercase tracking-widest"
          />
          <button type="submit" disabled={busy || !code.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#085782] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sahkan
          </button>
        </form>

        {res?.result === "VALID" && <Valid c={res.certificate} />}
        {res?.result === "WITHDRAWN" && (
          <Notice icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} title="Sijil tidak lagi sah"
            text={`Sijil dengan kod ${res.code} telah ditarik balik kerana rekod penyertaan atau pencapaiannya telah berubah.`} />
        )}
        {(res?.result === "NOT_FOUND" || res?.result === "INVALID_FORMAT") && (
          <Notice icon={<XCircle className="h-5 w-5 text-red-600" />} title="Kod tidak ditemui"
            text={res.result === "INVALID_FORMAT" ? "Kod pengesahan mesti 10 aksara (huruf dan nombor)." : "Tiada sijil PAJSK dengan kod ini. Semak semula kod pada sijil."} />
        )}
        {res?.result === "ERROR" && <Notice icon={<XCircle className="h-5 w-5 text-red-600" />} title="Ralat" text={res.message} />}

        <p className="text-center text-xs text-zinc-400">
          Untuk melindungi data peribadi murid, hanya maklumat yang tertera pada sijil dipaparkan dan nama disamarkan.
        </p>
      </div>
    </main>
  );
}

function Valid({ c }: { c: Cert }) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <dt className="text-zinc-500">{k}</dt><dd className="text-right font-medium">{v}</dd>
    </div>
  );
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-5 w-5" /><span className="font-semibold">Sijil sah</span>
        <span className="ml-auto font-mono text-sm text-zinc-500">{c.code}</span>
      </div>
      <dl className="mt-3">
        {row("Program", c.programme)}
        {row("Nama", <span className="font-mono">{c.name}</span>)}
        {row("Pertandingan", c.competition)}
        {row("Peringkat tertinggi", c.stage)}
        {c.achievement && row("Pencapaian", c.achievement)}
        {row(`Markah Pelibatan (${c.pelibatan.label}, ${c.pelibatan.level})`, c.pelibatan.marks)}
        {c.pencapaian && row(`Markah Pencapaian (${c.pencapaian.level})`, c.pencapaian.marks)}
        {row("Tarikh dikeluarkan", new Date(c.issuedAt).toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" }))}
      </dl>
    </div>
  );
}

function Notice({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-white p-4 shadow-sm">
      {icon}
      <div><p className="font-semibold">{title}</p><p className="text-sm text-zinc-600">{text}</p></div>
    </div>
  );
}
