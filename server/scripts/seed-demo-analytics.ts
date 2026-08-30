/**
 * Seed a believable cohort of learners, enrollments, orders and progress so
 * the admin dashboard's 12-month analytics charts are not empty during demos.
 *
 * Everything created here is tagged with the `@demo.apice.local` e-mail domain
 * so it can be removed again in one statement:
 *
 *   DELETE FROM "User" WHERE email LIKE '%@demo.apice.local';
 *
 * Run with:
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/seed-demo-analytics.ts
 */

import bcrypt from "bcryptjs";
import { prisma } from "../utils/db";

const DEMO_DOMAIN = "demo.apice.local";

const firstNames = [
  "María", "José", "Ana", "Luis", "Carmen", "Miguel", "Rosa", "Juan",
  "Lucía", "Carlos", "Elena", "Pedro", "Sofía", "Diego", "Marta", "Andrés",
  "Paula", "Javier", "Isabel", "Ricardo", "Valeria", "Fernando", "Daniela",
  "Alberto", "Natalia", "Sergio", "Patricia", "Rubén", "Gabriela", "Tomás",
];
const lastNames = [
  "García", "Martínez", "López", "Hernández", "Ramírez", "Torres", "Flores",
  "Rivera", "Gómez", "Díaz", "Vargas", "Castillo", "Morales", "Ortiz", "Ruiz",
];

/** Deterministic PRNG so repeated runs produce a stable-looking dataset. */
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * A date `monthsAgo` months back, on a random day/hour. Signups ramp up over
 * the year rather than being uniform, which reads as growth on the chart.
 */
function dateMonthsAgo(monthsAgo: number) {
  const now = new Date();
  const d = new Date(now);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(1 + Math.floor(rand() * 27));
  d.setHours(Math.floor(rand() * 24), Math.floor(rand() * 60), 0, 0);
  // The current-month bucket can land past today, which surfaces as
  // "in 3 days" in the admin's timeago columns. Keep everything in the past.
  return d > now ? new Date(now.getTime() - Math.floor(rand() * 86400000)) : d;
}

async function main() {
  console.log("⏳ Seeding demo analytics cohort...");

  const courses = await prisma.course.findMany({
    include: { sections: { include: { lessons: true } } },
  });

  if (courses.length === 0) {
    console.error("❌ No courses found. Run scripts/seed-courses.ts first.");
    process.exit(1);
  }

  const password = await bcrypt.hash("Demo1234!", 10);

  // Signups per month, oldest → newest. Rising trend.
  const signupsByMonth = [1, 2, 2, 3, 3, 4, 5, 5, 7, 8, 10, 12];
  let created = 0;
  let orders = 0;
  let enrollments = 0;

  for (let i = 0; i < signupsByMonth.length; i++) {
    const monthsAgo = signupsByMonth.length - 1 - i;
    for (let n = 0; n < signupsByMonth[i]; n++) {
      const first = pick(firstNames);
      const last = pick(lastNames);
      const createdAt = dateMonthsAgo(monthsAgo);
      const email = `${first}.${last}.${created}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") + `@${DEMO_DOMAIN}`;

      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          name: `${first} ${last}`,
          email,
          password,
          role: "user",
          isVerified: true,
          createdAt,
        },
      });
      created++;

      // Each learner enrols in 1–3 courses, starting with the free intro.
      const courseCount = 1 + Math.floor(rand() * 3);
      const chosen = [...courses]
        .sort(() => rand() - 0.5)
        .slice(0, courseCount);

      for (const course of chosen) {
        const enrolledAt = new Date(
          createdAt.getTime() + Math.floor(rand() * 5 * 86400000)
        );

        const lessons = course.sections.flatMap((s) => s.lessons);
        // How far this learner got: most drop off, some finish.
        const completedCount = Math.floor(rand() * (lessons.length + 1));
        const progress = lessons.length
          ? Math.round((completedCount / lessons.length) * 100)
          : 0;

        const enrollment = await prisma.enrollment.upsert({
          where: { userId_courseId: { userId: user.id, courseId: course.id } },
          update: {},
          create: {
            userId: user.id,
            courseId: course.id,
            progress,
            completed: progress === 100,
            enrolledAt,
            lastAccessedAt: enrolledAt,
          },
        });
        enrollments++;

        const ordered = [...lessons].sort((a, b) => a.order - b.order);
        for (let li = 0; li < completedCount; li++) {
          await prisma.enrollmentLesson.upsert({
            where: {
              userId_lessonId: {
                userId: user.id,
                lessonId: ordered[li].id,
              },
            },
            update: {},
            create: {
              enrollmentId: enrollment.id,
              userId: user.id,
              lessonId: ordered[li].id,
              completed: true,
              watchedSeconds: ordered[li].videoLength ?? 0,
            },
          });
        }

        // Paid courses generate an order record.
        if (course.price > 0) {
          await prisma.order.create({
            data: {
              courseId: course.id,
              userId: user.id,
              payment_info: { status: "succeeded", demo: true },
              createdAt: enrolledAt,
            },
          });
          orders++;
        }
      }
    }
  }

  console.log(`✅ ${created} learners`);
  console.log(`✅ ${enrollments} enrollments`);
  console.log(`✅ ${orders} orders`);
  console.log("🎉 Analytics cohort ready.");
}

main()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
