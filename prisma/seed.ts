import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const db = new PrismaClient();

const THEMES = [
  { name: "Robotics & Automation",  color: "#00F5FF", logoUrl: "🤖", description: "Design and program autonomous robots to tackle real-world challenges in timed arenas." },
  { name: "AI & Machine Learning",  color: "#FFD700", logoUrl: "🧠", description: "Build intelligent systems that learn, adapt, and solve complex problems using cutting-edge AI." },
  { name: "Drone Racing & FPV",     color: "#CC0001", logoUrl: "🚁", description: "Navigate custom-built drones through precision obstacle courses at breakneck speeds." },
  { name: "Cybersecurity",          color: "#7B61FF", logoUrl: "💻", description: "Capture the flag, penetration testing, and digital forensics challenges for elite defenders." },
  { name: "GreenTech Innovation",   color: "#00FF9D", logoUrl: "🌱", description: "Prototype sustainable tech solutions addressing Malaysia's environmental challenges." },
  { name: "Game Dev Challenge",     color: "#FF6B35", logoUrl: "🎮", description: "Create original games from scratch in a 48-hour jam judged on creativity and playability." },
  { name: "IoT & Smart Systems",    color: "#00C8FF", logoUrl: "💡", description: "Design connected devices and systems that bring intelligence to everyday Malaysian life." },
  { name: "Science Olympiad",       color: "#FFD700", logoUrl: "🔬", description: "Multi-discipline STEM competitions spanning physics, chemistry, biology, and mathematics." },
];

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
  // Competition themes
  for (const theme of THEMES) {
    await db.theme.upsert({
      where:  { name: theme.name },
      create: theme,
      update: { color: theme.color, logoUrl: theme.logoUrl, description: theme.description },
    });
  }
  console.log(`  ✓ ${THEMES.length} themes`);

  console.log("\nSeeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
