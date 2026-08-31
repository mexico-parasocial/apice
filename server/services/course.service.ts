import { Response } from "express";
import { prisma } from "../utils/db";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Sync the relational course content (CourseSection/CourseLesson) from the
 * legacy editor payload shape:
 *
 *   [{ id?, title, description?, videoUrl?, videoLength?, videoSection, ... }]
 *
 * Lessons are grouped into sections by `videoSection` (order of first
 * appearance). Lessons with an existing `id` are updated in place; lessons
 * without one are created; existing lessons omitted from the payload are
 * deleted. Sections are reused by title when possible.
 */
export async function syncCourseContent(
  courseId: string,
  items: any[],
  tx?: TxClient
) {
  const client: any = tx ?? prisma;

  const existingSections = await client.courseSection.findMany({
    where: { courseId },
    include: { lessons: true },
  });

  const incomingLessonIds = new Set(
    items.filter((i) => i?.id).map((i) => i.id as string)
  );

  // Delete lessons omitted from the payload (real removals by the editor).
  const deletedLessonIds: string[] = [];
  for (const section of existingSections) {
    for (const lesson of section.lessons) {
      if (!incomingLessonIds.has(lesson.id)) {
        await client.courseLesson.delete({ where: { id: lesson.id } });
        deletedLessonIds.push(lesson.id);
      }
    }
  }

  // Drop the ATProto refs of deleted lessons. A dangling key is silently
  // skipped in credential publishing, so without this cleanup a re-added
  // lesson with a new id would never get its credential published.
  if (deletedLessonIds.length > 0) {
    await client.lessonRef.deleteMany({
      where: { courseId, lessonId: { in: deletedLessonIds } },
    });
  }

  // Group incoming lessons by section title, preserving order.
  const sectionOrder: string[] = [];
  const bySection = new Map<string, any[]>();
  for (const item of items) {
    const title = item?.videoSection || "General";
    if (!bySection.has(title)) {
      bySection.set(title, []);
      sectionOrder.push(title);
    }
    bySection.get(title)!.push(item);
  }

  const keptSectionIds = new Set<string>();

  for (const [index, title] of sectionOrder.entries()) {
    const existingSection = existingSections.find(
      (s: any) => s.title === title
    );
    const section = existingSection
      ? await client.courseSection.update({
          where: { id: existingSection.id },
          data: { order: index },
        })
      : await client.courseSection.create({
          data: { courseId, title, order: index },
        });
    keptSectionIds.add(section.id);

    const lessons = bySection.get(title)!;
    for (const [lessonIndex, item] of lessons.entries()) {
      const lessonData = {
        sectionId: section.id,
        title: item.title ?? "Untitled lesson",
        description: item.description ?? null,
        videoUrl: item.videoUrl ?? null,
        videoLength: item.videoLength ?? null,
        order: lessonIndex,
      };

      const exists =
        item.id &&
        existingSections.some((s: any) =>
          s.lessons.some((l: any) => l.id === item.id)
        );

      if (exists) {
        await client.courseLesson.update({
          where: { id: item.id },
          data: lessonData,
        });
      } else {
        await client.courseLesson.create({ data: lessonData });
      }
    }
  }

  // Delete sections that are no longer referenced by the payload.
  for (const section of existingSections) {
    if (!keptSectionIds.has(section.id)) {
      await client.courseSection.delete({ where: { id: section.id } });
    }
  }
}

// create course
export const createCourse = CatchAsyncError(async (data: any, res: Response) => {
  const { courseData, ...courseFields } = data;

  const course = await prisma.$transaction(async (tx) => {
    const created = await tx.course.create({ data: courseFields });
    if (Array.isArray(courseData) && courseData.length > 0) {
      await syncCourseContent(created.id, courseData, tx);
    }
    return created;
  });

  res.status(201).json({
    success: true,
    course,
  });
});

// Get All Courses
export const getAllCoursesService = async (res: Response) => {
  const courses = await prisma.course.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  res.status(201).json({
    success: true,
    courses,
  });
};
