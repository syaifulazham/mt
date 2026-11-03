"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, UserRound, Loader2, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Certificates → Distribution: switch issued certificates on or off for the
// contingent manager portal and the participant portal.

type Settings = { manager: boolean; participant: boolean; updatedAt: string | null; updatedBy: string | null };
type Counts = { ready: number; withParticipant: number; withContingent: number };
const API = "/api/v2/organizer/certificates/distribution";
const fmt = (n: number) => n.toLocaleString();

function Switch({ on, disabled, busy, onToggle, label }: { on: boolean; disabled: boolean; busy: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled || busy}
      className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on ? "bg-emerald-600" : "bg-zinc-300")}>
      <span className={cn("absolute h-6 w-6 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")}>
        {busy && <Loader2 className="m-1 h-4 w-4 animate-spin text-zinc-400" />}
      </span>
    </button>
  );
}

function Card({ icon: Icon, title, on, busy, canWrite, onToggle, count, countLabel, notes }: {
  icon: React.ElementType; title: string; on: boolean; busy: boolean; canWrite: boolean; onToggle: () => void;
  count: number; countLabel: string; notes: React.ReactNode[];
}) {
  return (
    <div className={cn("rounded-xl border bg-white p-5 shadow-sm", on && "border-emerald-200")}>
      <div className="flex items-start gap-4">
        <div className={cn("shrink-0 rounded-lg p-2.5", on ? "bg-emerald-600" : "bg-zinc-400")}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
              <p className={cn("text-xs font-medium", on ? "text-emerald-700" : "text-zinc-400")}>
                {on ? "Aktif — sijil dipaparkan" : "Tidak aktif — sijil tidak dipaparkan"}
              </p>
            </div>
            <Switch on={on} busy={busy} disabled={!canWrite} onToggle={onToggle} label={title} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            <b className="tabular-nums text-zinc-700">{fmt(count)}</b> {countLabel}
          </p>
          <ul className="mt-3 space-y-1.5 border-t pt-3 text-xs text-zinc-600">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-2"><Info className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-400" /><span>{n}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function CertificateDistributionClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [busy, setBusy] = useState<"manager" | "participant" | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(API, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? `HTTP ${r.status}`); return; }
    setSettings(j.settings); setCounts(j.counts); setCanWrite(j.canWrite);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  async function toggle(key: "manager" | "participant") {
    if (!settings) return;
    setBusy(key); setErr("");
    try {
      const r = await fetch(API, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: !settings[key] }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSettings(j.settings);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Certificate Distribution</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Tentukan sama ada sijil yang telah dijana boleh dilihat dan dimuat turun di portal pengurus kontinjen dan portal peserta.
        </p>
      </div>

      {!settings || !counts ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
      ) : (
        <>
          <Card
            icon={Building2} title="Distribute to contingent manager portal"
            on={settings.manager} busy={busy === "manager"} canWrite={canWrite} onToggle={() => toggle("manager")}
            count={counts.withContingent} countLabel="sijil sedia (READY) dikaitkan dengan kontinjen"
            notes={[
              "Pengurus kontinjen melihat sijil semua peserta dalam kontinjen mereka, termasuk sijil pencapaian, dan boleh memuat turunnya satu per satu.",
              "Sesuai apabila sekolah atau institusi mahu mencetak dan mengedarkan sijil sendiri kepada peserta.",
              "Hanya sijil berstatus READY dipaparkan. Sijil yang dibatalkan (REVOKED) tidak dipaparkan.",
              "Mematikan suis ini menyembunyikan sijil dengan serta-merta. Rekod sijil tidak dipadam dan pengesahan awam (kod QR) kekal berfungsi.",
            ]}
          />
          <Card
            icon={UserRound} title="Distribute to participant portal"
            on={settings.participant} busy={busy === "participant"} canWrite={canWrite} onToggle={() => toggle("participant")}
            count={counts.withParticipant} countLabel="sijil sedia (READY) dikaitkan dengan peserta"
            notes={[
              "Setiap peserta hanya melihat sijil miliknya sendiri dan boleh memuat turun PDF.",
              "Sijil daripada senarai Custom tanpa pautan kepada peserta berdaftar tidak akan dipaparkan di portal ini.",
              "Pastikan reka letak templat telah disemak dan diterbitkan (publish) sebelum menghidupkan suis ini — peserta akan memuat turun mengikut versi templat semasa sijil.",
              "Mematikan suis ini menyembunyikan sijil dengan serta-merta tanpa memadam rekod.",
            ]}
          />

          {settings.updatedAt && (
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Dikemas kini {new Date(settings.updatedAt).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}
              {settings.updatedBy && ` oleh ${settings.updatedBy}`}
            </p>
          )}
          {!canWrite && <p className="text-xs text-zinc-500">Hanya Super Admin dan Admin boleh menukar tetapan ini.</p>}
        </>
      )}
      {err && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {err}</p>}
    </div>
  );
}
