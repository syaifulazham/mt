/**
 * General participation certificates ("Penyertaan Umum"), issued by contingent
 * managers from the manager portal: Sijil → School / Contingent Level Cert.
 *
 * The organizer creates one generator with source GENERAL and sets its
 * template (Certificates → Generator). The newest such generator is the active
 * one. Managers pick a competition, tick their participants and issue — one
 * certificate per (competition, participant), distributed at Peringkat Sekolah.
 * A participant who already has one (under any General template) is not issued
 * a second.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const GENERAL_SOURCE = "GENERAL";
/** Participants per issue request: small, so the portal can show progress. */
export const GENERAL_CHUNK = 10;
/** Certificates per merged PDF download. */
export const GENERAL_PDF_MAX = 200;

/** The active General generator with its template, or null when none is set up (or its template can't issue). */
export async function activeGeneralJob() {
  const job = await db.certGeneratorJob.findFirst({ where: { source: GENERAL_SOURCE }, orderBy: { createdAt: "desc" } });
  if (!job) return null;
  const template = await db.certTemplate.findUnique({
    where:  { id: job.templateId },
    select: { id: true, name: true, currentVersionId: true, status: true, season: { select: { archivedAt: true } } },
  });
  if (!template?.currentVersionId || template.season.archivedAt) return null;
  return { job, template };
}

/** General certificates already issued to these contingents: "competitionId:participantId" → certificate id. */
export async function issuedGeneral(contingentIds: string[]): Promise<Map<string, string>> {
  if (!contingentIds.length) return new Map();
  const rows = await db.$queryRaw<{ id: string; k: string }[]>`
    SELECT id, meta->>'genKey' AS k FROM certificates
    WHERE "contingentId" IN (${Prisma.join(contingentIds)}) AND status <> 'REVOKED'
      AND meta->>'genKey' LIKE '%:general:%'`;
  const out = new Map<string, string>();
  for (const r of rows) {
    const m = /:general:([^:]+):([^:]+)$/.exec(r.k ?? "");
    if (m && !out.has(`${m[1]}:${m[2]}`)) out.set(`${m[1]}:${m[2]}`, r.id);
  }
  return out;
}
