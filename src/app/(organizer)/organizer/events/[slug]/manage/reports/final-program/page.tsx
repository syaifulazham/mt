import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/organizer/events/PrintButton";

export const metadata: Metadata = { title: "Laporan Akhir Program" };

// ─── helpers ──────────────────────────────────────────────────────────────────

type Level = "RENDAH" | "MENENGAH" | "BELIA";

function classifyLevel(
  targetGroups: { targetGroup: { schoolLevel: string } }[],
): Level {
  const levels = targetGroups.map(tg => tg.targetGroup.schoolLevel.toUpperCase());
  if (levels.some(l => l.includes("PRIMARY"))) return "RENDAH";
  if (levels.some(l => l.includes("SECONDARY"))) return "MENENGAH";
  return "BELIA";
}

function getStateName(contingent: {
  state: { name: string } | null;
  school: { state: { name: string } | null } | null;
  higherInstitution: { state: { name: string } | null } | null;
}): string {
  return (
    contingent.state?.name ??
    contingent.school?.state?.name ??
    contingent.higherInstitution?.state?.name ??
    "Lain-lain"
  );
}

function pct(n: number, total: number): string {
  if (!total) return "0.0";
  return ((n / total) * 100).toFixed(1);
}

// ─── page ─────────────────────────────────────────────────────────────────────

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
      name: true,
      slug: true,
      zone: { select: { name: true } },
      state: { select: { name: true } },
    },
  });

  if (!event) redirect("/organizer/events");

  // ── Fetch all accepted teams ──────────────────────────────────────────────
  const teams = await db.team.findMany({
    where: {
      status: "ACTIVE",
      teamEvents: { some: { eventId: event.id, acceptance: "ACCEPT" } },
    },
    include: {
      competition: {
        select: {
          id: true,
          code: true,
          name: true,
          targetGroups: {
            include: { targetGroup: { select: { schoolLevel: true } } },
          },
        },
      },
      contingent: {
        select: {
          id: true,
          state: { select: { name: true } },
          school: { select: { state: { select: { name: true } } } },
          higherInstitution: { select: { state: { select: { name: true } } } },
        },
      },
      members: {
        select: {
          participant: {
            select: { id: true, gender: true, ethnicity: true },
          },
        },
      },
    },
  });

  // ── Fetch walk-in registrations ───────────────────────────────────────────
  const walkIns = await db.walkInRegistration.findMany({
    where: {
      status: { not: "REJECTED" },
      walkInCompetition: { eventId: event.id },
    },
    select: {
      walkInCompetition: {
        select: {
          competition: {
            select: {
              id: true,
              code: true,
              name: true,
              targetGroups: {
                include: { targetGroup: { select: { schoolLevel: true } } },
              },
            },
          },
        },
      },
      participant: { select: { id: true, gender: true, ethnicity: true } },
      contingent: {
        select: {
          id: true,
          state: { select: { name: true } },
          school: { select: { state: { select: { name: true } } } },
          higherInstitution: { select: { state: { select: { name: true } } } },
        },
      },
    },
  });

  // ── Build flat team data ──────────────────────────────────────────────────
  type TD = {
    compId: string;
    compCode: string;
    compName: string;
    level: Level;
    contingentId: string;
    stateName: string;
    members: { id: string; gender: string; ethnicity: string | null }[];
  };

  const tds: TD[] = teams.map(t => ({
    compId: t.competition.id,
    compCode: t.competition.code,
    compName: t.competition.name,
    level: classifyLevel(t.competition.targetGroups),
    contingentId: t.contingent.id,
    stateName: getStateName(t.contingent),
    members: t.members.map(m => ({
      id: m.participant.id,
      gender: m.participant.gender as string,
      ethnicity: m.participant.ethnicity as string | null,
    })),
  }));

  // ── Registered summary ────────────────────────────────────────────────────
  const rendahTDs  = tds.filter(t => t.level === "RENDAH");
  const menengahTDs = tds.filter(t => t.level === "MENENGAH");
  const beliaTDs   = tds.filter(t => t.level === "BELIA");
  const schoolTDs  = [...rendahTDs, ...menengahTDs];

  const rendahCIds  = new Set(rendahTDs.map(t => t.contingentId));
  const menengahCIds = new Set(menengahTDs.map(t => t.contingentId));
  const beliaCIds   = new Set(beliaTDs.map(t => t.contingentId));
  const schoolCIds  = new Set([...rendahCIds, ...menengahCIds]);

  const uniquePids = (list: TD[]) => new Set(list.flatMap(t => t.members.map(m => m.id)));

  const schoolPids = uniquePids(schoolTDs);
  const beliaPids  = uniquePids(beliaTDs);

  const regSummary = {
    rendahContingents:  rendahCIds.size,
    menengahContingents: menengahCIds.size,
    schoolContingents:  schoolCIds.size,
    beliaContingents:   beliaCIds.size,
    schoolTeams:        schoolTDs.length,
    beliaTeams:         beliaTDs.length,
    schoolParticipants: schoolPids.size,
    beliaParticipants:  beliaPids.size,
  };

  // ── Gender stats (registered) ─────────────────────────────────────────────
  const genderStat = (list: TD[], g: string) =>
    new Set(list.flatMap(t => t.members.filter(m => m.gender === g).map(m => m.id))).size;

  const schoolMale   = genderStat(schoolTDs, "MALE");
  const schoolFemale = genderStat(schoolTDs, "FEMALE");
  const beliaMale    = genderStat(beliaTDs, "MALE");
  const beliaFemale  = genderStat(beliaTDs, "FEMALE");

  // ── Ethnicity stats (registered) ──────────────────────────────────────────
  const ethn = new Map<string, Set<string>>();
  for (const t of tds)
    for (const m of t.members) {
      const k = m.ethnicity ?? "LAIN_LAIN";
      if (!ethn.has(k)) ethn.set(k, new Set());
      ethn.get(k)!.add(m.id);
    }

  const ethnicityStats = {
    melayu:  ethn.get("MELAYU")?.size ?? 0,
    cina:    ethn.get("CINA")?.size ?? 0,
    india:   ethn.get("INDIA")?.size ?? 0,
    lainLain:(ethn.get("LAIN_LAIN")?.size ?? 0) + (ethn.get("ORANG_ASLI_SEMENANJUNG")?.size ?? 0),
    sabah:   ethn.get("BUMIPUTRA_SABAH")?.size ?? 0,
    sarawak: ethn.get("BUMIPUTRA_SARAWAK")?.size ?? 0,
  };

  // ── Walk-in summary ───────────────────────────────────────────────────────
  const wiSchool = walkIns.filter(w => classifyLevel(w.walkInCompetition.competition.targetGroups) !== "BELIA");
  const wiBelia  = walkIns.filter(w => classifyLevel(w.walkInCompetition.competition.targetGroups) === "BELIA");

  const walkInSummary = {
    schoolParticipants: new Set(wiSchool.map(w => w.participant.id)).size,
    beliaParticipants:  new Set(wiBelia.map(w => w.participant.id)).size,
    total:              new Set(walkIns.map(w => w.participant.id)).size,
  };

  const grandTotal =
    regSummary.schoolParticipants + regSummary.beliaParticipants + walkInSummary.total;

  // ── Competition stats ─────────────────────────────────────────────────────
  const compMap = new Map<string, {
    code: string; name: string; level: Level;
    teams: number; pids: Set<string>;
  }>();
  for (const t of tds) {
    if (!compMap.has(t.compId))
      compMap.set(t.compId, { code: t.compCode, name: t.compName, level: t.level, teams: 0, pids: new Set() });
    const c = compMap.get(t.compId)!;
    c.teams++;
    t.members.forEach(m => c.pids.add(m.id));
  }
  const compStats = [...compMap.entries()]
    .map(([, c]) => ({ ...c, participants: c.pids.size }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const rendahComps   = compStats.filter(c => c.level === "RENDAH");
  const menengahComps = compStats.filter(c => c.level === "MENENGAH");
  const beliaComps    = compStats.filter(c => c.level === "BELIA");

  // ── State summary stats ───────────────────────────────────────────────────
  const stateMap = new Map<string, {
    rCIds: Set<string>; mCIds: Set<string>; bCIds: Set<string>;
    rTeams: number; mTeams: number; bTeams: number;
    pids: Set<string>; malePids: Set<string>; femalePids: Set<string>;
  }>();

  for (const t of tds) {
    if (!stateMap.has(t.stateName))
      stateMap.set(t.stateName, {
        rCIds: new Set(), mCIds: new Set(), bCIds: new Set(),
        rTeams: 0, mTeams: 0, bTeams: 0,
        pids: new Set(), malePids: new Set(), femalePids: new Set(),
      });
    const s = stateMap.get(t.stateName)!;
    if (t.level === "RENDAH")    { s.rCIds.add(t.contingentId); s.rTeams++; }
    else if (t.level === "MENENGAH") { s.mCIds.add(t.contingentId); s.mTeams++; }
    else                         { s.bCIds.add(t.contingentId); s.bTeams++; }
    t.members.forEach(m => {
      s.pids.add(m.id);
      if (m.gender === "MALE") s.malePids.add(m.id);
      else s.femalePids.add(m.id);
    });
  }

  const stateStats = [...stateMap.entries()]
    .map(([stateName, s]) => {
      const schoolCnt = new Set([...s.rCIds, ...s.mCIds]).size;
      return {
        stateName,
        rendahC:   s.rCIds.size,
        menengahC: s.mCIds.size,
        beliaC:    s.bCIds.size,
        schoolC:   schoolCnt,
        rTeams:    s.rTeams,
        mTeams:    s.mTeams,
        bTeams:    s.bTeams,
        totalTeams: s.rTeams + s.mTeams + s.bTeams,
        participants: s.pids.size,
        male:  s.malePids.size,
        female: s.femalePids.size,
      };
    })
    .sort((a, b) => a.stateName.localeCompare(b.stateName));

  // totals row
  const stateTotals = stateStats.reduce(
    (acc, s) => ({
      schoolC:   acc.schoolC + s.schoolC,
      rendahC:   acc.rendahC + s.rendahC,
      menengahC: acc.menengahC + s.menengahC,
      beliaC:    acc.beliaC + s.beliaC,
      rTeams:    acc.rTeams + s.rTeams,
      mTeams:    acc.mTeams + s.mTeams,
      bTeams:    acc.bTeams + s.bTeams,
      totalTeams: acc.totalTeams + s.totalTeams,
      participants: acc.participants + s.participants,
      male:  acc.male + s.male,
      female: acc.female + s.female,
    }),
    { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, rTeams: 0, mTeams: 0, bTeams: 0, totalTeams: 0, participants: 0, male: 0, female: 0 },
  );

  // ── State × Competition stats ─────────────────────────────────────────────
  const scMap = new Map<string, Map<string, { code: string; name: string; level: Level; teams: number; pids: Set<string> }>>();
  for (const t of tds) {
    if (!scMap.has(t.stateName)) scMap.set(t.stateName, new Map());
    const byComp = scMap.get(t.stateName)!;
    if (!byComp.has(t.compId))
      byComp.set(t.compId, { code: t.compCode, name: t.compName, level: t.level, teams: 0, pids: new Set() });
    const c = byComp.get(t.compId)!;
    c.teams++;
    t.members.forEach(m => c.pids.add(m.id));
  }

  const stateCompStats = [...scMap.entries()]
    .map(([stateName, byComp]) => ({
      stateName,
      comps: [...byComp.values()]
        .map(c => ({ ...c, participants: c.pids.size }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.stateName.localeCompare(b.stateName));

  const locationLabel = event.zone?.name ?? event.state?.name ?? event.name.toUpperCase();

  // ── Colour palette for state rows ─────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <OrganizerShell userName={session.name} role={session.role}>
      {/* toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b print:hidden">
        <Link
          href={`/organizer/events/${slug}/manage/reports`}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Laporan
        </Link>
        <span className="text-gray-300">|</span>
        <PrintButton />
      </div>

      {/* ─── Report body ───────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-8 print:px-0 print:py-0 font-sans text-sm">

        {/* ══ RINGKASAN ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">

          {/* Left: Registration summary */}
          <div>
            <div className="bg-gray-800 text-white text-xs font-bold px-3 py-2 uppercase tracking-wide mb-0">
              RINGKASAN LAPORAN STATISTIK PENYERTAAN{locationLabel ? ` — ${locationLabel.toUpperCase()}` : ""}
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
                  <td className="px-3 py-1 text-center font-bold">{regSummary.schoolContingents}</td>
                  <td className="px-3 py-1 text-center font-bold">{regSummary.beliaContingents}</td>
                  <td className="px-3 py-1 text-center font-bold">
                    {regSummary.schoolContingents + regSummary.beliaContingents}
                  </td>
                </tr>
                <tr className="bg-green-100">
                  <td className="px-3 py-1 pl-6">Sekolah Rendah</td>
                  <td className="px-3 py-1 text-center font-semibold">{regSummary.rendahContingents}</td>
                  <td className="px-3 py-1 text-center">—</td>
                  <td className="px-3 py-1 text-center">{regSummary.rendahContingents}</td>
                </tr>
                <tr className="bg-yellow-100">
                  <td className="px-3 py-1 pl-6">Sekolah Menengah</td>
                  <td className="px-3 py-1 text-center font-semibold">{regSummary.menengahContingents}</td>
                  <td className="px-3 py-1 text-center">—</td>
                  <td className="px-3 py-1 text-center">{regSummary.menengahContingents}</td>
                </tr>
                <tr className="bg-blue-100">
                  <td className="px-3 py-1 pl-6">Belia</td>
                  <td className="px-3 py-1 text-center">—</td>
                  <td className="px-3 py-1 text-center font-semibold">{regSummary.beliaContingents}</td>
                  <td className="px-3 py-1 text-center">{regSummary.beliaContingents}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1">Jumlah Pasukan</td>
                  <td className="px-3 py-1 text-center">{regSummary.schoolTeams}</td>
                  <td className="px-3 py-1 text-center">{regSummary.beliaTeams}</td>
                  <td className="px-3 py-1 text-center font-semibold">
                    {regSummary.schoolTeams + regSummary.beliaTeams}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1">Jumlah Peserta</td>
                  <td className="px-3 py-1 text-center">{regSummary.schoolParticipants.toLocaleString()}</td>
                  <td className="px-3 py-1 text-center">{regSummary.beliaParticipants.toLocaleString()}</td>
                  <td className="px-3 py-1 text-center font-bold">
                    {(regSummary.schoolParticipants + regSummary.beliaParticipants).toLocaleString()}
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
                  <td className="px-3 py-1 text-center">{walkInSummary.schoolParticipants || "—"}</td>
                  <td className="px-3 py-1 text-center">{walkInSummary.beliaParticipants || "—"}</td>
                  <td className="px-3 py-1 text-center font-bold">
                    {walkInSummary.total ? walkInSummary.total.toLocaleString() : "—"}
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
                  <td className="px-3 py-1 text-center font-bold text-lg">
                    {grandTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Gender */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <table className="border-collapse text-xs w-full">
                <tbody>
                  <tr className="bg-gray-200">
                    <td className="px-3 py-1 font-bold" colSpan={3}>
                      JANTINA PELAJAR SEKOLAH
                    </td>
                  </tr>
                  <tr className="bg-gray-100">
                    <td className="px-3 py-1" />
                    <td className="px-3 py-1 font-semibold text-center">Bilangan</td>
                    <td className="px-3 py-1 font-semibold text-center">%</td>
                  </tr>
                  <tr className="bg-blue-200">
                    <td className="px-3 py-1">Lelaki</td>
                    <td className="px-3 py-1 text-center font-bold">{schoolMale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(schoolMale, schoolMale + schoolFemale)}</td>
                  </tr>
                  <tr className="bg-pink-200">
                    <td className="px-3 py-1">Perempuan</td>
                    <td className="px-3 py-1 text-center font-bold">{schoolFemale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(schoolFemale, schoolMale + schoolFemale)}</td>
                  </tr>
                </tbody>
              </table>
              <table className="border-collapse text-xs w-full">
                <tbody>
                  <tr className="bg-gray-200">
                    <td className="px-3 py-1 font-bold" colSpan={3}>JANTINA BELIA</td>
                  </tr>
                  <tr className="bg-gray-100">
                    <td className="px-3 py-1" />
                    <td className="px-3 py-1 font-semibold text-center">Bilangan</td>
                    <td className="px-3 py-1 font-semibold text-center">%</td>
                  </tr>
                  <tr className="bg-blue-200">
                    <td className="px-3 py-1">Lelaki</td>
                    <td className="px-3 py-1 text-center font-bold">{beliaMale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(beliaMale, beliaMale + beliaFemale)}</td>
                  </tr>
                  <tr className="bg-pink-200">
                    <td className="px-3 py-1">Perempuan</td>
                    <td className="px-3 py-1 text-center font-bold">{beliaFemale.toLocaleString()}</td>
                    <td className="px-3 py-1 text-center">{pct(beliaFemale, beliaMale + beliaFemale)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Ethnicity (Rakan Muda) */}
          <div>
            <div className="bg-emerald-700 text-white text-xs font-bold px-3 py-2 uppercase tracking-wide">
              BAGI LAPORAN KE KBS DIBAWAH INISIATIF RAKAN MUDA
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <td className="px-3 py-1 font-semibold text-center border" colSpan={6}>
                    JUMLAH PESERTA MENGIKUT KAUM
                  </td>
                </tr>
                <tr className="bg-gray-200">
                  <td className="px-3 py-1 font-semibold text-center border">Melayu</td>
                  <td className="px-3 py-1 font-semibold text-center border">Cina</td>
                  <td className="px-3 py-1 font-semibold text-center border">India</td>
                  <td className="px-3 py-1 font-semibold text-center border">Lain-Lain</td>
                  <td className="px-3 py-1 font-semibold text-center border">Sabah</td>
                  <td className="px-3 py-1 font-semibold text-center border">Sarawak</td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 text-center font-bold border">{ethnicityStats.melayu.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center font-bold border">{ethnicityStats.cina.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center font-bold border">{ethnicityStats.india.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center font-bold border">{ethnicityStats.lainLain.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center font-bold border">{ethnicityStats.sabah.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center font-bold border">{ethnicityStats.sarawak.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ LAPORAN TERPERINCI ═══════════════════════════════════════════ */}
        <div>
          <div className="bg-gray-800 text-white text-xs font-bold px-3 py-2 uppercase tracking-wide mb-0">
            LAPORAN TERPERINCI STATISTIK PENYERTAAN{locationLabel ? ` — ${locationLabel.toUpperCase()}` : ""}
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
              {stateStats.map((s, i) => (
                <tr key={s.stateName} className={STATE_COLORS[i % STATE_COLORS.length]}>
                  <td className="px-3 py-1.5 font-semibold border">{s.stateName}</td>
                  <td className="px-3 py-1.5 text-center font-bold border">{s.schoolC}</td>
                  <td className="px-3 py-1.5 text-center border">{s.rendahC}</td>
                  <td className="px-3 py-1.5 text-center border">{s.menengahC}</td>
                  <td className="px-3 py-1.5 text-center border">{s.beliaC}</td>
                  <td className="px-3 py-1.5 text-center border">
                    {s.totalTeams}
                    {s.bTeams > 0 && (
                      <span className="ml-1 text-xs opacity-75">
                        ({s.rTeams + s.mTeams}+{s.bTeams} Belia)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center font-bold border">{s.participants.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-center border">{s.male.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-center border">{s.female.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-gray-800 text-white font-bold">
                <td className="px-3 py-2 border">JUMLAH</td>
                <td className="px-3 py-2 text-center border">{stateTotals.schoolC}</td>
                <td className="px-3 py-2 text-center border">{stateTotals.rendahC}</td>
                <td className="px-3 py-2 text-center border">{stateTotals.menengahC}</td>
                <td className="px-3 py-2 text-center border">{stateTotals.beliaC}</td>
                <td className="px-3 py-2 text-center border">{stateTotals.totalTeams}</td>
                <td className="px-3 py-2 text-center border">{stateTotals.participants.toLocaleString()}</td>
                <td className="px-3 py-2 text-center border">{stateTotals.male.toLocaleString()}</td>
                <td className="px-3 py-2 text-center border">{stateTotals.female.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ══ 1. PENYERTAAN MENGIKUT TAHAP ════════════════════════════════ */}
        <div>
          <div className="bg-gray-500 text-white text-xs font-bold px-3 py-1.5 uppercase tracking-wide mb-0">
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
              {/* Sekolah Rendah */}
              {rendahComps.map((c, i) => (
                <tr key={c.code} className="bg-green-50">
                  {i === 0 && (
                    <td
                      className="px-3 py-1.5 font-semibold border bg-green-200 align-top"
                      rowSpan={rendahComps.length + 1}
                    >
                      Sekolah Rendah
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-center border font-mono">{c.code}</td>
                  <td className="px-3 py-1.5 border">{c.name}</td>
                  <td className="px-3 py-1.5 text-center border">{c.teams}</td>
                  <td className="px-3 py-1.5 text-center border">{c.participants}</td>
                </tr>
              ))}
              <tr className="bg-green-200 font-semibold">
                <td className="px-3 py-1.5 text-right border" colSpan={2}>Jumlah:</td>
                <td className="px-3 py-1.5 text-center border">{rendahComps.reduce((s, c) => s + c.teams, 0)}</td>
                <td className="px-3 py-1.5 text-center border">{rendahComps.reduce((s, c) => s + c.participants, 0)}</td>
              </tr>

              {/* Sekolah Menengah */}
              {menengahComps.map((c, i) => (
                <tr key={c.code} className="bg-yellow-50">
                  {i === 0 && (
                    <td
                      className="px-3 py-1.5 font-semibold border bg-yellow-200 align-top"
                      rowSpan={menengahComps.length + 1}
                    >
                      Sekolah Menengah
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-center border font-mono">{c.code}</td>
                  <td className="px-3 py-1.5 border">{c.name}</td>
                  <td className="px-3 py-1.5 text-center border">{c.teams}</td>
                  <td className="px-3 py-1.5 text-center border">{c.participants}</td>
                </tr>
              ))}
              <tr className="bg-yellow-200 font-semibold">
                <td className="px-3 py-1.5 text-right border" colSpan={2}>Jumlah:</td>
                <td className="px-3 py-1.5 text-center border">{menengahComps.reduce((s, c) => s + c.teams, 0)}</td>
                <td className="px-3 py-1.5 text-center border">{menengahComps.reduce((s, c) => s + c.participants, 0)}</td>
              </tr>

              {/* Belia */}
              {beliaComps.length > 0 && (
                <>
                  {beliaComps.map((c, i) => (
                    <tr key={c.code} className="bg-blue-50">
                      {i === 0 && (
                        <td
                          className="px-3 py-1.5 font-semibold border bg-blue-200 align-top"
                          rowSpan={beliaComps.length + 1}
                        >
                          Belia
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-center border font-mono">{c.code}</td>
                      <td className="px-3 py-1.5 border">{c.name}</td>
                      <td className="px-3 py-1.5 text-center border">{c.teams}</td>
                      <td className="px-3 py-1.5 text-center border">{c.participants}</td>
                    </tr>
                  ))}
                  <tr className="bg-blue-200 font-semibold">
                    <td className="px-3 py-1.5 text-right border" colSpan={2}>Jumlah:</td>
                    <td className="px-3 py-1.5 text-center border">{beliaComps.reduce((s, c) => s + c.teams, 0)}</td>
                    <td className="px-3 py-1.5 text-center border">{beliaComps.reduce((s, c) => s + c.participants, 0)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* ══ 2. PENYERTAAN MENGIKUT NEGERI ════════════════════════════════ */}
        <div>
          <div className="bg-gray-500 text-white text-xs font-bold px-3 py-1.5 uppercase tracking-wide mb-0">
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
              {stateCompStats.map((sg, si) => {
                const rowColor = STATE_COLORS[si % STATE_COLORS.length];
                const totalTeams = sg.comps.reduce((s, c) => s + c.teams, 0);
                const totalPax   = sg.comps.reduce((s, c) => s + c.participants, 0);
                return (
                  <>
                    {sg.comps.map((c, ci) => (
                      <tr key={`${sg.stateName}-${c.code}`} className={ci % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {ci === 0 && (
                          <td
                            className={`px-3 py-1.5 font-semibold border align-top ${rowColor}`}
                            rowSpan={sg.comps.length + 1}
                          >
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
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </OrganizerShell>
  );
}
