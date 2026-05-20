/**
 * Export all School records to prisma/schools-export.json
 * Run: npx tsx prisma/export-schools.ts
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const db = new PrismaClient();

async function main() {
  console.log("Fetching schools...");
  const schools = await db.school.findMany({
    include: { state: { select: { code: true } } },
    orderBy: { id: "asc" },
  });

  const out = join(__dirname, "schools-export.json");
  writeFileSync(out, JSON.stringify(schools, null, 2));
  console.log(`✓ Exported ${schools.length} schools to ${out}`);
}

main().catch(console.error).finally(() => db.$disconnect());
