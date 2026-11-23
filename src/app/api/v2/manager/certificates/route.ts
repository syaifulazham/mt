import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCertDistribution } from "@/lib/certificates/distribution";
import { distributedCertificates, managerContingentIds } from "@/lib/certificates/portal";

export const dynamic = "force-dynamic";

/**
 * GET — the manager's participants with their distributed certificates,
 * grouped by level (Peringkat Sekolah / Negeri / Kebangsaan). Empty with
 * enabled=false while Certificates → Distribution has the manager portal off.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const contingentIds = await managerContingentIds(userId);
  if (!contingentIds) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  if (!(await getCertDistribution()).manager)
    return NextResponse.json({ enabled: false, participants: [], trainers: [] }, { headers: { "Cache-Control": "no-store" } });

  const [people, certs, trainers, trainerCerts, schoolCerts] = await Promise.all([
    db.participant.findMany({
      where:   { contingentId: { in: contingentIds } },
      select:  { id: true, name: true, gender: true, age: true, classGrade: true, className: true, contingent: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    distributedCertificates({ contingentIds }),
    db.trainer.findMany({
      where:   { contingentId: { in: contingentIds } },
      select:  { id: true, name: true, contingent: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    // Trainer certificates (generator source Jurulatih): shown whenever the manager
    // portal is on — they have no distribution level. Linked by meta.genKey "…:trainer:<id>".
    db.certificate.findMany({
      where:  { recipientType: "TRAINER", status: "READY", contingentId: { in: contingentIds } },
      select: { id: true, serialNumber: true, meta: true, eventName: true, competitionCode: true, competitionName: true, awardTitle: true },
      orderBy: { serialNumber: "asc" },
    }),
    // School / contingent certificates (Pencapaian Acara (Sekolah)): shown whenever the manager portal is on.
    db.certificate.findMany({
      where:  { recipientType: "CONTINGENT", status: "READY", contingentId: { in: contingentIds } },
      select: { id: true, serialNumber: true, recipientName: true, teamName: true, competitionCode: true, competitionName: true,
                awardTitle: true, eventName: true, meta: true },
      orderBy: [{ competitionCode: "asc" }, { serialNumber: "asc" }],
    }),
  ]);
  const byTrainer = new Map<string, { id: string; serialNumber: string; label: string; achievement: boolean }[]>();
  for (const c of trainerCerts) {
    const m = /:trainer:([^:]+)$/.exec((c.meta as { genKey?: string } | null)?.genKey ?? "");
    if (!m) continue;
    // A winning team's trainer (Pencapaian Acara (Jurulatih)): the competition and award.
    const label = c.awardTitle
      ? [[c.competitionCode, c.competitionName].filter(Boolean).join(" "), c.awardTitle].filter(Boolean).join(" · ")
      : c.eventName ?? c.serialNumber;
    byTrainer.set(m[1], [...(byTrainer.get(m[1]) ?? []), { id: c.id, serialNumber: c.serialNumber, label, achievement: !!c.awardTitle }]);
  }
  const byParticipant = new Map<string, typeof certs>();
  for (const c of certs) {
    if (!c.participantId) continue;
    byParticipant.set(c.participantId, [...(byParticipant.get(c.participantId) ?? []), c]);
  }

  return NextResponse.json({
    enabled: true,
    schools: schoolCerts.map(c => ({
      id: c.id, serialNumber: c.serialNumber, recipient: c.recipientName, team: c.teamName,
      label: [[c.competitionCode, c.competitionName].filter(Boolean).join(" "), c.awardTitle].filter(Boolean).join(" · ") || c.eventName || c.serialNumber,
      eventName: c.eventName,
      walkIn: ((c.meta as { genKey?: string } | null)?.genKey ?? "").includes(":walk:"),
    })),
    trainers: trainers.map(t => ({ id: t.id, name: t.name, contingent: t.contingent?.name ?? null, certificates: byTrainer.get(t.id) ?? [] })),
    participants: people.map(p => ({
      id: p.id, name: p.name, gender: p.gender, age: p.age,
      classLabel: [p.classGrade?.trim(), p.className?.trim()].filter(Boolean).join(" ") || null,
      contingent: p.contingent?.name ?? null,
      certificates: (byParticipant.get(p.id) ?? []).map(c => ({ id: c.id, serialNumber: c.serialNumber, level: c.level, kind: c.kind, label: c.label, online: c.online, walkIn: c.walkIn })),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
