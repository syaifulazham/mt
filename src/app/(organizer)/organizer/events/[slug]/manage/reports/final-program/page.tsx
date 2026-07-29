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

function PctRow({ vals, labels, total, bg }: { vals: number[]; labels: string[]; total: number; bg: string }) {
  return (
    <tr className={bg}>
      {vals.map((v, i) => (
        <td key={labels[i]} className="px-1.5 py-1.5 text-center">
          <div className="text-[9px] font-semibold text-slate-500 tabular-nums">
            {total ? ((v / total) * 100).toFixed(1) : "0.0"}%
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-slate-700" style={{ width: total ? `${(v / total) * 100}%` : "0%" }} />
          </div>
        </td>
      ))}
    </tr>
  );
}
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
          <div className="shrink-0 print:hidden">
            <FinalProgramExportButtons eventId={event.id} />
          </div>
        </div>
      </div>

      {/* ── report body ─────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-6 print:px-0 print:py-0 bg-slate-100 min-h-screen">

        {/* ══ RINGKASAN ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">

          {/* Left: overall summary + registration detail */}
          <div className="flex flex-col gap-4">

          {/* Penyertaan dan Penglibatan */}
          <div className="overflow-hidden rounded-sm">
            <div className="bg-[#7B0D1E] px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-rose-300 block">
                  Ringkasan Keseluruhan
                </span>
                <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                  Penyertaan dan Penglibatan
                  {d.locationLabel ? ` — ${d.locationLabel.toUpperCase()}` : ""}
                </span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-rose-300">Jumlah Keseluruhan</p>
                <p className="text-2xl font-black text-white tabular-nums leading-none mt-0.5">
                  {grandTotal.toLocaleString()}
                </p>
              </div>
            </div>
            <table className="w-full">
              <tbody>
                <tr className={TR_ODD}>
                  <td className="px-3 py-2 text-slate-700 text-sm font-black">Peserta Utama</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-slate-900 text-lg tabular-nums pr-4">{n(pesertaUtama)}</td>
                </tr>
                <tr className={TR_EVEN}>
                  <td className="px-3 py-2 text-slate-700 text-sm font-black">Peserta Walk-in</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-slate-900 text-lg tabular-nums pr-4">{n(d.walkInSummary.total)}</td>
                </tr>
                <tr className={TR_ODD}>
                  <td className="px-3 py-2 text-slate-700 text-sm font-black">Jurulatih</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-slate-900 text-lg tabular-nums pr-4">{n(d.trainerCount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Penyertaan stats */}
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
          </div>{/* end left flex col */}

          {/* Right: Ethnicity + Jantina stacked */}
          <div className="flex flex-col gap-3">

            {/* Kaum */}
            <div className="overflow-hidden rounded-sm">
              <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                  Laporan Taburan Penyertaan Kaum
                </span>
                <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                  Jumlah Peserta Mengikut Kaum
                </span>
              </div>

              {(() => {
                const labels = ["Melayu", "Cina", "India", "Org. Asli", "Sabah", "Sarawak", "Lain-Lain"];
                const regVals = [
                  d.ethnicityStats.melayu, d.ethnicityStats.cina, d.ethnicityStats.india,
                  d.ethnicityStats.orgAsli, d.ethnicityStats.sabah, d.ethnicityStats.sarawak, d.ethnicityStats.lainLain,
                ];
                const wiVals = [
                  d.walkInEthnicityStats.melayu, d.walkInEthnicityStats.cina, d.walkInEthnicityStats.india,
                  d.walkInEthnicityStats.orgAsli, d.walkInEthnicityStats.sabah, d.walkInEthnicityStats.sarawak, d.walkInEthnicityStats.lainLain,
                ];
                const regTotal = regVals.reduce((s, v) => s + v, 0);
                const wiTotal  = wiVals.reduce((s, v) => s + v, 0);
                const grandTotal = regTotal + wiTotal;

                return (
                  <table className="w-full table-fixed">
                    <colgroup>
                      {labels.map(l => (
                        <col key={l} style={{ width: `${(100 / labels.length).toFixed(4)}%` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-700">
                        {labels.map(l => (
                          <th key={l} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-200">
                            {l}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Berdaftar group */}
                      <tr className="bg-slate-800">
                        <td colSpan={labels.length} className="px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                          Peserta Berdaftar
                        </td>
                      </tr>
                      <tr className="bg-white">
                        {regVals.map((v, i) => (
                          <td key={labels[i]} className="py-3 text-center">
                            <div className="text-xl font-black font-mono text-slate-900 leading-none">{n(v)}</div>
                          </td>
                        ))}
                      </tr>
                      <PctRow vals={regVals} labels={labels} total={regTotal} bg="bg-slate-50" />
                      <tr className="bg-slate-200">
                        <td colSpan={labels.length} className="px-3 py-1 text-right text-[10px] text-slate-600">
                          <span className="font-semibold uppercase tracking-widest mr-2">Jumlah Berdaftar</span>
                          <span className="font-black font-mono text-slate-900">{n(regTotal)}</span>
                        </td>
                      </tr>

                      {/* Walk-In group */}
                      {wiTotal > 0 && (
                        <>
                          <tr className="bg-slate-800">
                            <td colSpan={labels.length} className="px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                              Peserta Walk-In
                            </td>
                          </tr>
                          <tr className="bg-white">
                            {wiVals.map((v, i) => (
                              <td key={labels[i]} className="py-3 text-center">
                                <div className="text-xl font-black font-mono text-slate-900 leading-none">{n(v)}</div>
                              </td>
                            ))}
                          </tr>
                          <PctRow vals={wiVals} labels={labels} total={wiTotal} bg="bg-slate-50" />
                          <tr className="bg-slate-200">
                            <td colSpan={labels.length} className="px-3 py-1 text-right text-[10px] text-slate-600">
                              <span className="font-semibold uppercase tracking-widest mr-2">Jumlah Walk-In</span>
                              <span className="font-black font-mono text-slate-900">{n(wiTotal)}</span>
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900">
                        <td colSpan={labels.length} className="px-4 py-1.5 text-right">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-2">
                            Jumlah Keseluruhan
                          </span>
                          <span className="text-sm font-black font-mono text-white">{n(grandTotal)}</span>
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

                {/* Walk-In gender separator + sections */}
                {d.walkInSummary.total > 0 && (
                  <>
                    <div className="col-span-2 border-t border-slate-200 pt-2 pb-0.5">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Walk-In</span>
                    </div>

                    {/* Walk-In: Pelajar */}
                    <div>
                      <div className="bg-slate-700 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300">
                        Jantina — Pelajar (Walk-In)
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
                            <td className="px-3 py-2 text-center font-mono font-bold text-indigo-900 text-sm tabular-nums">{n(d.walkInSchoolMale)}</td>
                            <td className="px-3 py-2 text-center text-xs text-indigo-700 tabular-nums">{pct(d.walkInSchoolMale, d.walkInSchoolMale + d.walkInSchoolFemale)}%</td>
                          </tr>
                          <tr className="bg-rose-50">
                            <td className="px-3 py-2 text-xs font-semibold text-rose-900"><span className="flex items-center gap-1"><Venus className="w-3.5 h-3.5" /> Perempuan</span></td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-rose-900 text-sm tabular-nums">{n(d.walkInSchoolFemale)}</td>
                            <td className="px-3 py-2 text-center text-xs text-rose-700 tabular-nums">{pct(d.walkInSchoolFemale, d.walkInSchoolMale + d.walkInSchoolFemale)}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Walk-In: Belia */}
                    <div>
                      <div className="bg-slate-700 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300">
                        Jantina — Belia (Walk-In)
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
                            <td className="px-3 py-2 text-center font-mono font-bold text-indigo-900 text-sm tabular-nums">{n(d.walkInBeliaMale)}</td>
                            <td className="px-3 py-2 text-center text-xs text-indigo-700 tabular-nums">{pct(d.walkInBeliaMale, d.walkInBeliaMale + d.walkInBeliaFemale)}%</td>
                          </tr>
                          <tr className="bg-rose-50">
                            <td className="px-3 py-2 text-xs font-semibold text-rose-900"><span className="flex items-center gap-1"><Venus className="w-3.5 h-3.5" /> Perempuan</span></td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-rose-900 text-sm tabular-nums">{n(d.walkInBeliaFemale)}</td>
                            <td className="px-3 py-2 text-center text-xs text-rose-700 tabular-nums">{pct(d.walkInBeliaFemale, d.walkInBeliaMale + d.walkInBeliaFemale)}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
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
                  levelParticipants: d.rendahParticipants,
                  labelCls: "bg-indigo-800 text-white",
                  subCls: "bg-indigo-50",
                  totCls: "bg-indigo-100 text-indigo-900",
                },
                {
                  label: "Sekolah Menengah",
                  comps: d.menengahComps,
                  levelParticipants: d.menengahParticipants,
                  labelCls: "bg-amber-800 text-white",
                  subCls: "bg-amber-50",
                  totCls: "bg-amber-100 text-amber-900",
                },
                {
                  label: "Belia",
                  comps: d.beliaComps,
                  levelParticipants: d.regSummary.beliaParticipants,
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
                        {n(g.levelParticipants)}
                      </td>
                    </tr>
                  </Fragment>
                ) : null,
              )}
              {d.multiTeamParticipantCount > 0 && (
                <tr className="bg-amber-50 border-t border-amber-200">
                  <td className="px-3 py-1.5 text-xs text-amber-800" colSpan={4}>
                    Peserta menjadi ahli 2 atau lebih pasukan
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono font-bold text-sm tabular-nums text-amber-900">
                    {n(d.multiTeamParticipantCount)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ══ WALK-IN MENGIKUT TAHAP PENDIDIKAN ════════════════════════════ */}
        {(d.walkInRendahComps.length > 0 || d.walkInMenengahComps.length > 0 || d.walkInBeliaComps.length > 0) && (
          <div className="overflow-hidden rounded-sm">
            <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                Penyertaan Walk-In
              </span>
              <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                Penyertaan Pertandingan &lsquo;Walk-In&rsquo; Mengikut Tahap Pendidikan
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${TH_LEFT} w-44`}>Tahap Pendidikan</th>
                  <th className={`${TH} w-20`}>Kod</th>
                  <th className={TH_LEFT}>Pertandingan</th>
                  <th className={`${TH} w-24`}>Peserta</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "Sekolah Rendah",
                    comps: d.walkInRendahComps,
                    labelCls: "bg-indigo-800 text-white",
                    subCls: "bg-indigo-50",
                    totCls: "bg-indigo-100 text-indigo-900",
                  },
                  {
                    label: "Sekolah Menengah",
                    comps: d.walkInMenengahComps,
                    labelCls: "bg-amber-800 text-white",
                    subCls: "bg-amber-50",
                    totCls: "bg-amber-100 text-amber-900",
                  },
                  {
                    label: "Belia",
                    comps: d.walkInBeliaComps,
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
                            {n(c.participants)}
                          </td>
                        </tr>
                      ))}
                      <tr className={`${g.totCls} font-semibold`}>
                        <td className="px-3 py-1.5 text-right text-xs" colSpan={2}>
                          Jumlah {g.label}:
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono font-black text-sm tabular-nums">
                          {n(g.comps.reduce((s, c) => s + c.participants, 0))}
                        </td>
                      </tr>
                    </Fragment>
                  ) : null,
                )}
                {(() => {
                  const totalPenyertaan = [
                    ...d.walkInRendahComps, ...d.walkInMenengahComps, ...d.walkInBeliaComps
                  ].reduce((s, c) => s + c.participants, 0);
                  const uniquePeserta = d.walkInSummary.total;
                  return (
                    <>
                      <tr className="bg-slate-700 text-white">
                        <td className="px-3 py-1.5 text-xs font-semibold text-slate-300" colSpan={3}>
                          Jumlah Penyertaan <span className="font-normal italic text-slate-400">(termasuk penyertaan berganda)</span>
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono font-black text-sm tabular-nums">
                          {n(totalPenyertaan)}
                        </td>
                      </tr>
                      <tr className="bg-slate-900 text-white">
                        <td className="px-3 py-2 text-xs font-black uppercase tracking-widest" colSpan={3}>
                          Jumlah Peserta Walk-In (Unik)
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">
                          {n(uniquePeserta)}
                        </td>
                      </tr>
                      {d.walkInMultiCompCount > 0 && (
                        <tr className="bg-amber-50 border-t border-amber-200">
                          <td className="px-3 py-1.5 text-xs text-amber-800" colSpan={3}>
                            Peserta memasuki 2 atau lebih pertandingan
                          </td>
                          <td className="px-3 py-1.5 text-center font-mono font-bold text-sm tabular-nums text-amber-900">
                            {n(d.walkInMultiCompCount)}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ WALK-IN MENGIKUT NEGERI ══════════════════════════════════════ */}
        {d.walkInStateCompStats.length > 0 && (
          <div className="overflow-hidden rounded-sm">
            <div className="bg-slate-900 px-4 py-2.5 flex flex-col gap-0.5">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                Penyertaan Walk-In
              </span>
              <span className="text-sm font-black uppercase tracking-wide text-white leading-tight">
                Penyertaan &lsquo;Walk-In&rsquo; Mengikut Negeri
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${TH_LEFT} w-44`}>Negeri</th>
                  <th className={`${TH} w-20`}>Kod</th>
                  <th className={TH_LEFT}>Pertandingan</th>
                  <th className={`${TH} w-24`}>Peserta</th>
                </tr>
              </thead>
              <tbody>
                {d.walkInStateCompStats.map((sg, si) => {
                  const subP  = sg.comps.reduce((s, c) => s + c.participants, 0);
                  const rowBg = si % 2 === 0 ? "bg-white" : "bg-slate-50";
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
                            {n(c.participants)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-200 font-semibold">
                        <td className="px-3 py-1.5 text-right text-xs text-slate-700" colSpan={2}>
                          Jumlah {sg.stateName}:
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono font-black text-sm text-slate-900 tabular-nums">
                          {n(subP)}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
                <tr className="bg-slate-900 text-white">
                  <td className="px-3 py-2 text-xs font-black uppercase tracking-widest" colSpan={3}>
                    Jumlah Keseluruhan Peserta Walk-In
                  </td>
                  <td className="px-3 py-2 text-center font-mono font-black text-sm tabular-nums">
                    {n(d.walkInSummary.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

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
