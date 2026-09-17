/**
 * Guards the certificate archival contract.
 *
 * Run: npx tsx prisma/check-archival-contract.ts
 *
 * `certificates` must have foreign keys to `seasons` and `cert_template_versions`
 * and to nothing else. The moment someone "helpfully" normalises
 * `participantId` / `contingentId` / `teamId` / `eventId` / `competitionId` into
 * real relations, deleting a past season's participants either cascades into
 * 117 k certificates or fails on a constraint — and the whole point of the
 * module is that neither can happen.
 *
 * Exits non-zero on violation, so it can gate a deploy.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type Violation = { conname: string; references: string };

async function main() {
  const violations = await db.$queryRaw<Violation[]>`
    SELECT conname, confrelid::regclass::text AS references
    FROM pg_constraint
    WHERE conrelid = 'certificates'::regclass
      AND contype  = 'f'
      AND confrelid::regclass::text NOT IN ('seasons', 'cert_template_versions')`;

  if (violations.length) {
    console.error("ARCHIVAL CONTRACT VIOLATED — certificates has foreign keys into purgeable tables:");
    for (const v of violations) console.error(`  ${v.conname} → ${v.references}`);
    console.error("\nThose columns are soft references on purpose. See the CERTIFICATES block in prisma/schema.prisma.");
    process.exitCode = 1;
    return;
  }

  const [{ count }] = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) count FROM pg_constraint
    WHERE conrelid = 'certificates'::regclass AND contype = 'f'`;
  console.log(`archival contract ok — certificates has ${count} foreign keys, all into seasons / cert_template_versions`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
