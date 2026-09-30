/**
 * Repair participant emails that no third party will accept.
 *
 * Asia Spark Quizzly validates `email` and rejects the whole registration when
 * it is malformed, so a bad address silently locks a participant out of the
 * quiz (see src/lib/asiaspark-quizzly.ts). The code now omits invalid emails so
 * nobody is blocked, but the stored values are still wrong; this repairs the
 * ones that can be repaired without guessing.
 *
 * Only lossless folding is applied — NFKC (fullwidth `＠` → `@`, `．` → `.`)
 * plus whitespace removal — and the result is written only if it then passes
 * validation. Anything needing a judgement call (`gmail,com`, `@skbb`,
 * `@moe`, a phone number, `-`) is reported, never altered: guessing somebody's
 * address is worse than leaving it blank.
 *
 *   npx tsx prisma/repair-participant-emails.ts            # dry run (default)
 *   npx tsx prisma/repair-participant-emails.ts --apply    # write
 *   npx tsx prisma/repair-participant-emails.ts --list     # full unfixable list
 */

import { PrismaClient } from "@prisma/client";
import { isValidEmail, normaliseEmail } from "../src/lib/email";

const db = new PrismaClient();

const isValid = isValidEmail;

async function main() {
  const apply = process.argv.includes("--apply");
  const list  = process.argv.includes("--list");

  const rows = await db.participant.findMany({
    where:  { email: { not: null } },
    select: { id: true, name: true, email: true, ic: true },
  });

  const broken = rows.filter((r) => r.email && r.email.trim() !== "" && !isValid(r.email));
  const repairable: { id: string; name: string; from: string; to: string }[] = [];
  const manual:     { name: string; ic: string | null; email: string }[]     = [];

  for (const r of broken) {
    const fixed = normaliseEmail(r.email);
    if (fixed && fixed !== r.email) repairable.push({ id: r.id, name: r.name, from: r.email!, to: fixed });
    else manual.push({ name: r.name, ic: r.ic, email: r.email! });
  }

  console.log(`participants with an email : ${rows.filter((r) => r.email?.trim()).length}`);
  console.log(`malformed                  : ${broken.length}`);
  console.log(`repairable losslessly      : ${repairable.length}`);
  console.log(`need a human               : ${manual.length}`);

  if (repairable.length > 0) {
    console.log("\n── repairable ──");
    for (const r of repairable) console.log(`  ${r.name}\n    ${r.from}  →  ${r.to}`);
  }

  if (manual.length > 0) {
    console.log(`\n── need a human (${list ? "all" : "first 20"}) ──`);
    for (const m of (list ? manual : manual.slice(0, 20)))
      console.log(`  ${(m.ic ?? "—").padEnd(14)} ${m.name.padEnd(34)} ${m.email}`);
    if (!list && manual.length > 20) console.log(`  … ${manual.length - 20} more (--list to print all)`);
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to repair.");
    return;
  }

  for (const r of repairable) {
    await db.participant.update({ where: { id: r.id }, data: { email: r.to } });
    console.log(`updated ${r.id} ${r.from} → ${r.to}`);
  }
  console.log(`\n${repairable.length} repaired, ${manual.length} left for the organizer.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
