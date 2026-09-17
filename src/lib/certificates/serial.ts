/**
 * Serial numbers: `MT{YY}/{TYPE}/{000001}` — e.g. MT26/GEN/000475.
 *
 * Every mt25 serial is in fact four-part — `MT25/CONT/T29/000001`, where `T29`
 * is the template id — because its counters were keyed by
 * (year, targetType, templateId). That is why 58 counter rows existed for 9 type
 * codes and why the printed sequence restarts per template (`PART` tops out at
 * 7,208 across 24,942 certificates).
 *
 * New issues drop the template segment and count per (season, typeCode), so the
 * sequence is one continuous line per printed type. Imported serials are never
 * rewritten — they are already printed — and the two shapes cannot collide
 * because the template segment makes the strings different.
 *
 * Gaps are acceptable; uniqueness and monotonicity are not negotiable.
 */

import { randomBytes } from "crypto";
import { CertTargetType, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export const TYPE_CODE: Record<CertTargetType, string> = {
  [CertTargetType.GENERAL]:                 "GEN",
  [CertTargetType.EVENT_PARTICIPANT]:       "PART",
  [CertTargetType.EVENT_WINNER]:            "WIN",
  [CertTargetType.NON_CONTEST_PARTICIPANT]: "NCP",
  [CertTargetType.QUIZ_PARTICIPANT]:        "QPART",
  [CertTargetType.QUIZ_WINNER]:             "QWIN",
  [CertTargetType.TRAINER]:                 "TRAIN",
  [CertTargetType.CONTINGENT]:              "CONT",
  [CertTargetType.SCHOOL_WINNER]:           "SWIN",
};

export function formatSerial(prefix: string, typeCode: string, sequence: number): string {
  return `${prefix}/${typeCode}/${String(sequence).padStart(6, "0")}`;
}

/** Accepts both the new three-part form and mt25's four-part `…/T29/000001`. */
export function parseSerial(
  serial: string,
): { prefix: string; typeCode: string; templateSegment: string | null; sequence: number } | null {
  const m = /^([A-Z0-9]+)\/([A-Z]+)(?:\/(T\d+))?\/(\d+)$/.exec(serial.trim());
  if (!m) return null;
  return { prefix: m[1], typeCode: m[2], templateSegment: m[3] ?? null, sequence: Number(m[4]) };
}

/** Opaque token for public verification — serials are enumerable, this is not. */
export function newUniqueCode(): string {
  return randomBytes(12).toString("hex");
}

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Allocates the next sequence for (season, typeCode) in a single atomic
 * statement. No application-level locking, no read-then-write race.
 */
export async function allocateSerial(
  tx: Tx,
  season: { id: string; serialPrefix: string; archivedAt: Date | null },
  targetType: CertTargetType,
): Promise<string> {
  if (season.archivedAt)
    throw new Error(`Season ${season.id} is archived — issuing new certificates into it is not allowed`);

  const typeCode = TYPE_CODE[targetType];

  const rows = await tx.$queryRaw<{ lastSequence: number }[]>`
    INSERT INTO cert_serial_counters ("id", "seasonId", "typeCode", "lastSequence", "updatedAt")
    VALUES (gen_random_uuid()::text, ${season.id}, ${typeCode}, 1, now())
    ON CONFLICT ("seasonId", "typeCode")
    DO UPDATE SET "lastSequence" = cert_serial_counters."lastSequence" + 1, "updatedAt" = now()
    RETURNING "lastSequence"`;

  return formatSerial(season.serialPrefix, typeCode, rows[0].lastSequence);
}
