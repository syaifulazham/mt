"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2, CheckCircle2, ChevronRight, ChevronLeft, MapPin,
  CalendarDays, ClipboardList, AlertCircle, LayoutGrid, UserCheck, Trophy, User,
} from "lucide-react";
import { fmtSlotMin, type SlotScheduleConfig } from "@/lib/walkin-slots";
import { QRCodeCanvas } from "qrcode.react";

/* ─── Pink & Black palette ──────────────────────────────────────────────── */
const B = {
  pink:     "#ec4899",
  pinkLt:   "#f472b6",
  pinkDk:   "#db2777",
  pinkGlow: "#f9a8d4",
  black:    "#0a0a0a",
  blackLt:  "#171717",
  blackMd:  "#1e1e1e",
  white:    "#ffffff",
  gray:     "#737373",
};

const GLOBAL_CSS = `
  html { scroll-behavior: smooth }
  @keyframes pk-float   { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-14px) rotate(4deg)} }
  @keyframes pk-pulse   { 0%,100%{opacity:.08} 50%{opacity:.2} }
  @keyframes pk-card-in { 0%{opacity:0;transform:translateY(20px) scale(.97)} 100%{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes pk-pop     { 0%{transform:scale(0) rotate(-15deg);opacity:0} 65%{transform:scale(1.15) rotate(3deg);opacity:1} 100%{transform:scale(1) rotate(0);opacity:1} }
  @keyframes pk-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes pk-glow    { 0%,100%{opacity:.3} 50%{opacity:.6} }
  .pk-float   { animation: pk-float   5s ease-in-out infinite }
  .pk-pulse   { animation: pk-pulse   3s ease-in-out infinite }
  .pk-card-in { animation: pk-card-in .4s cubic-bezier(.34,1.56,.64,1) both }
  .pk-pop     { animation: pk-pop     .5s cubic-bezier(.34,1.56,.64,1) .15s both }
  .pk-glow    { animation: pk-glow    4s ease-in-out infinite }
`;

function StemBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      {/* Dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle, rgba(236,72,153,.08) 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      }} />
      {/* Glow blobs */}
      <div className="pk-glow absolute top-[-10%] left-[-5%] h-96 w-96 rounded-full"
        style={{ background: `radial-gradient(circle, ${B.pink}30, transparent 70%)`, filter: "blur(60px)" }} />
      <div className="pk-glow absolute bottom-[-10%] right-[-5%] h-80 w-80 rounded-full"
        style={{ background: `radial-gradient(circle, ${B.pinkDk}25, transparent 70%)`, filter: "blur(50px)", animationDelay: "2s" }} />
      {/* Floating shapes */}
      <div className="pk-float absolute top-[15%] right-[8%]" style={{ animationDelay: "0s" }}>
        <div className="h-16 w-16 rounded-2xl border-2 border-pink-500/10 rotate-12" />
      </div>
      <div className="pk-float absolute top-[55%] left-[5%]" style={{ animationDelay: "1.5s" }}>
        <div className="h-12 w-12 rounded-full border-2 border-pink-500/10" />
      </div>
      <div className="pk-float absolute top-[75%] right-[12%]" style={{ animationDelay: "0.8s" }}>
        <div className="h-10 w-10 rounded-lg border-2 border-pink-500/10 rotate-45" />
      </div>
      {/* Binary decoration */}
      {["10110001", "01001101", "11010010"].map((bin, i) => (
        <div key={i} className="absolute font-mono text-[10px] pk-pulse select-none"
          style={{
            color: "rgba(236,72,153,.1)",
            top: `${25 + i * 22}%`, left: i % 2 === 0 ? "3%" : "90%",
            animationDelay: `${i * 0.8}s`, letterSpacing: "0.1em",
          }}>
          {bin}
        </div>
      ))}
    </div>
  );
}

function TechHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mt.svg" alt="Malaysia Techlympics"
        className={compact ? "h-7 w-auto" : "h-10 w-auto"} />
      {!compact && (
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-pink-400/60 uppercase">Malaysia</p>
          <p className="text-sm font-extrabold tracking-[0.12em] text-white leading-tight uppercase"
            style={{ textShadow: `0 0 20px ${B.pink}40` }}>
            Techlympics
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Types ─────────────────────────────────────────────────────────────── */
type Competition = {
  id: string; maxSlots: number;
  walkInSlotSchedule: SlotScheduleConfig | null;
  competition: { id: string; code: string; name: string; participationType: string };
  _count: { registrations: number };
};
type FormInfo = {
  endpointId: string; label: string | null;
  uniqueParticipation: boolean;
  event: { id: string; name: string; slug: string; venue: string | null; startDate: string | null; endDate: string | null };
  competitions: Competition[];
};
type SessionSlots = { n: number; start: number; end: number; booked: number[] };
type SlotChoice = { sessionNumber: number; slotNumber: number };

const STEPS = [
  { icon: ClipboardList, title: "Isi Borang",
    desc: "Masukkan no. IC, nama penuh dan nama sekolah anda dalam borang pendaftaran." },
  { icon: LayoutGrid,    title: "Tempah Slot",
    desc: "Pilih sesi dan slot masa yang sesuai untuk pertandingan pilihan anda." },
  { icon: UserCheck,     title: "Sahkan di Kaunter",
    desc: "Hadir ke kaunter pendaftaran pada hari acara untuk pengesahan penyertaan." },
];

/* ─── Main component ────────────────────────────────────────────────────── */
export function PublicFormClient({ slug }: { slug: string }) {
  const [info,    setInfo]    = useState<FormInfo | null>(null);
  const [loadErr, setLoadErr] = useState("");

  const [comp,       setComp]       = useState<Competition | null>(null);
  const [ic,         setIc]         = useState("");
  const [name,       setName]       = useState("");
  const [schoolName, setSchoolName] = useState("");

  const [slotSessions,   setSlotSessions]   = useState<SessionSlots[] | null>(null);
  const [slotsLoading,   setSlotsLoading]   = useState(false);
  const [slotChoice,     setSlotChoice]     = useState<SlotChoice | null>(null);
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [formErr,    setFormErr]    = useState("");
  const [success,    setSuccess]    = useState<{ id: string; sessionNumber: number | null; slotNumber: number | null } | null>(null);
  const [formStep,       setFormStep]       = useState<1 | 2>(1);
  const [activeSession,  setActiveSession]  = useState<number | null>(null);

  // IC availability check
  const [usedCompIds,    setUsedCompIds]    = useState<Set<string>>(new Set());
  const [icChecking,     setIcChecking]     = useState(false);
  const icCheckTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkIc = useCallback((icVal: string) => {
    if (icCheckTimer.current) clearTimeout(icCheckTimer.current);
    const clean = icVal.replace(/[\s-]/g, "");
    if (clean.length < 6 || !info) { setUsedCompIds(new Set()); return; }
    icCheckTimer.current = setTimeout(async () => {
      setIcChecking(true);
      try {
        const j = await fetch(`/api/v2/borang/${slug}/check-ic?ic=${encodeURIComponent(clean)}`).then(r => r.json());
        setUsedCompIds(new Set(j.usedCompetitionIds ?? []));
      } catch { setUsedCompIds(new Set()); }
      finally { setIcChecking(false); }
    }, 400);
  }, [slug, info]);

  useEffect(() => {
    fetch(`/api/v2/borang/${slug}`).then(r => r.json()).then(j => {
      if (j.error) { setLoadErr("Borang tidak dijumpai atau tidak aktif."); return; }
      setInfo(j.data);
    }).catch(() => setLoadErr("Ralat memuatkan borang."));
  }, [slug]);

  const cfg: SlotScheduleConfig | null = comp?.walkInSlotSchedule ?? null;

  // Load slot availability for the chosen competition
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!comp || !cfg) { setSlotSessions(null); return; }
    let cancelled = false;
    setSlotsLoading(true); setSlotChoice(null); setFormStep(1); setActiveSession(null);
    fetch(`/api/v2/borang/${slug}/slots?competitionId=${comp.id}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setSlotSessions(j.sessions ?? null); })
      .catch(() => { if (!cancelled) setSlotSessions(null); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [comp, cfg, slug, slotRefreshKey]);

  const selectedSlotSession = slotChoice && slotSessions
    ? slotSessions.find(s => s.n === slotChoice.sessionNumber)
    : null;

  async function handleSubmit() {
    if (!comp) return;
    setSubmitting(true); setFormErr("");
    const res = await fetch(`/api/v2/borang/${slug}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        competitionId: comp.id,
        ic, name, schoolName,
        ...(slotChoice ?? {}),
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      if (j.error === "SLOT_TAKEN") {
        setFormErr("Slot baru sahaja ditempah. Sila pilih slot lain.");
        setSlotRefreshKey(k => k + 1);
      } else setFormErr(
        j.error === "DUPLICATE_SUBMISSION"
          ? "IC ini telah menghantar borang untuk pertandingan ini."
          : j.error === "UNIQUE_PARTICIPATION"
          ? "IC ini sudah didaftarkan untuk pertandingan lain dalam acara ini. Hanya satu penyertaan dibenarkan."
          : j.error === "INVALID_IC"
          ? "No. IC tidak sah (6–12 digit, tanpa sengkang)."
          : j.error === "INVALID_NAME"
          ? "Sila isikan nama penuh."
          : j.error === "SLOT_REQUIRED"
          ? "Sila pilih sesi dan slot."
          : (j.message ?? "Gagal menghantar borang."),
      );
    } else {
      setSuccess(j.data);
    }
    setSubmitting(false);
  }

  const pageBg = {
    minHeight: "100vh",
    background: `linear-gradient(160deg, ${B.black} 0%, ${B.blackLt} 50%, ${B.black} 100%)`,
    position: "relative" as const,
    overflow: "hidden" as const,
  };

  if (loadErr) return (
    <div style={pageBg} className="flex items-center justify-center p-6">
      <StemBg />
      <div className="relative z-10 rounded-2xl border border-pink-500/20 p-8 max-w-sm w-full text-center"
        style={{ background: "rgba(236,72,153,.06)", backdropFilter: "blur(16px)" }}>
        <AlertCircle className="h-6 w-6 mx-auto mb-2" style={{ color: B.pink }} />
        <p className="text-sm font-medium" style={{ color: B.pinkLt }}>{loadErr}</p>
      </div>
    </div>
  );

  if (!info) return (
    <div style={pageBg} className="flex items-center justify-center">
      <StemBg />
      <Loader2 className="h-7 w-7 animate-spin relative z-10" style={{ color: B.pink }} />
    </div>
  );

  const inputCls = "w-full h-11 rounded-xl px-4 text-sm text-white placeholder-white/25 focus:outline-none";
  const inputStyle = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(236,72,153,.2)" };

  /* ── Success screen ──────────────────────────────────────────────────── */
  if (success && comp) return (
    <div style={pageBg} className="flex flex-col items-center p-6">
      <style>{GLOBAL_CSS}</style>
      <StemBg />
      <div className="relative z-10 w-full max-w-md space-y-5 pt-6">
        <div className="flex justify-center"><TechHeader /></div>
        <div className="pk-card-in rounded-2xl overflow-hidden border border-pink-500/20 shadow-2xl"
          style={{ background: `linear-gradient(160deg, ${B.blackLt} 0%, ${B.blackMd} 60%, ${B.blackLt} 100%)` }}>
          <div className="h-1.5 w-full"
            style={{ background: `linear-gradient(90deg, ${B.pinkDk}, ${B.pink}, ${B.pinkLt})` }} />
          <div className="p-6 space-y-4 text-center">
            <div className="pk-pop inline-flex h-16 w-16 rounded-full items-center justify-center"
              style={{ background: "rgba(236,72,153,.15)", border: `1px solid ${B.pink}40` }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: B.pink }} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: B.pink }}>
                Borang Diterima
              </p>
              <p className="text-lg font-extrabold text-white mt-1">{name.toUpperCase()}</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,.5)" }}>
                <span className="font-mono">{comp.competition.code}</span> — {comp.competition.name}
              </p>
            </div>
            {success.sessionNumber != null && success.slotNumber != null && selectedSlotSession && (
              <div className="rounded-xl px-4 py-3 border"
                style={{ background: "rgba(236,72,153,.08)", borderColor: "rgba(236,72,153,.3)" }}>
                <p className="text-[9px] font-bold tracking-[0.25em] uppercase" style={{ color: B.pinkLt }}>Slot Ditempah</p>
                <p className="text-base font-extrabold text-white mt-0.5">
                  Sesi {success.sessionNumber} · Slot {success.slotNumber}
                </p>
                <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,.45)" }}>
                  {fmtSlotMin(selectedSlotSession.start)} – {fmtSlotMin(selectedSlotSession.end)}
                </p>
              </div>
            )}
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,.4)" }}>
              Sila hadir ke kaunter pendaftaran pada hari acara untuk pengesahan.
              Rujukan: <span className="font-mono text-white/60">{success.id.slice(-8).toUpperCase()}</span>
            </p>
            <button type="button"
              onClick={() => { setSuccess(null); setComp(null); setName(""); setSchoolName(""); setSlotChoice(null); checkIc(ic); }}
              className="w-full rounded-xl py-2.5 text-sm font-bold transition-transform hover:scale-[1.02] active:scale-[.98]"
              style={{ background: `linear-gradient(90deg, ${B.pinkDk}, ${B.pink})`, color: "white" }}>
              Selesai
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Landing / form ──────────────────────────────────────────────────── */
  return (
    <div style={pageBg} className="min-h-screen flex flex-col">
      <style>{GLOBAL_CSS}</style>
      <StemBg />

      {/* Top bar */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between">
        <TechHeader />
        <span className="text-[10px] font-bold tracking-[0.25em] uppercase px-3 py-1.5 rounded-full border"
          style={{ color: B.pinkLt, borderColor: "rgba(236,72,153,.35)", background: "rgba(236,72,153,.08)" }}>
          Walk-in
        </span>
      </header>

      {!comp ? (
        <main className="relative z-10 flex-1 flex flex-col">
          {/* ── Hero ── */}
          <section className="relative w-full max-w-5xl mx-auto px-6 pt-16 pb-16 text-center space-y-6">
            {/* glow */}
            <div className="absolute left-1/2 top-6 -translate-x-1/2 h-64 w-[36rem] max-w-full rounded-full pointer-events-none"
              style={{ background: `radial-gradient(ellipse at center, ${B.pink}30, transparent 70%)`, filter: "blur(20px)" }} />
            <div className="relative space-y-6">
              <p className="pk-card-in text-[11px] font-bold tracking-[0.3em] uppercase" style={{ color: B.pinkLt }}>
                {info.label ?? "Borang Pendaftaran Walk-in"}
              </p>
              <h1 className="pk-card-in text-4xl md:text-6xl font-black text-white leading-[1.1] tracking-tight"
                style={{ animationDelay: ".05s", textShadow: `0 0 40px ${B.pink}40` }}>
                Malaysia Techlympics 2026
                <span className="block mt-2 text-2xl md:text-4xl font-extrabold"
                  style={{ color: B.pink, textShadow: `0 0 30px ${B.pink}60` }}>
                  WALK-IN COMPETITIONS
                </span>
              </h1>
              <p className="pk-card-in max-w-xl mx-auto text-sm leading-relaxed" style={{ color: "rgba(255,255,255,.55)", animationDelay: ".1s" }}>
                Daftar tempat anda untuk pertandingan walk-in — pilih pertandingan, tempah slot masa anda,
                dan hadir ke kaunter pendaftaran pada hari acara.
              </p>

              {/* Meta chips */}
              <div className="pk-card-in flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: ".15s" }}>
                {info.event.venue && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10"
                    style={{ background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.65)" }}>
                    <MapPin className="h-3 w-3" style={{ color: B.pink }} />{info.event.venue}
                  </span>
                )}
                {info.event.startDate && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10"
                    style={{ background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.65)" }}>
                    <CalendarDays className="h-3 w-3" style={{ color: B.pinkLt }} />
                    {new Date(info.event.startDate).toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}
                    {info.event.endDate && info.event.endDate !== info.event.startDate &&
                      ` – ${new Date(info.event.endDate).toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}`}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border"
                  style={{ background: "rgba(236,72,153,.08)", borderColor: "rgba(236,72,153,.25)", color: B.pinkLt }}>
                  <Trophy className="h-3 w-3" />{info.competitions.length} Pertandingan
                </span>
              </div>

              {/* CTAs */}
              <div className="pk-card-in flex flex-wrap items-center justify-center gap-3 pt-2" style={{ animationDelay: ".2s" }}>
                <a href="#pertandingan"
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.03] active:scale-[.97]"
                  style={{ background: `linear-gradient(90deg, ${B.pinkDk}, ${B.pink})`, boxShadow: `0 8px 30px ${B.pink}40` }}>
                  Daftar Sekarang <ChevronRight className="h-4 w-4" />
                </a>
                <a href="#cara"
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold border border-pink-500/20 text-white/70 transition-colors hover:border-pink-500/40 hover:text-white">
                  Cara Pendaftaran
                </a>
              </div>

              {/* QR Code */}
              <div className="pk-card-in pt-4 flex flex-col items-center gap-2" style={{ animationDelay: ".25s" }}>
                <div className="rounded-xl p-3 border border-pink-500/20" style={{ background: "rgba(255,255,255,.95)" }}>
                  <QRCodeCanvas
                    value={typeof window !== "undefined" ? window.location.href : `https://techlympics.my/borang/${slug}`}
                    size={120}
                    level="H"
                    marginSize={1}
                    imageSettings={{
                      src: "/logo-mt.svg",
                      x: undefined,
                      y: undefined,
                      height: 24,
                      width: 24,
                      excavate: true,
                    }}
                  />
                </div>
                <p className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Imbas untuk mendaftar</p>
              </div>
            </div>
          </section>

          {/* ── How it works ── */}
          <section id="cara" className="w-full max-w-5xl mx-auto px-6 pb-14 space-y-5">
            <p className="text-center text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "rgba(255,255,255,.4)" }}>
              Pendaftaran dalam 3 langkah
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.title} className="pk-card-in rounded-2xl border border-pink-500/10 p-5 space-y-3"
                  style={{ background: "rgba(236,72,153,.03)", backdropFilter: "blur(8px)", animationDelay: `${0.1 + i * 0.08}s` }}>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 rounded-xl items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${B.pinkDk}, ${B.pink})` }}>
                      <s.icon className="h-4 w-4 text-white" />
                    </span>
                    <span className="text-[10px] font-extrabold font-mono" style={{ color: "rgba(255,255,255,.25)" }}>
                      0{i + 1}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">{s.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,.45)" }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── IC entry + Competitions ── */}
          <section id="pertandingan" className="w-full max-w-3xl mx-auto px-6 pb-16 space-y-5">
            <div className="text-center space-y-1">
              <p className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: B.pinkLt }}>
                Pilih Pertandingan
              </p>
              <p className="text-xl font-extrabold text-white">Pertandingan Walk-in</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,.4)" }}>
                Masukkan IC anda dahulu, kemudian pilih pertandingan.
              </p>
            </div>

            {/* IC input on landing page */}
            <div className="max-w-sm mx-auto space-y-1.5">
              <label className="block text-[10px] font-bold tracking-[0.18em] uppercase text-center" style={{ color: B.pinkLt }}>
                No. Kad Pengenalan
              </label>
              <div className="relative">
                <input value={ic}
                  onChange={e => { const v = e.target.value.replace(/[^\d]/g, "").slice(0, 12); setIc(v); checkIc(v); }}
                  placeholder="cth. 120315045678" inputMode="numeric"
                  className={`${inputCls} font-mono text-center`} style={inputStyle} />
                {icChecking && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin" style={{ color: B.pink }} />}
              </div>
              <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,.25)" }}>6–12 digit, tanpa sengkang</p>
              {usedCompIds.size > 0 && info.uniqueParticipation && (
                <p className="text-[10px] text-center text-red-400 font-semibold pt-1">
                  IC ini sudah didaftarkan. Hanya satu penyertaan dibenarkan.
                </p>
              )}
            </div>
            <div className={`grid gap-3 ${info.competitions.length > 1 ? "md:grid-cols-2" : ""}`}>
              {info.competitions.map((c, i) => (
                (() => {
                  const blocked = usedCompIds.has(c.id) || (info.uniqueParticipation && usedCompIds.size > 0);
                  return (
                    <button key={c.id} type="button"
                      onClick={() => !blocked && setComp(c)}
                      disabled={blocked}
                      className={`pk-card-in w-full text-left rounded-2xl border p-4 flex flex-col gap-2.5 transition-all ${
                        blocked
                          ? "border-white/5 opacity-40 cursor-not-allowed"
                          : "border-pink-500/10 hover:border-pink-500/30 hover:scale-[1.01]"
                      }`}
                      style={{ background: blocked ? "rgba(255,255,255,.02)" : "rgba(236,72,153,.04)", backdropFilter: "blur(8px)", animationDelay: `${i * 0.06}s` }}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{ background: "rgba(236,72,153,.1)", color: B.pinkLt }}>
                          {c.competition.code}
                        </span>
                        {blocked ? (
                          <span className="text-[9px] font-bold tracking-widest uppercase text-red-400">
                            Sudah didaftarkan
                          </span>
                        ) : c.walkInSlotSchedule ? (
                          <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: B.pink }}>
                            Tempahan slot
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-bold text-white leading-snug">{c.competition.name}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px]" style={{ color: "rgba(255,255,255,.4)" }}>
                          {c._count.registrations} daftar{c.maxSlots > 0 ? ` / ${c.maxSlots} slot` : ""}
                        </p>
                        {!blocked && <ChevronRight className="h-4 w-4" style={{ color: B.pink }} />}
                      </div>
                    </button>
                  );
                })()
              ))}
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="border-t mt-auto" style={{ borderColor: "rgba(236,72,153,.1)" }}>
            <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
              <TechHeader compact />
              <p className="text-[10px] text-right" style={{ color: "rgba(255,255,255,.3)" }}>
                Malaysia Techlympics 2026 · Walk-in Competitions
              </p>
            </div>
          </footer>
        </main>
      ) : (
        /* ── Registration form (2-step wizard) ── */
        <main className="relative z-10 flex-1 w-full max-w-2xl mx-auto px-6 py-8">
          <div className="pk-card-in rounded-2xl border border-pink-500/20 overflow-hidden"
            style={{ background: "rgba(236,72,153,.04)", backdropFilter: "blur(12px)" }}>
            <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${B.pinkDk}, ${B.pink}, ${B.pinkLt})` }} />

            {/* Stepper header */}
            <div className="px-6 pt-6 pb-3">
              {/* Back to competition selection */}
              <button type="button" onClick={() => { setComp(null); setFormErr(""); setFormStep(1); }}
                className="flex items-center gap-2 text-left w-full mb-4 group">
                <ChevronLeft className="h-4 w-4 shrink-0" style={{ color: B.pink }} />
                <p className="text-sm font-bold text-white truncate">
                  <span className="font-mono text-xs mr-1.5" style={{ color: "rgba(255,255,255,.35)" }}>{comp.competition.code}</span>
                  {comp.competition.name}
                </p>
              </button>

              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {[
                  { n: 1, icon: User,       label: "Maklumat Diri" },
                  { n: 2, icon: LayoutGrid, label: "Pilih Slot" },
                ].map((step, idx) => (
                  <div key={step.n} className="flex items-center gap-2 flex-1">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="inline-flex h-8 w-8 rounded-full items-center justify-center shrink-0 transition-all"
                        style={formStep >= step.n
                          ? { background: `linear-gradient(135deg, ${B.pinkDk}, ${B.pink})`, boxShadow: `0 0 12px ${B.pink}40` }
                          : { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>
                        {formStep > step.n
                          ? <CheckCircle2 className="h-4 w-4 text-white" />
                          : <step.icon className="h-4 w-4" style={{ color: formStep >= step.n ? "#fff" : "rgba(255,255,255,.3)" }} />}
                      </div>
                      <span className="text-[11px] font-bold tracking-wide transition-colors"
                        style={{ color: formStep >= step.n ? B.pinkLt : "rgba(255,255,255,.3)" }}>
                        {step.label}
                      </span>
                    </div>
                    {idx === 0 && (
                      <div className="h-px flex-1 mx-1" style={{
                        background: formStep > step.n ? B.pink : "rgba(255,255,255,.1)",
                        transition: "background .3s",
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 space-y-4">
              {/* ── Step 1: Personal details ── */}
              {formStep === 1 && (
                <div className="space-y-4 pk-card-in">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5" style={{ color: B.pinkLt }}>
                        No. Kad Pengenalan
                      </label>
                      <input value={ic} onChange={e => { const v = e.target.value.replace(/[^\d]/g, "").slice(0, 12); setIc(v); checkIc(v); }}
                        placeholder="cth. 120315045678" inputMode="numeric"
                        className={`${inputCls} font-mono`} style={inputStyle} />
                      <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,.25)" }}>6–12 digit, tanpa sengkang</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5" style={{ color: B.pinkLt }}>
                        Nama Penuh
                      </label>
                      <input value={name} onChange={e => setName(e.target.value)}
                        placeholder="Nama seperti dalam kad pengenalan"
                        className={inputCls} style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5" style={{ color: B.pinkLt }}>
                        Nama Sekolah <span className="normal-case font-normal text-white/30">(pilihan)</span>
                      </label>
                      <input value={schoolName} onChange={e => setSchoolName(e.target.value)}
                        placeholder="cth. SK Bandar Utama"
                        className={inputCls} style={inputStyle} />
                    </div>
                  </div>

                  {formErr && (
                    <p className="text-xs flex items-start gap-1.5" style={{ color: B.pinkLt }}>
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />{formErr}
                    </p>
                  )}

                  <button type="button"
                    onClick={() => {
                      if (ic.length < 6) { setFormErr("No. IC mestilah sekurang-kurangnya 6 digit."); return; }
                      if (name.trim().length < 3) { setFormErr("Sila isikan nama penuh anda."); return; }
                      setFormErr("");
                      setFormStep(2);
                      if (cfg && slotSessions && slotSessions.length > 0 && activeSession === null) {
                        setActiveSession(slotSessions[0].n);
                      }
                    }}
                    className="w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[.98]"
                    style={{ background: `linear-gradient(90deg, ${B.pinkDk}, ${B.pink})`, color: "white" }}>
                    Seterusnya <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* ── Step 2: Session tabs + slot picker ── */}
              {formStep === 2 && (
                <div className="space-y-4 pk-card-in">
                  {/* Summary of step 1 */}
                  <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                    style={{ background: "rgba(236,72,153,.06)", border: "1px solid rgba(236,72,153,.15)" }}>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: B.pinkLt }}>Maklumat</p>
                      <p className="text-xs text-white truncate font-mono">{ic}</p>
                      <p className="text-xs text-white truncate">{name}{schoolName && ` · ${schoolName}`}</p>
                    </div>
                    <button type="button" onClick={() => setFormStep(1)}
                      className="text-[10px] font-bold uppercase tracking-wide shrink-0 ml-2 hover:underline"
                      style={{ color: B.pinkLt }}>
                      Ubah
                    </button>
                  </div>

                  {cfg ? (
                    <>
                      {/* Legend */}
                      <div className="flex items-center gap-2.5 text-[9px]" style={{ color: "rgba(255,255,255,.4)" }}>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(236,72,153,.2)" }} /> Tersedia
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "rgba(255,255,255,.04)" }} /> Penuh
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: B.pink }} /> Pilihan
                        </span>
                      </div>

                      {/* Session tabs */}
                      {slotsLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8" style={{ color: "rgba(255,255,255,.4)" }}>
                          <Loader2 className="h-4 w-4 animate-spin" style={{ color: B.pink }} />
                          <span className="text-xs">Memuatkan slot…</span>
                        </div>
                      ) : slotSessions && slotSessions.length > 0 ? (
                        <>
                          {/* Side-by-side: session tabs on left, slot grid on right */}
                          <div className="flex gap-4">
                            {/* Session tabs (vertical sidebar) */}
                            <div className="flex flex-col gap-1 shrink-0">
                              {slotSessions.map(s => {
                                const avail = cfg.slotsPerSession - s.booked.length;
                                const isActive = activeSession === s.n;
                                const isFull = avail === 0;
                                return (
                                  <button key={s.n} type="button"
                                    disabled={isFull}
                                    onClick={() => setActiveSession(s.n)}
                                    className="w-full rounded-lg px-3 py-2 text-left transition-all"
                                    style={isActive
                                      ? { background: `linear-gradient(135deg, ${B.pinkDk}, ${B.pink})`, boxShadow: `0 3px 12px ${B.pink}30` }
                                      : isFull
                                        ? { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)", cursor: "not-allowed" }
                                        : { background: "rgba(255,255,255,.06)", border: "1px solid rgba(236,72,153,.15)" }}>
                                    <p className="text-[11px] font-bold" style={{ color: isActive ? "#fff" : isFull ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)" }}>
                                      Sesi {s.n}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Slot grid */}
                            <div className="flex-1 min-w-0">
                              {activeSession !== null && (() => {
                                const s = slotSessions.find(ss => ss.n === activeSession);
                                if (!s) return null;
                                return (
                                  <div className="space-y-3">
                                    <div className="space-y-1">
                                      <p className="text-base font-bold text-white">
                                        Sesi {s.n}
                                      </p>
                                      <p className="text-sm font-mono" style={{ color: "rgba(255,255,255,.7)" }}>
                                        {fmtSlotMin(s.start)} – {fmtSlotMin(s.end)}
                                      </p>
                                      <p className="text-xs font-bold" style={{ color: (cfg.slotsPerSession - s.booked.length) <= 2 ? B.pinkLt : "rgba(255,255,255,.5)" }}>
                                        {cfg.slotsPerSession - s.booked.length}/{cfg.slotsPerSession} slot tersedia
                                      </p>
                                    </div>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                      {Array.from({ length: cfg.slotsPerSession }, (_, i) => i + 1).map(slot => {
                                        const isBooked = s.booked.includes(slot);
                                        const isSel = slotChoice?.sessionNumber === s.n && slotChoice?.slotNumber === slot;
                                        return (
                                          <button key={slot} type="button"
                                            disabled={isBooked || submitting}
                                            onClick={() => setSlotChoice({ sessionNumber: s.n, slotNumber: slot })}
                                            className="h-11 rounded-lg text-sm font-bold transition-all"
                                            style={isBooked
                                              ? { background: "repeating-linear-gradient(135deg, #0a0a0a, #0a0a0a 3px, #151515 3px, #151515 6px)", color: "rgba(255,255,255,.15)", cursor: "not-allowed", textDecoration: "line-through" }
                                              : isSel
                                                ? { background: B.pink, color: "#fff", boxShadow: `0 0 12px ${B.pink}50`, transform: "scale(1.05)" }
                                                : { background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.75)", border: "1px solid rgba(236,72,153,.15)" }}>
                                            {slot}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                              {activeSession === null && (
                                <p className="text-xs py-6 text-center" style={{ color: "rgba(255,255,255,.3)" }}>
                                  Pilih sesi di sebelah kiri untuk melihat slot.
                                </p>
                              )}
                            </div>
                          </div>

                          {slotChoice && selectedSlotSession && (
                            <p className="text-[11px] font-semibold rounded-lg px-3 py-2"
                              style={{ background: "rgba(236,72,153,.1)", color: B.pinkLt, border: "1px solid rgba(236,72,153,.3)" }}>
                              Pilihan: Sesi {slotChoice.sessionNumber} · Slot {slotChoice.slotNumber} ({fmtSlotMin(selectedSlotSession.start)} – {fmtSlotMin(selectedSlotSession.end)})
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,.4)" }}>
                          Tiada slot tersedia untuk pertandingan ini.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,.4)" }}>
                      Pertandingan ini tidak memerlukan tempahan slot.
                    </p>
                  )}

                  {formErr && (
                    <p className="text-xs flex items-start gap-1.5" style={{ color: B.pinkLt }}>
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />{formErr}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setFormStep(1); setFormErr(""); }}
                      className="flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all border"
                      style={{ borderColor: "rgba(236,72,153,.2)", color: "rgba(255,255,255,.6)" }}>
                      <ChevronLeft className="h-4 w-4" /> Kembali
                    </button>
                    <button type="button" onClick={handleSubmit}
                      disabled={submitting || (cfg ? !slotChoice || slotsLoading || !slotSessions : false)}
                      className="flex-[2] h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[.98] disabled:opacity-50"
                      style={{ background: `linear-gradient(90deg, ${B.pinkDk}, ${B.pink})`, color: "white" }}>
                      {submitting
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <ClipboardList className="h-4 w-4" />}
                      Hantar Borang
                    </button>
                  </div>
                </div>
              )}

              <p className="text-center text-[10px]" style={{ color: "rgba(255,255,255,.25)" }}>
                Borang akan disemak di kaunter pendaftaran pada hari acara.
              </p>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
