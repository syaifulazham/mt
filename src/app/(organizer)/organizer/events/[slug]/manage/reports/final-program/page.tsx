import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { computeFinalProgramData } from "@/lib/reports/finalProgramData";
import Link from "next/link";
import { Fragment } from "react";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/organizer/events/PrintButton";
import { FinalProgramExportButtons } from "@/components/organizer/events/FinalProgramExportButtons";

export const metadata: Metadata = { title: "Laporan Akhir Program" };

function pct(n: number, total: number): string {
  if (!total) return "0.0";
  return ((n / total) * 100).toFixed(1);
}

const STATE_COLORS = [
  "bg-orange-400 text-white",
  "bg-yellow-400",
  "bg-green-400 text-white",
  "bg-blue-400 text-white",
  "bg-purple-400 text-white",
  "bg-pink-400 text-white",
  "bg-teal-400 text-white",
  "bg-red-400 text-white",
];

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
    select: { id: true },
  });
  if (!event) notFound();

  const d = await computeFinalProgramData(event.id);
  if (!d) notFound();

  const grandTotal = d.regSummary.schoolParticipants + d.regSummary.beliaParticipants + d.walkInSummary.total;

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      {/* toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b print:hidden flex-wrap">
        <Link
          href={`/organizer/events/${slug}/manage/reports`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <span className="text-gray-300 print:hidden">|</span>
        <FinalProgramExportButtons eventId={event.id} />
        <span className="text-gray-300 print:hidden">|</span>
        <PrintButton />
      </div>

      {/* ─── Report body ────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-8 print:px-0 print:py-0 font-sans text-sm">

        {/* ══ RINGKASAN ════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">

          {/* Left: registration summary */}
          <div>
            <div className="bg-gray-800 text-white text-xs font-bold px-3 py-2 uppercase tracking-wide">
              RINGKASAN LAPORAN STATISTIK PENYERTAAN{d.locationLabel ? ` — ${d.locationLabel.toUpperCase()}` : ""}
            </div>

            {/* BERDAFTAR */}
            <table className="w-full border-collapse text-xs">
              <tbody>
                <tr className="bg-gray-200">
                  <td className="px-3 py-1 font-bold" colSpan={4}>BERDAFTAR</td>
                </tr>
                <tr className="bg-gray-100">
                  <td className="px-3 py-1 w-1/2" />
                  <td className="px-3 py-1 font-semibold text-center">Pelajar</td>
                  <td className="px-3 py-1 font-semibold text-center">Belia</td>
                  <td className="px-3 py-1 font-semibold text-center">Jumlah</td>
                </tr>
                <tr>
                  <td className="px-3 py-1 font-semibold">Kontinjen Sekolah / Belia</td>
                  <td className="px-3 py-1 text-center font-bold">{d.regSummary.schoolContingents}</td>
                  <td className="px-3 py-1 text-center font-bold">{d.regSummary.beliaContingents}</td>
                  <td className="px-3 py-1 text-center font-bold">
                    {d.regSummary.schoolContingents + d.regSummary.beliaContingents}
                  </td>
                </tr>
                <tr className="bg-green-100">
                  <td className="px-3 py-1 pl-6">Sekolah Rendah</td>
                  <td className="px-3 py-1 text-center font-semibold">{d.regSummary.rendahContingents}</td>
                  <td className="px-3 py-1 text-center">—</td>
                  <td className="px-3 py-1 text-center">{d.regSummary.rendahContingents}</td>
                </tr>
                <tr className="bg-yellow-100">
                  <td className="px-3 py-1 pl-6">Sekolah Menengah</td>
                  <td className="px-3 py-1 text-center font-semibold">{d.regSummary.menengahContingents}</td>
                  <td className="px-3 py-1 text-center">—</td>
                  <td className="px-3 py-1 text-center">{d.regSummary.menengahContingents}</td>
                </tr>
                <tr className="bg-blue-100">
                  <td className="px-3 py-1 pl-6">Belia</td>
                  <td className="px-3 py-1 text-center">—</td>
                  <td className="px-3 py-1 text-center font-semibold">{d.regSummary.beliaContingents}</td>
                  <td className="px-3 py-1 text-center">{d.regSummary.beliaContingents}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1">Jumlah Pasukan</td>
                  <td className="px-3 py-1 text-center">{d.regSummary.schoolTeams}</td>
                  <td className="px-3 py-1 text-center">{d.regSummary.beliaTeams}</td>
                  <td className="px-3 py-1 text-center font-semibold">
                    {d.regSummary.schoolTeams + d.regSummary.beliaTeams}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1">Jumlah Peserta</td>
                  <td className="px-3 py-1 text-center">{d.regSummary.schoolParticipants.toLocaleString()}</td>
                  <td className="px-3 py-1 text-center">{d.regSummary.beliaParticipants.toLocaleString()}</td>
                  <td className="px-3 py-1 text-center font-bold">
                    {(d.regSummary.schoolParticipants + d.regSummary.beliaParticipants).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* WALK-IN */}
            <table className="w-full border-collapse text-xs mt-3">
              <tbody>
                <tr className="bg-gray-200">
                  <td className="px-3 py-1 font-bold" colSpan={4}>WALK-IN</td>
                </tr>
                <tr className="bg-gray-100">
                  <td className="px-3 py-1 w-1/2" />
                  <td className="px-3 py-1 font-semibold text-center">Pelajar</td>
                  <td className="px-3 py-1 font-semibold text-center">Belia</td>
                  <td className="px-3 py-1 font-semibold text-center">Jumlah</td>
                </tr>
                <tr>
                  <td className="px-3 py-1">Jumlah Peserta</td>
                  <td className="px-3 py-1 text-center">{d.walkInSummary.schoolParticipants || "—"}</td>
                  <td className="px-3 py-1 text-center">{d.walkInSummary.beliaParticipants || "—"}</td>
                  <td className="px-3 py-1 text-center font-bold">
                    {d.walkInSummary.total ? d.walkInSummary.total.toLocaleString() : "—"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* BERDAFTAR + WALK IN */}
            <table className="w-full border-collapse text-xs mt-3">
              <tbody>
                <tr className="bg-gray-200">
                  <td className="px-3 py-1 font-bold" colSpan={2}>BERDAFTAR + WALK IN</td>
                </tr>
                <tr className="bg-orange-100">
                  <td className="px-3 py-1">Jumlah Peserta</td>
                  <td className="px-3 py-1 text-center font-bold text-lg">{grandTotal.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            {/* Gender */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <table className="border-collapse text-xs w-full">
                <tbody>
                  <tr className="bg-gray-200">
                    <td className="px-3 py-1 font-bold" colSpan={3}>JANTINA PELAJAR SEKOLAH</td>
                  </tr>
                  <tr className="bg-gray-100">
                    <td className="px-3 py-1" /><td className="px-3 py-1 font-semibold text-center">Bilangan</td>
                    <td className="px-3 py-1 font-semibold text-center">%</td>
                  </tr>
                  <tr className="bg-blue-200">
                    <td className="px-3 py-1">Lelaki</td>
                    <td className="px-3 py-1 text-center font-bold">{d.schoolMale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(d.schoolMale, d.schoolMale + d.schoolFemale)}</td>
                  </tr>
                  <tr className="bg-pink-200">
                    <td className="px-3 py-1">Perempuan</td>
                    <td className="px-3 py-1 text-center font-bold">{d.schoolFemale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(d.schoolFemale, d.schoolMale + d.schoolFemale)}</td>
                  </tr>
                </tbody>
              </table>
              <table className="border-collapse text-xs w-full">
                <tbody>
                  <tr className="bg-gray-200">
                    <td className="px-3 py-1 font-bold" colSpan={3}>JANTINA BELIA</td>
                  </tr>
                  <tr className="bg-gray-100">
                    <td className="px-3 py-1" /><td className="px-3 py-1 font-semibold text-center">Bilangan</td>
                    <td className="px-3 py-1 font-semibold text-center">%</td>
                  </tr>
                  <tr className="bg-blue-200">
                    <td className="px-3 py-1">Lelaki</td>
                    <td className="px-3 py-1 text-center font-bold">{d.beliaMale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(d.beliaMale, d.beliaMale + d.beliaFemale)}</td>
                  </tr>
                  <tr className="bg-pink-200">
                    <td className="px-3 py-1">Perempuan</td>
                    <td className="px-3 py-1 text-center font-bold">{d.beliaFemale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(d.beliaFemale, d.beliaMale + d.beliaFemale)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Ethnicity (Rakan Muda) — now 7 columns */}
          <div>
            <div className="bg-emerald-700 text-white text-xs font-bold px-3 py-2 uppercase tracking-wide">
              BAGI LAPORAN KE KBS DIBAWAH INISIATIF RAKAN MUDA
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <td className="px-2 py-1 font-semibold text-center border" colSpan={7}>
                    JUMLAH PESERTA MENGIKUT KAUM
                  </td>
                </tr>
                <tr className="bg-gray-200">
                  <td className="px-2 py-1 font-semibold text-center border">Melayu</td>
                  <td className="px-2 py-1 font-semibold text-center border">Cina</td>
                  <td className="px-2 py-1 font-semibold text-center border">India</td>
                  <td className="px-2 py-1 font-semibold text-center border">Org. Asli</td>
                  <td className="px-2 py-1 font-semibold text-center border">Lain-Lain</td>
                  <td className="px-2 py-1 font-semibold text-center border">Sabah</td>
                  <td className="px-2 py-1 font-semibold text-center border">Sarawak</td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-2 text-center font-bold border">{d.ethnicityStats.melayu.toLocaleString()}</td>
                  <td className="px-2 py-2 text-center font-bold border">{d.ethnicityStats.cina.toLocaleString()}</td>
                  <td className="px-2 py-2 text-center font-bold border">{d.ethnicityStats.india.toLocaleString()}</td>
                  <td className="px-2 py-2 text-center font-bold border">{d.ethnicityStats.orgAsli.toLocaleString()}</td>
                  <td className="px-2 py-2 text-center font-bold border">{d.ethnicityStats.lainLain.toLocaleString()}</td>
                  <td className="px-2 py-2 text-center font-bold border">{d.ethnicityStats.sabah.toLocaleString()}</td>
                  <td className="px-2 py-2 text-center font-bold border">{d.ethnicityStats.sarawak.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ LAPORAN TERPERINCI ══════════════════════════════════════════ */}
        <div>
          <div className="bg-gray-800 text-white text-xs font-bold px-3 py-2 uppercase tracking-wide">
            LAPORAN TERPERINCI STATISTIK PENYERTAAN{d.locationLabel ? ` — ${d.locationLabel.toUpperCase()}` : ""}
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-300">
                <th className="px-3 py-2 text-left border">NEGERI</th>
                <th className="px-3 py-2 text-center border">KONTINJEN SEKOLAH</th>
                <th className="px-3 py-2 text-center border">SEKOLAH RENDAH</th>
                <th className="px-3 py-2 text-center border">SEKOLAH MENENGAH</th>
                <th className="px-3 py-2 text-center border">KONTINJEN BELIA</th>
                <th className="px-3 py-2 text-center border">PASUKAN</th>
                <th className="px-3 py-2 text-center border">PESERTA</th>
                <th className="px-3 py-2 text-center border">LELAKI</th>
                <th className="px-3 py-2 text-center border">PEREMPUAN</th>
              </tr>
            </thead>
            <tbody>
              {d.stateStats.map((s, i) => (
                <tr key={s.stateName} className={STATE_COLORS[i % STATE_COLORS.length]}>
                  <td className="px-3 py-1.5 font-semibold border">{s.stateName}</td>
                  <td className="px-3 py-1.5 text-center font-bold border">{s.schoolC}</td>
                  <td className="px-3 py-1.5 text-center border">{s.rendahC}</td>
                  <td className="px-3 py-1.5 text-center border">{s.menengahC}</td>
                  <td className="px-3 py-1.5 text-center border">{s.beliaC}</td>
                  <td className="px-3 py-1.5 text-center border">
                    {s.totalTeams}
                    {s.bTeams > 0 && (
                      <span className="ml-1 text-[10px] opacity-75">
                        ({s.rTeams + s.mTeams}+{s.bTeams}B)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center font-bold border">{s.participants.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-center border">{s.male.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-center border">{s.female.toLocaleString()}</td>
                </tr>
              ))}
              {(() => {
                const tot = d.stateStats.reduce(
                  (acc, s) => ({
                    schoolC: acc.schoolC + s.schoolC, rendahC: acc.rendahC + s.rendahC,
                    menengahC: acc.menengahC + s.menengahC, beliaC: acc.beliaC + s.beliaC,
                    totalTeams: acc.totalTeams + s.totalTeams, participants: acc.participants + s.participants,
                    male: acc.male + s.male, female: acc.female + s.female,
                  }),
                  { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, totalTeams: 0, participants: 0, male: 0, female: 0 },
                );
                return (
                  <tr className="bg-gray-800 text-white font-bold">
                    <td className="px-3 py-2 border">JUMLAH</td>
                    <td className="px-3 py-2 text-center border">{tot.schoolC}</td>
                    <td className="px-3 py-2 text-center border">{tot.rendahC}</td>
                    <td className="px-3 py-2 text-center border">{tot.menengahC}</td>
                    <td className="px-3 py-2 text-center border">{tot.beliaC}</td>
                    <td className="px-3 py-2 text-center border">{tot.totalTeams}</td>
                    <td className="px-3 py-2 text-center border">{tot.participants.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center border">{tot.male.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center border">{tot.female.toLocaleString()}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>

        {/* ══ 1. PENYERTAAN MENGIKUT TAHAP ═══════════════════════════════ */}
        <div>
          <div className="bg-gray-500 text-white text-xs font-bold px-3 py-1.5 uppercase tracking-wide">
            1. PENYERTAAN MENGIKUT TAHAP PENDIDIKAN
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-200">
                <th className="px-3 py-1.5 text-left border w-48">TAHAP PENDIDIKAN</th>
                <th className="px-3 py-1.5 text-center border w-20">KOD</th>
                <th className="px-3 py-1.5 text-left border">PERTANDINGAN</th>
                <th className="px-3 py-1.5 text-center border w-20">PASUKAN</th>
                <th className="px-3 py-1.5 text-center border w-24">PESERTA</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Sekolah Rendah",   comps: d.rendahComps,   rowBg: "bg-green-50",  hBg: "bg-green-200" },
                { label: "Sekolah Menengah", comps: d.menengahComps, rowBg: "bg-yellow-50", hBg: "bg-yellow-200" },
                { label: "Belia",            comps: d.beliaComps,    rowBg: "bg-blue-50",   hBg: "bg-blue-200" },
              ].map(g => g.comps.length ? (
                <Fragment key={g.label}>
                  {g.comps.map((c, i) => (
                    <tr key={c.code} className={g.rowBg}>
                      {i === 0 && (
                        <td className={`px-3 py-1.5 font-semibold border ${g.hBg} align-top`} rowSpan={g.comps.length + 1}>
                          {g.label}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-center border font-mono">{c.code}</td>
                      <td className="px-3 py-1.5 border">{c.name}</td>
                      <td className="px-3 py-1.5 text-center border">{c.teams}</td>
                      <td className="px-3 py-1.5 text-center border">{c.participants}</td>
                    </tr>
                  ))}
                  <tr className={`${g.hBg} font-semibold`}>
                    <td className="px-3 py-1.5 text-right border" colSpan={2}>Jumlah:</td>
                    <td className="px-3 py-1.5 text-center border">{g.comps.reduce((s, c) => s + c.teams, 0)}</td>
                    <td className="px-3 py-1.5 text-center border">{g.comps.reduce((s, c) => s + c.participants, 0)}</td>
                  </tr>
                </Fragment>
              ) : null)}
            </tbody>
          </table>
        </div>

        {/* ══ 2. PENYERTAAN MENGIKUT NEGERI ══════════════════════════════ */}
        <div>
          <div className="bg-gray-500 text-white text-xs font-bold px-3 py-1.5 uppercase tracking-wide">
            2. PENYERTAAN MENGIKUT NEGERI
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-200">
                <th className="px-3 py-1.5 text-left border w-48">NEGERI</th>
                <th className="px-3 py-1.5 text-center border w-20">KOD</th>
                <th className="px-3 py-1.5 text-left border">PERTANDINGAN</th>
                <th className="px-3 py-1.5 text-center border w-20">PASUKAN</th>
                <th className="px-3 py-1.5 text-center border w-24">PESERTA</th>
              </tr>
            </thead>
            <tbody>
              {d.stateCompStats.map((sg, si) => {
                const rowColor = STATE_COLORS[si % STATE_COLORS.length];
                const totalTeams = sg.comps.reduce((s, c) => s + c.teams, 0);
                const totalPax   = sg.comps.reduce((s, c) => s + c.participants, 0);
                return (
                  <Fragment key={sg.stateName}>
                    {sg.comps.map((c, ci) => (
                      <tr key={`${sg.stateName}-${c.code}`} className={ci % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {ci === 0 && (
                          <td className={`px-3 py-1.5 font-semibold border align-top ${rowColor}`} rowSpan={sg.comps.length + 1}>
                            {sg.stateName}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-center border font-mono">{c.code}</td>
                        <td className="px-3 py-1.5 border">{c.name}</td>
                        <td className="px-3 py-1.5 text-center border">{c.teams}</td>
                        <td className="px-3 py-1.5 text-center border">{c.participants}</td>
                      </tr>
                    ))}
                    <tr className={`font-semibold ${rowColor}`}>
                      <td className="px-3 py-1.5 text-right border" colSpan={2}>Jumlah</td>
                      <td className="px-3 py-1.5 text-center border">{totalTeams}</td>
                      <td className="px-3 py-1.5 text-center border">{totalPax}</td>
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
