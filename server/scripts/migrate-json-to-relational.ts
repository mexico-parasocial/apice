/**
 * Data Migration Script: JSON Fields → Relational Tables
 *
 * ⚠️  This script reads the legacy JSON columns (`Course.courseData`,
 * `Course.reviews`, `User.courses`) via raw SQL, because those columns have
 * been removed from the Prisma schema. It MUST run BEFORE the SQL migration
 * that drops those columns (prisma/migrations/*_drop_legacy_json_and_smash).
 *
 * Execute with:
 *   npx ts-node scripts/migrate-json-to-relational.ts
 */

import { prisma } from "../utils/db";

async function migrateCourses() {
  console.log("⏳ Migrating course data...");
  const courses = await prisma.$queryRaw<
    { id: string; name: string; courseData: any[] | null; reviews: any[] | null }[]
  >`SELECT id, name, "courseData", reviews FROM "Course"`;

  for (const course of courses) {
    const courseData = course.courseData || [];
    const reviews = course.reviews || [];

    // Migrate courseData → CourseSection + CourseLesson
    const sectionsMap = new Map<string, string>(); // title → sectionId

    for (const item of courseData) {
      const sectionTitle = item.videoSection || "General";
      let sectionId = sectionsMap.get(sectionTitle);

      if (!sectionId) {
        const section = await prisma.courseSection.create({
          data: {
            courseId: course.id,
            title: sectionTitle,
            order: Array.from(sectionsMap.keys()).length,
          },
        });
        sectionId = section.id;
        sectionsMap.set(sectionTitle, sectionId);
      }

      const lesson = await prisma.courseLesson.create({
        data: {
          sectionId,
          title: item.title || "Untitled Lesson",
          description: item.description || null,
          videoUrl: item.videoUrl || null,
          videoLength: item.videoLength || null,
          order: item.order || 0,
          isPreview: item.videoSection === "Preview" || false,
        },
      });

      // Migrate questions inside this lesson
      const questions = item.questions || [];
      for (const q of questions) {
        const question = await prisma.question.create({
          data: {
            lessonId: lesson.id,
            userId: q.user?.id || course.id, // fallback if user missing
            question: q.question || "",
          },
        });

        const replies = q.questionReplies || [];
        for (const r of replies) {
          await prisma.answer.create({
            data: {
              questionId: question.id,
              userId: r.user?.id || course.id,
              answer: r.answer || "",
            },
          });
        }
      }
    }

    // Migrate reviews → Review + ReviewReply
    for (const rev of reviews) {
      const review = await prisma.review.create({
        data: {
          courseId: course.id,
          userId: rev.user?.id || course.id,
          rating: rev.rating || 5,
          comment: rev.comment || "",
        },
      });

      const replies = rev.commentReplies || [];
      for (const r of replies) {
        await prisma.reviewReply.create({
          data: {
            reviewId: review.id,
            userId: r.user?.id || course.id,
            comment: r.comment || "",
          },
        });
      }
    }

    console.log(`  ✅ Migrated course: ${course.name}`);
  }

  console.log(`✅ Migrated ${courses.length} courses`);
}

async function migrateEnrollments() {
  console.log("⏳ Migrating enrollments...");
  const users = await prisma.$queryRaw<
    { id: string; courses: any[] | null; createdAt: Date; updatedAt: Date }[]
  >`SELECT id, courses, "createdAt", "updatedAt" FROM "User"`;

  let count = 0;
  for (const user of users) {
    const userCourses = user.courses || [];

    for (const uc of userCourses) {
      const courseId = uc.id || uc._id || uc.courseId;
      if (!courseId) continue;

      try {
        await prisma.enrollment.create({
          data: {
            userId: user.id,
            courseId,
            progress: uc.progress || 0,
            completed: uc.completed || false,
            enrolledAt: user.createdAt,
            lastAccessedAt: user.updatedAt,
          },
        });
        count++;
      } catch (err: any) {
        // Likely duplicate or missing course — skip
        if (!err.message?.includes("Unique constraint")) {
          console.warn(`  ⚠️ Skipping enrollment for user ${user.id}, course ${courseId}: ${err.message}`);
        }
      }
    }
  }

  console.log(`✅ Migrated ${count} enrollments`);
}

async function main() {
  console.log("🚀 Starting JSON → Relational migration\n");

  await migrateCourses();
  await migrateEnrollments();

  console.log("\n🎉 Migration complete!");
  console.log("Next steps:");
  console.log("  1. Verify course / review / enrollment flows against the DB");
  console.log("  2. Apply the drop_legacy_json_and_smash migration to remove the legacy columns");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
