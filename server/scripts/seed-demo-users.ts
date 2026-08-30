/**
 * Seed demo accounts for local demos/presentations.
 *
 * Registration normally requires SMTP for the activation e-mail, which local
 * dev does not have. This creates pre-verified accounts directly so the demo
 * can log in.
 *
 * Run with:
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/seed-demo-users.ts
 */

import bcrypt from "bcryptjs";
import { prisma } from "../utils/db";

// Video playback is gated on a verified Bluesky identity (see
// getLessonPlayback), so the demo learner carries a placeholder DID. A real
// Bluesky OAuth login sets these fields for itself.
const demoUsers = [
  {
    name: "María Demo",
    email: "demo@apice.local",
    password: "Demo1234!",
    role: "user",
    blueskyDid: "did:plc:apicedemolearner00000000",
    blueskyHandle: "maria.demo.apice.local",
  },
  {
    name: "Admin Ápice",
    email: "admin@apice.local",
    password: "Admin1234!",
    role: "admin",
    // Needs a DID too, otherwise the identity gate blocks video playback when
    // demoing from the admin account.
    blueskyDid: "did:plc:apicedemoadmin000000000",
    blueskyHandle: "admin.apice.local",
  },
];

async function main() {
  console.log("⏳ Seeding demo users...");

  for (const u of demoUsers) {
    const password = await bcrypt.hash(u.password, 10);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        password,
        role: u.role,
        isVerified: true,
        blueskyDid: u.blueskyDid,
        blueskyHandle: u.blueskyHandle,
      },
      create: {
        name: u.name,
        email: u.email,
        password,
        role: u.role,
        isVerified: true,
        blueskyDid: u.blueskyDid,
        blueskyHandle: u.blueskyHandle,
      },
    });

    console.log(`✅ ${user.role.padEnd(5)} ${user.email} / ${u.password}`);
  }

  console.log("🎉 Demo users ready.");
}

main()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
