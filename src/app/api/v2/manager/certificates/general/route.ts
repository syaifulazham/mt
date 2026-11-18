import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCertDistribution } from "@/lib/certificates/distribution";
import { managerContingentIds } from "@/lib/certificates/portal";
import { generalRecipients, issueBatch, type GeneratorConfig } from "@/lib/certificates/generator";
import { activeGeneralJob, GENERAL_CHUNK, generalRoster, issuedGeneral } from "@/lib/certificates/general";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Manager portal → Sijil → School / Contingent Level Cert (src/lib/certificates/general.ts).
 *
 * GET — whether it is available, whether every contingent is a school, and the
 * roster: each competition with its eligible / registered participants and the
 * General certificate each already has (generalRoster).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const contingentIds = await managerContingentIds(userId);
  if (!contingentIds) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const active = (await getCertDistribution()).manager ? await activeGeneralJob() : null;
  if (!active) return NextResponse.json({ available: false }, { headers: { "Cache-Control": "no-store" } });

  const [contingents, competitions] = await Promise.all([
    db.contingent.findMany({ where: { id: { in: contingentIds } }, select: { contingentType: true } }),
    generalRoster(contingentIds),
  ]);

  return NextResponse.json({
    available: true,
    school: contingents.length > 0 && contingents.every(c => c.contingentType === "SCHOOL"),
    templateName: active.template.name,
    competitions,
  }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST { competitionId, participantIds } — issue General certificates for up to
 * GENERAL_CHUNK participants (the portal sends the selection in chunks to show
 * progress). Participants must be on that competition's roster (eligible or
 * registered, in the manager's contingents); those who already have one are
 * skipped. Returns each
 * participant's certificate id.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId }, select: { id: true, contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  const contingentIds = manager.contingentManagers.map(c => c.contingentId);

  if (!(await getCertDistribution()).manager) return NextResponse.json({ error: "NOT_DISTRIBUTED" }, { status: 403 });
  const active = await activeGeneralJob();
  if (!active) return NextResponse.json({ error: "GENERAL_NOT_SET_UP" }, { status: 409 });

  const body = await req.json().catch(() => ({})) as { competitionId?: string; participantIds?: string[] };
  const ids = [...new Set((body.participantIds ?? []).filter(x => typeof x === "string"))];
  if (!body.competitionId || ids.length === 0) return NextResponse.json({ error: "NOTHING_SELECTED" }, { status: 400 });
  if (ids.length > GENERAL_CHUNK) return NextResponse.json({ error: "TOO_MANY" }, { status: 400 });

  const roster = (await generalRoster(contingentIds)).find(c => c.id === body.competitionId);
  const allowed = new Set(roster?.participants.map(p => p.id) ?? []);
  const cfg = active.job.config as GeneratorConfig;
  const recipients = await generalRecipients(cfg, body.competitionId, ids.filter(id => allowed.has(id)), contingentIds);
  const before = await issuedGeneral(contingentIds);
  const todo = recipients.filter(r => !before.has(`${body.competitionId}:${r.participantId}`));

  try {
    const { created } = todo.length
      ? await issueBatch({ jobId: active.job.id, templateId: active.template.id, rows: todo, createdBy: `manager:${manager.id}`, distributionLevel: "SCHOOL" })
      : { created: 0 };
    if (created)
      await db.certGeneratorJob.update({
        where: { id: active.job.id },
        data:  { created: { increment: created }, total: { increment: created }, status: "DONE", completedAt: new Date() },
      });
    const after = created ? await issuedGeneral(contingentIds) : before;
    const results = ids.map(pid => {
      const certificateId = after.get(`${body.competitionId}:${pid}`) ?? null;
      const status = !recipients.some(r => r.participantId === pid) ? "NOT_IN_COMPETITION"
        : before.has(`${body.competitionId}:${pid}`) ? "EXISTING" : certificateId ? "CREATED" : "FAILED";
      return { participantId: pid, certificateId, status };
    });
    return NextResponse.json({ created, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menjana" }, { status: 500 });
  }
}
