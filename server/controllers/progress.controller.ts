import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { prisma } from "../utils/db";
import { recordLessonProgress } from "../services/progress.service";
import {
  computeLessonProgress,
  summarizeCourseProgress,
} from "../utils/courseProgress";
import { z } from "zod";

const updateProgressSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().min(1),
  completed: z.boolean().optional(),
  watchedSeconds: z.number().int().min(0).optional(),
});

/**
 * Returns all lessons in a course with the user's completion status.
 * Shape is optimized for the lesson road UI.
 */
export const getProgress = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
              },
            },
          },
          enrollments: {
            where: { userId },
            include: {
              completedLessons: true,
            },
          },
        },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const enrollment = course.enrollments[0] ?? null;
      const completedLessonIds = new Set(
        enrollment?.completedLessons.filter((l) => l.completed).map((l) => l.lessonId) ?? []
      );
      const watchedSecondsMap = new Map(
        enrollment?.completedLessons.map((l) => [l.lessonId, l.watchedSeconds]) ?? []
      );
      const passedQuizLessonIds = new Set(
        await prisma.enrollmentQuiz
          .findMany({ where: { userId, passed: true } })
          .then((rows) => rows.map((r) => r.lessonId))
      );

      const allLessons = course.sections.flatMap((s) => s.lessons);

      // Availability/completion is computed once, in course order, by the
      // same helper the write path uses — see courseProgress.ts for why.
      const progressStates = computeLessonProgress(
        allLessons,
        completedLessonIds,
        passedQuizLessonIds
      );
      const progressById = new Map(progressStates.map((s) => [s.id, s]));

      const flatLessons = course.sections.flatMap((section, sectionIndex) =>
        section.lessons.map((lesson, lessonIndex) => {
          const globalIndex =
            course.sections
              .slice(0, sectionIndex)
              .reduce((acc, s) => acc + s.lessons.length, 0) + lessonIndex;
          const state = progressById.get(lesson.id)!;

          return {
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            videoLength: lesson.videoLength,
            sectionTitle: section.title,
            globalIndex,
            completed: state.completed,
            available: state.available,
            isCheckpoint: state.isCheckpoint,
            quizPassed: state.quizPassed,
            watchedSeconds: watchedSecondsMap.get(lesson.id) ?? 0,
          };
        })
      );

      const { progress, courseCompleted } = summarizeCourseProgress(progressStates);

      // Keep enrollment progress in sync with lesson completions
      if (
        enrollment &&
        (enrollment.progress !== progress || enrollment.completed !== courseCompleted)
      ) {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { progress, completed: courseCompleted },
        });
      }

      res.status(200).json({
        success: true,
        progress,
        completed: courseCompleted,
        lastAccessedAt: enrollment?.lastAccessedAt ?? null,
        lessons: flatLessons,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * Marks a lesson as completed (or partially watched) for the enrolled user.
 */
export const updateProgress = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateProgressSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { courseId, lessonId, completed = true, watchedSeconds } = parsed.data;
      const userId = req.user?.id;

      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const result = await recordLessonProgress({
        userId,
        courseId,
        lessonId,
        completed,
        watchedSeconds,
      });

      res.status(200).json({
        success: true,
        message: "Lesson progress updated",
        progress: result.progress,
        completed: result.courseCompleted,
      });
    } catch (error: any) {
      // recordLessonProgress throws a typed ErrorHandler (e.g. 423 when the
      // lesson isn't unlocked yet) — preserve its status instead of masking
      // everything as a 500.
      return next(
        error instanceof ErrorHandler ? error : new ErrorHandler(error.message, 500)
      );
    }
  }
);

export const getAllProgress = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        include: {
          course: {
            select: {
              id: true,
              name: true,
              thumbnail: true,
            },
          },
        },
        orderBy: { lastAccessedAt: "desc" },
      });

      res.status(200).json({
        success: true,
        enrollments,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
