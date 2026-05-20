/**
 * Import schools from prisma/schools-export.json into the target DB.
 * Skips schools whose `code` already exists (idempotent).
 * Run: npx tsx prisma/import-schools.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const db = new PrismaClient();

async function main() {
  const file = join(__dirname, "schools-export.json");
  const schools = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`Importing ${schools.length} schools...`);

  // Build stateCode → stateId map from target DB
  const states = await db.state.findMany({ select: { id: true, code: true } });
  const stateMap = Object.fromEntries(states.map((s) => [s.code, s.id]));

  let created = 0;
  let skipped = 0;

  for (const school of schools) {
    const stateId = stateMap[school.state?.code ?? ""];
    if (!stateId) { skipped++; continue; }

    await db.school.upsert({
      where: { code: school.code },
      create: {
        code:       school.code,
        name:       school.name,
        level:      school.level,
        category:   school.category,
        address:    school.address,
        city:       school.city,
        postcode:   school.postcode,
        stateId,
      },
      update: {},
    });
    created++;

    if (created % 500 === 0) console.log(`  ... ${created} done`);
  }

  console.log(`✓ Imported ${created} schools (${skipped} skipped — no matching state)`);
}

main().catch(console.error).finally(() => db.$disconnect());
