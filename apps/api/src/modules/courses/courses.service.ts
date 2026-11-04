import { prisma } from "../../platform/db";
import ErrorHandler from "../../http/ErrorHandler";
import { Prisma } from "@prisma/client";
import { assertApprovedInstructorVideo } from "../video/instructors";

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
export interface SyncCourseContentOptions {
  /**
   * Deleting a lesson cascades to every learner's progress on it, its Q&A
   * and its quiz. Without this flag the sync refuses (409) when any lesson
   * it would delete has learner progress, so an editor bug that drops a
   * lesson id can't silently wipe progress.
   */
  confirmDeleteLessonsWithProgress?: boolean;
}

export async function syncCourseContent(
  courseId: string,
  items: any[],
  tx?: TxClient,
  options: SyncCourseContentOptions = {}
) {
  const client: any = tx ?? prisma;

  // The editor writes lesson video refs straight from its payload, so apply
  // the same instructor allowlist as the attach endpoint before touching rows.
  for (const item of items) {
    if (typeof item?.videoUrl === "string" && item.videoUrl.startsWith("at://")) {
      assertApprovedInstructorVideo(item.videoUrl);
    }
  }

  const existingSections = await client.courseSection.findMany({
    where: { courseId },
    include: { lessons: true },
  });

  const incomingLessonIds = new Set(
    items.filter((i) => i?.id).map((i) => i.id as string)
  );

  // Lessons omitted from the payload are removals by the editor.
  const toDelete = existingSections.flatMap((section: any) =>
    section.lessons.filter((lesson: any) => !incomingLessonIds.has(lesson.id))
  );

  if (toDelete.length > 0 && !options.confirmDeleteLessonsWithProgress) {
    const withProgress = await client.enrollmentLesson.groupBy({
      by: ["lessonId"],
      where: { lessonId: { in: toDelete.map((l: any) => l.id) } },
      _count: { _all: true },
    });
    if (withProgress.length > 0) {
      const titles = toDelete
        .filter((l: any) => withProgress.some((w: any) => w.lessonId === l.id))
        .map((l: any) => `"${l.title}"`);
      throw new ErrorHandler(
        `This would delete ${titles.length} lesson(s) with learner progress: ${titles.join(", ")}. ` +
          "Resend with confirmDeleteLessonsWithProgress: true to delete them anyway.",
        409
      );
    }
  }

  const deletedLessonIds: string[] = [];
  for (const lesson of toDelete) {
    await client.courseLesson.delete({ where: { id: lesson.id } });
    deletedLessonIds.push(lesson.id);
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

// create course (with its sections/lessons) in one transaction
export async function createCourse(data: any) {
  const { courseData, ...courseFields } = data;

  return prisma.$transaction(async (tx) => {
    const created = await tx.course.create({ data: courseFields });
    if (Array.isArray(courseData) && courseData.length > 0) {
      await syncCourseContent(created.id, courseData, tx);
    }
    return created;
  });
}

// Get All Courses
export const getAllCoursesService = () =>
  prisma.course.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

/**
 * Recompute a course's average rating from its reviews. The average is taken
 * in the database: loading every review to average them doesn't scale.
 */
export async function refreshCourseRating(courseId: string, tx?: TxClient) {
  const client = tx ?? prisma;
  const agg = await client.review.aggregate({
    where: { courseId },
    _avg: { rating: true },
  });

  // NOTE: `purchased` is deliberately not written here. It counts orders
  // (see order.service); a review handler once overwrote it with the review
  // count, corrupting the counter on every review.
  return client.course.update({
    where: { id: courseId },
    data: { ratings: agg._avg.rating ?? 0 },
  });
}
