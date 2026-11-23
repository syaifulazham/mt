import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCertDistribution } from "@/lib/certificates/distribution";
import { managerContingentIds, participantCertificatesAllSeasons } from "@/lib/certificates/portal";
import { ManagerCertViewer, type ViewerCert } from "@/components/manager/ManagerCertViewer";

export const metadata: Metadata = { title: "Certificates" };
export const dynamic = "force-dynamic";

const LEVEL: Record<string, string> = { SCHOOL: "levelSchool", STATE: "levelState", NATIONAL: "levelNational" };

/**
 * Manager portal → Sijil → a participant's or trainer's certificates: the list
 * on the left, the selected certificate's PDF previewed on the right. Same
 * access as the Sijil page: the manager's own contingents, and only while
 * Certificates → Distribution has the manager portal on. The PDF itself comes
 * from /api/v2/certificates/[id]/download, which checks access again.
 */
export default async function CertificateViewerPage({
  params, searchParams,
}: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ c?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");
  const contingentIds = await managerContingentIds(userId);
  if (!contingentIds) redirect("/manager/onboarding");

  const { kind, id } = await params;
  const { c } = await searchParams;
  if (kind !== "participant" && kind !== "trainer") notFound();
  const enabled = (await getCertDistribution()).manager;

  let person: { name: string; contingent: string | null; line: string | null };
  let certs: ViewerCert[] = [];

  if (kind === "participant") {
    const p = await db.participant.findFirst({
      where:  { id, contingentId: { in: contingentIds } },
      select: { id: true, name: true, ic: true, classGrade: true, className: true, contingent: { select: { name: true } } },
    });
    if (!p) notFound();
    person = {
      name: p.name, contingent: p.contingent?.name ?? null,
      line: [p.classGrade?.trim(), p.className?.trim()].filter(Boolean).join(" ") || null,
    };
    if (enabled)
      certs = (await participantCertificatesAllSeasons({ id: p.id, ic: p.ic })).map(x => ({
        id: x.id, serialNumber: x.serialNumber, title: x.label, kind: x.kind, online: x.online, walkIn: x.walkIn,
        levelKey: LEVEL[x.level] ?? null, eventName: x.eventName, seasonYear: x.seasonYear,
      }));
  } else {
    const t = await db.trainer.findFirst({
      where:  { id, contingentId: { in: contingentIds } },
      select: { id: true, name: true, contingent: { select: { name: true } } },
    });
    if (!t) notFound();
    person = { name: t.name, contingent: t.contingent?.name ?? null, line: null };
    if (enabled) {
      // Trainer certificates (generator source Jurulatih) link back by meta.genKey "…:trainer:<id>".
      const rows = await db.certificate.findMany({
        where:   { recipientType: "TRAINER", status: "READY", contingentId: { in: contingentIds } },
        select:  { id: true, serialNumber: true, meta: true, eventName: true, competitionCode: true, competitionName: true, awardTitle: true, season: { select: { year: true } } },
        orderBy: [{ season: { year: "desc" } }, { serialNumber: "asc" }],
      });
      certs = rows
        .filter(r => ((r.meta as { genKey?: string } | null)?.genKey ?? "").endsWith(`:trainer:${t.id}`))
        .map(r => ({
          // A winning team's trainer (Pencapaian Acara (Jurulatih)) shows as an achievement.
          id: r.id, serialNumber: r.serialNumber,
          title: r.awardTitle ? [[r.competitionCode, r.competitionName].filter(Boolean).join(" "), r.awardTitle].filter(Boolean).join(" · ") : r.eventName ?? r.serialNumber,
          kind: r.awardTitle ? "ACHIEVEMENT" as const : "TRAINER" as const,
          online: false, levelKey: null, eventName: r.awardTitle ? r.eventName : null, seasonYear: r.season.year,
        }));
    }
  }

  return (
    <ManagerCertViewer
      kind={kind} personId={id} person={person} enabled={enabled} certs={certs}
      initialId={certs.some(x => x.id === c) ? c! : certs[0]?.id ?? null}
    />
  );
}
