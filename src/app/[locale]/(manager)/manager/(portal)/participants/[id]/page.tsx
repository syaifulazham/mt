import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Award, Globe, Trophy, UserRound, UsersRound, Footprints } from "lucide-react";
import { db } from "@/lib/db";
import { getCertDistribution } from "@/lib/certificates/distribution";
import { managerContingentIds, participantCertificatesAllSeasons } from "@/lib/certificates/portal";
import { SeasonCertList } from "@/components/certificates/SeasonCertList";

export const metadata: Metadata = { title: "Participant" };
export const dynamic = "force-dynamic";

const EDU: Record<string, string> = { KINDERGARTEN: "Prasekolah", PRIMARY: "Sekolah Rendah", SECONDARY: "Sekolah Menengah", YOUTH: "Belia" };
const ETH: Record<string, string> = {
  MELAYU: "Melayu", CINA: "Cina", INDIA: "India", ORANG_ASLI_SEMENANJUNG: "Orang Asli",
  BUMIPUTRA_SABAH: "Bumiputra Sabah", BUMIPUTRA_SARAWAK: "Bumiputra Sarawak", LAIN_LAIN: "Lain-lain",
};
const ACCEPT: Record<string, { label: string; cls: string }> = {
  ACCEPT:  { label: "Diterima", cls: "bg-emerald-50 text-emerald-700" },
  PENDING: { label: "Menunggu", cls: "bg-zinc-100 text-zinc-600" },
  REJECT:  { label: "Ditolak",  cls: "bg-red-50 text-red-600" },
};
const fmtIc = (ic: string | null) => {
  const d = (ic ?? "").replace(/\D/g, "");
  return d.length === 12 ? `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : ic ?? "—";
};
const fmtDate = (d: Date | null) => d ? d.toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" }) : "—";

function Section({ icon: Icon, title, count, children }: { icon: React.ElementType; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
        <Icon className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h2>
        {count != null && <span className="text-xs text-zinc-400">({count})</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default async function ParticipantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");
  const contingentIds = await managerContingentIds(userId);
  if (!contingentIds) redirect("/manager/onboarding");

  const { id } = await params;
  const p = await db.participant.findFirst({
    where:   { id, contingentId: { in: contingentIds } },
    include: {
      contingent: { select: { name: true } },
      teamMembers: {
        include: {
          team: {
            select: {
              id: true, name: true,
              competition: { select: { code: true, name: true } },
              members: { select: { participant: { select: { id: true, name: true } } } },
              teamEvents: {
                select: { acceptance: true, attendedAt: true, event: { select: { name: true, scope: true, startDate: true } } },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
      walkInRegistrations: {
        select: {
          id: true, status: true, createdAt: true,
          walkInCompetition: { select: { competition: { select: { code: true, name: true } }, event: { select: { name: true } } } },
        },
      },
    },
  });
  if (!p) notFound();

  const distribution = await getCertDistribution();
  const certs = distribution.manager ? await participantCertificatesAllSeasons({ id: p.id, ic: p.ic }) : [];
  const teams = [...p.teamMembers].map(tm => tm.team).sort((a, b) => a.competition.code.localeCompare(b.competition.code, undefined, { numeric: true }));
  const competitions = [...new Map([
    ...teams.map(t => [t.competition.code, t.competition] as const),
    ...p.walkInRegistrations.map(w => [w.walkInCompetition.competition.code, w.walkInCompetition.competition] as const),
  ]).values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const details: [string, React.ReactNode][] = [
    ["No. Kad Pengenalan", <span key="ic" className="font-mono">{fmtIc(p.ic)}</span>],
    ["Jantina", p.gender === "MALE" ? "Lelaki" : p.gender === "FEMALE" ? "Perempuan" : p.gender],
    ["Umur", p.age ?? "—"],
    ["Peringkat", EDU[p.eduLevel] ?? p.eduLevel],
    ["Darjah / Tingkatan", [p.classGrade, p.className].filter(Boolean).join(" ") || "—"],
    ["Etnik", p.ethnicity ? ETH[p.ethnicity] ?? p.ethnicity : "—"],
    ["PPKI", p.ppki ? "Ya" : "Tidak"],
    ["E-mel", p.email || "—"],
    ["Telefon", p.phoneNumber || "—"],
    ["Kontinjen", p.contingent.name],
    ["Didaftarkan", fmtDate(p.createdAt)],
  ];

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href="/manager/certificates" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Sijil
        </Link>
        <h1 className="mt-2 text-xl font-bold dark:text-zinc-100">{p.name}</h1>
        <p className="text-sm text-zinc-500">{p.contingent.name}</p>
      </div>

      <Section icon={UserRound} title="Maklumat peserta">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-zinc-400">{k}</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section icon={Trophy} title="Pertandingan" count={competitions.length}>
        {competitions.length === 0 ? <p className="text-xs text-zinc-400">Belum menyertai sebarang pertandingan.</p> : (
          <div className="flex flex-wrap gap-2">
            {competitions.map(c => (
              <span key={c.code} className="rounded-lg border px-2.5 py-1 text-xs dark:border-zinc-700">
                <span className="mr-1.5 font-mono text-zinc-400">{c.code}</span>{c.name}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section icon={UsersRound} title="Pasukan" count={teams.length}>
        {teams.length === 0 ? <p className="text-xs text-zinc-400">Tiada pasukan.</p> : (
          <div className="space-y-3">
            {teams.map(t => (
              <div key={t.id} className="rounded-lg border p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.name}</p>
                  <p className="text-xs text-zinc-500"><span className="font-mono text-zinc-400">{t.competition.code}</span> {t.competition.name}</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Ahli: {t.members.map(m => m.participant.id === p.id ? <b key={m.participant.id}>{m.participant.name}</b> : m.participant.name)
                    .reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}
                </p>
                {t.teamEvents.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.teamEvents.map((te, i) => {
                      const a = ACCEPT[te.acceptance] ?? ACCEPT.PENDING;
                      const online = String(te.event.scope).startsWith("ONLINE");
                      return (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] dark:border-zinc-700">
                          {online && <Globe className="h-3 w-3 text-sky-500" />}
                          {te.event.name}
                          {!online && <span className={`rounded px-1 ${a.cls}`}>{a.label}</span>}
                          {te.attendedAt && <span className="rounded bg-sky-50 px-1 text-sky-700">Hadir</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {p.walkInRegistrations.length > 0 && (
        <Section icon={Footprints} title="Pertandingan walk-in" count={p.walkInRegistrations.length}>
          <div className="space-y-1.5 text-xs">
            {p.walkInRegistrations.map(w => (
              <p key={w.id} className="text-zinc-700 dark:text-zinc-300">
                <span className="font-mono text-zinc-400">{w.walkInCompetition.competition.code}</span> {w.walkInCompetition.competition.name}
                <span className="text-zinc-400"> · {w.walkInCompetition.event.name} · {w.status}</span>
              </p>
            ))}
          </div>
        </Section>
      )}

      <Section icon={Award} title="Sijil" count={certs.length}>
        {!distribution.manager ? (
          <p className="text-xs text-zinc-400">Sijil belum diedarkan oleh penganjur.</p>
        ) : certs.length === 0 ? (
          <p className="text-xs text-zinc-400">Tiada sijil.</p>
        ) : (
          <SeasonCertList certs={certs} />
        )}
      </Section>
    </div>
  );
}
