import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { computeFinalProgramData } from "@/lib/reports/finalProgramData";
import Link from "next/link";
import { Fragment } from "react";
import { ArrowLeft, MapPin, Mars, Venus } from "lucide-react";
import { PrintButton } from "@/components/organizer/events/PrintButton";
import { FinalProgramExportButtons } from "@/components/organizer/events/FinalProgramExportButtons";

export const metadata: Metadata = { title: "Laporan Akhir Program" };

function pct(n: number, total: number): string {
  if (!total) return "0.0";
  return ((n / total) * 100).toFixed(1);
}

function n(value: number): string {
  return value === 0 ? "" : value.toLocaleString();
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

// ── shared style tokens ────────────────────────────────────────────────────────
const TH = "px-3 py-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-100 bg-slate-700";
const TH_LEFT = "px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-100 bg-slate-700";
const TD = "px-3 py-1.5 text-slate-700 text-xs";
const TD_NUM = "px-3 py-1.5 text-center font-mono font-bold text-slate-900 text-xs tabular-nums";
const TD_LABEL = "px-3 py-1.5 text-slate-700 text-xs font-medium";
const TR_ODD = "bg-white";
const TR_EVEN = "bg-slate-50";

export default async function FinalProgramReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true,
      venue: true,
      city: true,
      startDate: true,
      endDate: true,
      state: { select: { name: true } },
    },
  });
  if (!event) notFound();

  const d = await computeFinalProgramData(event.id);
  if (!d) notFound();

  const pesertaUtama = d.regSummary.schoolParticipants + d.regSummary.beliaParticipants;
  const jumlahPeserta = pesertaUtama + d.walkInSummary.total;
  const grandTotal = jumlahPeserta + d.trainerCount;

  const venueLine = [event.venue, event.city, event.state?.name].filter(Boolean).join(" · ");
  const startStr = event.startDate ? fmtDate(event.startDate) : null;
  const endStr = event.endDate ? fmtDate(event.endDate) : null;
  const dateLine = startStr
    ? endStr && endStr !== startStr
      ? `${startStr} — ${endStr}`
      : startStr
    : null;

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      {/* ── masthead ────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 px-6 pt-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href={`/organizer/events/${slug}/manage/reports`}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-3 print:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali
            </Link>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500 mb-1">
              Laporan Akhir Program
            </p>
            <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-tight">
              {d.eventName}
            </h1>
            {(venueLine || dateLine) && (
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-zinc-400">
                {venueLine && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {venueLine}
                  </span>
                )}
                {dateLine && <span>{dateLine}</span>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0 print:hidden">
            <FinalProgramExportButtons eventId={event.id} />
            <PrintButton />
          </div>
        </div>
      </div>

      {/* ── report body ─────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-6 print:px-0 print:py-0 bg-slate-100 min-h-screen">

        {/* ══ RINGKASAN KESELURUHAN ══════════════════════════════════════════ */}
        <div className="overflow-hidden rounded-sm">
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 block">
                Ringkasan Keseluruhan
              </span>
              <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                Penyertaan dan Penglibatan
                {d.locationLabel ? ` — ${d.locationLabel.toUpperCase()}` : ""}
              </span>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Jumlah Keseluruhan</p>
              <p className="text-2xl font-black text-white tabular-nums leading-none mt-0.5">
                {grandTotal.toLocaleString()}
              </p>
            </div>
          </div>
          <table className="w-full">
            <tbody>
              <tr className={TR_ODD}>
                <td className={TD_LABEL}>1. Peserta Utama</td>
                <td className={`${TD_NUM} text-right pr-4`}>{n(pesertaUtama)}</td>
              </tr>
              <tr className={TR_EVEN}>
                <td className={TD_LABEL}>2. Peserta Walk-in</td>
                <td className={`${TD_NUM} text-right pr-4`}>{n(d.walkInSummary.total)}</td>
              </tr>
              <tr className={TR_ODD}>
                <td className={TD_LABEL}>3. Jurulatih</td>
                <td className={`${TD_NUM} text-right pr-4`}>{n(d.trainerCount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ══ RINGKASAN ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">

          {/* Left: registration + gender summary */}
          <div className="overflow-hidden rounded-sm bg-white">
            {/* masthead */}
            <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                Ringkasan Laporan Statistik
              </span>
              <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                Penyertaan{d.locationLabel ? ` — ${d.locationLabel.toUpperCase()}` : ""}
              </span>
            </div>

            {/* BERDAFTAR */}
            <div className="bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 mt-0">
              Berdaftar
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${TH_LEFT} w-1/2`}>&nbsp;</th>
                  <th className={TH}>Pelajar</th>
                  <th className={TH}>Belia</th>
                  <th className={TH}>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr className={TR_ODD}>
                  <td className={TD_LABEL}>Kontinjen Sekolah / Belia</td>
                  <td className={TD_NUM}>{n(d.regSummary.schoolContingents)}</td>
                  <td className={TD_NUM}>{n(d.regSummary.beliaContingents)}</td>
                  <td className="px-3 py-1.5 text-center font-mono font-black text-slate-900 text-xs tabular-nums">
                    {n(d.regSummary.schoolContingents + d.regSummary.beliaContingents)}
                  </td>
                </tr>
                <tr className={TR_EVEN}>
                  <td className={`${TD} pl-6`}>↳ Sekolah Rendah</td>
                  <td className={TD_NUM}>{n(d.regSummary.rendahContingents)}</td>
                  <td className={`${TD} text-center text-slate-400`}>—</td>
                  <td className={TD_NUM}>{n(d.regSummary.rendahContingents)}</td>
                </tr>
                <tr className={TR_ODD}>
                  <td className={`${TD} pl-6`}>↳ Sekolah Menengah</td>
                  <td className={TD_NUM}>{n(d.regSummary.menengahContingents)}</td>
                  <td className={`${TD} text-center text-slate-400`}>—</td>
                  <td className={TD_NUM}>{n(d.regSummary.menengahContingents)}</td>
                </tr>
                <tr className={TR_EVEN}>
                  <td className={`${TD} pl-6`}>↳ Belia</td>
                  <td className={`${TD} text-center text-slate-400`}>—</td>
                  <td className={TD_NUM}>{n(d.regSummary.beliaContingents)}</td>
                  <td className={TD_NUM}>{n(d.regSummary.beliaContingents)}</td>
                </tr>
                <tr className="bg-slate-100">
                  <td className={TD_LABEL}>Jumlah Pasukan</td>
                  <td className={TD_NUM}>{n(d.regSummary.schoolTeams)}</td>
                  <td className={TD_NUM}>{n(d.regSummary.beliaTeams)}</td>
                  <td className={TD_NUM}>{n(d.regSummary.schoolTeams + d.regSummary.beliaTeams)}</td>
                </tr>
                <tr className="bg-slate-100">
                  <td className={TD_LABEL}>Jumlah Peserta</td>
                  <td className={TD_NUM}>{n(d.regSummary.schoolParticipants)}</td>
                  <td className={TD_NUM}>{n(d.regSummary.beliaParticipants)}</td>
                  <td className="px-3 py-1.5 text-center font-mono font-black text-slate-900 text-xs tabular-nums">
                    {n(d.regSummary.schoolParticipants + d.regSummary.beliaParticipants)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* WALK-IN */}
            <div className="bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 mt-2">
              Walk-In
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${TH_LEFT} w-1/2`}>&nbsp;</th>
                  <th className={TH}>Pelajar</th>
                  <th className={TH}>Belia</th>
                  <th className={TH}>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr className={TR_ODD}>
                  <td className={TD_LABEL}>Jumlah Peserta</td>
                  <td className={TD_NUM}>{n(d.walkInSummary.schoolParticipants)}</td>
                  <td className={TD_NUM}>{n(d.walkInSummary.beliaParticipants)}</td>
                  <td className="px-3 py-1.5 text-center font-mono font-black text-slate-900 text-xs tabular-nums">
                    {n(d.walkInSummary.total)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* GRAND TOTAL */}
            <div className="bg-slate-900 px-4 py-3 flex items-center justify-between mt-2">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                  Berdaftar + Walk-In
                </div>
                <div className="text-xs font-black text-slate-200 uppercase tracking-wide">
                  Jumlah Keseluruhan Peserta
                </div>
              </div>
              <div className="text-3xl font-black font-mono text-white tabular-nums">
                {n(jumlahPeserta)}
              </div>
            </div>

          </div>

          {/* Right: Ethnicity + Jantina stacked */}
          <div className="flex flex-col gap-3">

            {/* Kaum */}
            <div className="overflow-hidden rounded-sm">
              <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                  Bagi Laporan ke KBS — Inisiatif Rakan Muda
                </span>
                <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                  Jumlah Peserta Mengikut Kaum
                </span>
              </div>

              {(() => {
                const cols = [
                  { label: "Melayu",    value: d.ethnicityStats.melayu },
                  { label: "Cina",      value: d.ethnicityStats.cina },
                  { label: "India",     value: d.ethnicityStats.india },
                  { label: "Org. Asli", value: d.ethnicityStats.orgAsli },
                  { label: "Sabah",     value: d.ethnicityStats.sabah },
                  { label: "Sarawak",   value: d.ethnicityStats.sarawak },
                  { label: "Lain-Lain", value: d.ethnicityStats.lainLain },
                ];
                const total = cols.reduce((s, c) => s + c.value, 0);
                return (
                  <table className="w-full table-fixed">
                    <colgroup>
                      {cols.map(c => (
                        <col key={c.label} style={{ width: `${(100 / cols.length).toFixed(4)}%` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-700">
                        {cols.map(c => (
                          <th
                            key={c.label}
                            className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-200"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        {cols.map(c => (
                          <td
                            key={c.label}
                            className="py-3 text-center"
                          >
                            <div className="text-xl font-black font-mono text-slate-900 leading-none">
                              {n(c.value)}
                            </div>
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-slate-50">
                        {cols.map(c => (
                          <td
                            key={c.label}
                            className="px-1.5 py-1.5 text-center"
                          >
                            <div className="text-[9px] font-semibold text-slate-500 tabular-nums">
                              {total ? ((c.value / total) * 100).toFixed(1) : "0.0"}%
                            </div>
                            <div className="mt-1 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-slate-700"
                                style={{ width: total ? `${(c.value / total) * 100}%` : "0%" }}
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900">
                        <td colSpan={cols.length} className="px-4 py-1.5 text-right">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-2">
                            Jumlah Keseluruhan
                          </span>
                          <span className="text-sm font-black font-mono text-white">
                            {n(total)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                );
              })()}
            </div>

            {/* Jantina */}
            <div className="overflow-hidden rounded-sm">
              <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                  Ringkasan Statistik
                </span>
                <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                  Jantina Peserta
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 bg-white p-3">
                {/* School gender */}
                <div>
                  <div className="bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300">
                    Jantina — Pelajar
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={TH_LEFT}>&nbsp;</th>
                        <th className={TH}>Bil.</th>
                        <th className={TH}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-indigo-50">
                        <td className="px-3 py-2 text-xs font-semibold text-indigo-900"><span className="flex items-center gap-1"><Mars className="w-3.5 h-3.5" /> Lelaki</span></td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-indigo-900 text-sm tabular-nums">{n(d.schoolMale)}</td>
                        <td className="px-3 py-2 text-center text-xs text-indigo-700 tabular-nums">{pct(d.schoolMale, d.schoolMale + d.schoolFemale)}%</td>
                      </tr>
                      <tr className="bg-rose-50">
                        <td className="px-3 py-2 text-xs font-semibold text-rose-900"><span className="flex items-center gap-1"><Venus className="w-3.5 h-3.5" /> Perempuan</span></td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-rose-900 text-sm tabular-nums">{n(d.schoolFemale)}</td>
                        <td className="px-3 py-2 text-center text-xs text-rose-700 tabular-nums">{pct(d.schoolFemale, d.schoolMale + d.schoolFemale)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Belia gender */}
                <div>
                  <div className="bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300">
                    Jantina — Belia
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={TH_LEFT}>&nbsp;</th>
                        <th className={TH}>Bil.</th>
                        <th className={TH}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-indigo-50">
                        <td className="px-3 py-2 text-xs font-semibold text-indigo-900"><span className="flex items-center gap-1"><Mars className="w-3.5 h-3.5" /> Lelaki</span></td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-indigo-900 text-sm tabular-nums">{n(d.beliaMale)}</td>
                        <td className="px-3 py-2 text-center text-xs text-indigo-700 tabular-nums">{pct(d.beliaMale, d.beliaMale + d.beliaFemale)}%</td>
                      </tr>
                      <tr className="bg-rose-50">
                        <td className="px-3 py-2 text-xs font-semibold text-rose-900"><span className="flex items-center gap-1"><Venus className="w-3.5 h-3.5" /> Perempuan</span></td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-rose-900 text-sm tabular-nums">{n(d.beliaFemale)}</td>
                        <td className="px-3 py-2 text-center text-xs text-rose-700 tabular-nums">{pct(d.beliaFemale, d.beliaMale + d.beliaFemale)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ══ LAPORAN TERPERINCI ═════════════════════════════════════════════ */}
        <div className="overflow-hidden rounded-sm">
          <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
              Statistik Penyertaan{d.locationLabel ? ` — ${d.locationLabel.toUpperCase()}` : ""}
            </span>
            <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
              Laporan Terperinci Mengikut Negeri
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH_LEFT}>Negeri</th>
                <th className={TH}>Kont. Sekolah</th>
                <th className={TH}>Sek. Rendah</th>
                <th className={TH}>Sek. Menengah</th>
                <th className={TH}>Kont. Belia</th>
                <th className={TH}>Pasukan</th>
                <th className={TH}>Peserta</th>
                <th className={TH}>Lelaki</th>
                <th className={TH}>Perempuan</th>
              </tr>
            </thead>
            <tbody>
              {d.stateStats.map((s, i) => (
                <tr key={s.stateName} className={i % 2 === 0 ? TR_ODD : TR_EVEN}>
                  <td className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-700 text-white">
                    {s.stateName}
                  </td>
                  <td className={TD_NUM}>{n(s.schoolC)}</td>
                  <td className={TD_NUM}>{n(s.rendahC)}</td>
                  <td className={TD_NUM}>{n(s.menengahC)}</td>
                  <td className={TD_NUM}>{n(s.beliaC)}</td>
                  <td className="px-3 py-1.5 text-center text-xs font-mono font-bold text-slate-900 tabular-nums">
                    {n(s.totalTeams)}
                    {s.bTeams > 0 && (
                      <span className="ml-1 text-[9px] font-normal text-slate-500">
                        ({s.rTeams + s.mTeams}+{s.bTeams}B)
                      </span>
                    )}
                  </td>
                  <td className={TD_NUM}>{n(s.participants)}</td>
                  <td className={TD_NUM}>{n(s.male)}</td>
                  <td className={TD_NUM}>{n(s.female)}</td>
                </tr>
              ))}
              {(() => {
                const tot = d.stateStats.reduce(
                  (acc, s) => ({
                    schoolC: acc.schoolC + s.schoolC,
                    rendahC: acc.rendahC + s.rendahC,
                    menengahC: acc.menengahC + s.menengahC,
                    beliaC: acc.beliaC + s.beliaC,
                    totalTeams: acc.totalTeams + s.totalTeams,
                    participants: acc.participants + s.participants,
                    male: acc.male + s.male,
                    female: acc.female + s.female,
                  }),
                  { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, totalTeams: 0, participants: 0, male: 0, female: 0 },
                );
                return (
                  <tr className="bg-slate-900 text-white">
                    <td className="px-3 py-2 text-xs font-black uppercase tracking-widest">
                      Jumlah
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.schoolC)}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.rendahC)}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.menengahC)}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.beliaC)}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.totalTeams)}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.participants)}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.male)}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">{n(tot.female)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>

        {/* ══ 1. MENGIKUT TAHAP PENDIDIKAN ══════════════════════════════════ */}
        <div className="overflow-hidden rounded-sm">
          <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
              Seksyen 1
            </span>
            <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
              Penyertaan Mengikut Tahap Pendidikan
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${TH_LEFT} w-44`}>Tahap Pendidikan</th>
                <th className={`${TH} w-20`}>Kod</th>
                <th className={TH_LEFT}>Pertandingan</th>
                <th className={`${TH} w-20`}>Pasukan</th>
                <th className={`${TH} w-24`}>Peserta</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: "Sekolah Rendah",
                  comps: d.rendahComps,
                  labelCls: "bg-indigo-800 text-white",
                  subCls: "bg-indigo-50",
                  totCls: "bg-indigo-100 text-indigo-900",
                },
                {
                  label: "Sekolah Menengah",
                  comps: d.menengahComps,
                  labelCls: "bg-amber-800 text-white",
                  subCls: "bg-amber-50",
                  totCls: "bg-amber-100 text-amber-900",
                },
                {
                  label: "Belia",
                  comps: d.beliaComps,
                  labelCls: "bg-teal-800 text-white",
                  subCls: "bg-teal-50",
                  totCls: "bg-teal-100 text-teal-900",
                },
              ].map(g =>
                g.comps.length ? (
                  <Fragment key={g.label}>
                    {g.comps.map((c, i) => (
                      <tr key={c.code} className={g.subCls}>
                        {i === 0 && (
                          <td
                            className={`px-3 py-2 text-xs font-black uppercase tracking-wide align-top ${g.labelCls}`}
                            rowSpan={g.comps.length + 1}
                          >
                            {g.label}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-center font-mono text-xs text-slate-700">
                          {c.code}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-700">
                          {c.name}
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono font-bold text-xs text-slate-900 tabular-nums">
                          {n(c.teams)}
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono font-bold text-xs text-slate-900 tabular-nums">
                          {n(c.participants)}
                        </td>
                      </tr>
                    ))}
                    <tr className={`${g.totCls} font-semibold`}>
                      <td className="px-3 py-1.5 text-right text-xs" colSpan={2}>
                        Jumlah {g.label}:
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono font-black text-sm tabular-nums">
                        {n(g.comps.reduce((s, c) => s + c.teams, 0))}
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono font-black text-sm tabular-nums">
                        {n(g.comps.reduce((s, c) => s + c.participants, 0))}
                      </td>
                    </tr>
                  </Fragment>
                ) : null,
              )}
            </tbody>
          </table>
        </div>

        {/* ══ 2. MENGIKUT NEGERI ════════════════════════════════════════════ */}
        <div className="overflow-hidden rounded-sm">
          <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
              Seksyen 2
            </span>
            <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
              Penyertaan Mengikut Negeri
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${TH_LEFT} w-44`}>Negeri</th>
                <th className={`${TH} w-20`}>Kod</th>
                <th className={TH_LEFT}>Pertandingan</th>
                <th className={`${TH} w-20`}>Pasukan</th>
                <th className={`${TH} w-24`}>Peserta</th>
              </tr>
            </thead>
            <tbody>
              {d.stateCompStats.map((sg, si) => {
                const totalTeams = sg.comps.reduce((s, c) => s + c.teams, 0);
                const totalPax   = sg.comps.reduce((s, c) => s + c.participants, 0);
                const isEven     = si % 2 === 0;
                const rowBg      = isEven ? "bg-white" : "bg-slate-50";
                return (
                  <Fragment key={sg.stateName}>
                    {sg.comps.map((c, ci) => (
                      <tr key={`${sg.stateName}-${c.code}`} className={rowBg}>
                        {ci === 0 && (
                          <td
                            className="px-3 py-1.5 text-xs font-black uppercase tracking-wide align-top bg-slate-700 text-white"
                            rowSpan={sg.comps.length + 1}
                          >
                            {sg.stateName}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-center font-mono text-xs text-slate-700">
                          {c.code}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-700">
                          {c.name}
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono font-bold text-xs text-slate-900 tabular-nums">
                          {n(c.teams)}
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono font-bold text-xs text-slate-900 tabular-nums">
                          {n(c.participants)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-200 font-semibold">
                      <td className="px-3 py-1.5 text-right text-xs text-slate-700" colSpan={2}>
                        Jumlah {sg.stateName}:
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono font-black text-sm text-slate-900 tabular-nums">
                        {n(totalTeams)}
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono font-black text-sm text-slate-900 tabular-nums">
                        {n(totalPax)}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </OrganizerShell>
  );
}
