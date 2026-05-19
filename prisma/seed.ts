import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const db = new PrismaClient();

const MY_STATES = [
  { name: "Johor", code: "JHR" },
  { name: "Kedah", code: "KDH" },
  { name: "Kelantan", code: "KTN" },
  { name: "Melaka", code: "MLK" },
  { name: "Negeri Sembilan", code: "NSN" },
  { name: "Pahang", code: "PHG" },
  { name: "Perak", code: "PRK" },
  { name: "Perlis", code: "PLS" },
  { name: "Pulau Pinang", code: "PNG" },
  { name: "Sabah", code: "SBH" },
  { name: "Sarawak", code: "SWK" },
  { name: "Selangor", code: "SGR" },
  { name: "Terengganu", code: "TRG" },
  { name: "Wilayah Persekutuan Kuala Lumpur", code: "WPK" },
  { name: "Wilayah Persekutuan Labuan", code: "WPL" },
  { name: "Wilayah Persekutuan Putrajaya", code: "WPP" },
];

async function main() {
  console.log("Seeding database…");

  // Malaysia country
  const malaysia = await db.country.upsert({
    where: { codeIso2: "MY" },
    create: { name: "Malaysia", codeIso2: "MY", codeIso3: "MYS" },
    update: {},
  });

  console.log("  ✓ Malaysia country");

  // Malaysian states
  for (const state of MY_STATES) {
    await db.state.upsert({
      where: { code: state.code },
      create: { name: state.name, code: state.code, countryId: malaysia.id },
      update: { name: state.name },
    });
  }

  console.log(`  ✓ ${MY_STATES.length} states`);

  // SUPER_ADMIN user
  const seedPassword = process.env.AUTH_SEED_PASSWORD ?? "TechlympicsDev@2025";
  const passwordHash = await argon2.hash(seedPassword);

  const superAdmin = await db.organizerUser.upsert({
    where: { email: "admin@techlympics.my" },
    create: {
      email: "admin@techlympics.my",
      name: "Super Admin",
      passwordHash,
      role: "SUPER_ADMIN",
      forcePasswordChange: false,
      isActive: true,
    },
    update: {},
  });

  console.log(`  ✓ SUPER_ADMIN: ${superAdmin.email}`);
  console.log(`    Password: ${seedPassword}`);
  console.log("\nSeeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
