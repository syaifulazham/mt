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
    return NextResponse.json({ enabled: false, participants: [] }, { headers: { "Cache-Control": "no-store" } });

  const [people, certs] = await Promise.all([
    db.participant.findMany({
      where:   { contingentId: { in: contingentIds } },
      select:  { id: true, name: true, gender: true, age: true, classGrade: true, className: true, contingent: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    distributedCertificates({ contingentIds }),
  ]);
  const byParticipant = new Map<string, typeof certs>();
  for (const c of certs) {
    if (!c.participantId) continue;
    byParticipant.set(c.participantId, [...(byParticipant.get(c.participantId) ?? []), c]);
  }

  return NextResponse.json({
    enabled: true,
    participants: people.map(p => ({
      id: p.id, name: p.name, gender: p.gender, age: p.age,
      classLabel: [p.classGrade?.trim(), p.className?.trim()].filter(Boolean).join(" ") || null,
      contingent: p.contingent?.name ?? null,
      certificates: (byParticipant.get(p.id) ?? []).map(c => ({ id: c.id, serialNumber: c.serialNumber, level: c.level, kind: c.kind, label: c.label, online: c.online })),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
