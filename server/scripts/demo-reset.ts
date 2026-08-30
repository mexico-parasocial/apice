/**
 * Reset the demo learner back to a clean starting state, so the same demo can
 * be run repeatedly: enrolled in every course, zero lessons completed.
 *
 * Leaves the seeded analytics cohort (@demo.apice.local) untouched — only the
 * account shown on stage is rewound.
 *
 * Run with:
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/demo-reset.ts
 */

import { prisma } from "../utils/db";

const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@apice.local";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    console.error(
      `❌ ${DEMO_EMAIL} not found. Run scripts/seed-demo-users.ts first.`
    );
    process.exit(1);
  }

  const courses = await prisma.course.findMany({ select: { id: true, name: true } });

  const cleared = await prisma.enrollmentLesson.deleteMany({
    where: { userId: user.id },
  });

  await prisma.enrollment.updateMany({
    where: { userId: user.id },
    data: { progress: 0, completed: false },
  });

  for (const course of courses) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      update: { progress: 0, completed: false },
      create: {
        userId: user.id,
        courseId: course.id,
        progress: 0,
        completed: false,
        enrolledAt: new Date(),
        lastAccessedAt: new Date(),
      },
    });
  }

  await prisma.certificate.deleteMany({ where: { userId: user.id } });

  // Completion notifications outlive progress, so a reset account would still
  // show "¡Programa completado!" from a previous run.
  const notifications = await prisma.notification.deleteMany({
    where: { userId: user.id },
  });

  console.log(`✅ ${DEMO_EMAIL} reset`);
  console.log(`   • ${cleared.count} lesson completions cleared`);
  console.log(`   • ${notifications.count} notifications cleared`);
  console.log(`   • enrolled in ${courses.length} programs at 0%`);
}

main()
  .catch((err) => {
    console.error("❌ Reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
