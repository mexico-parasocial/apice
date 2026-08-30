import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { prisma } from "../utils/db";
import { computeLessonProgress } from "../utils/courseProgress";
import { z } from "zod";

const quizQuestionSchema = z.object({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().min(0),
});

const createQuizSchema = z.object({
  lessonId: z.string().min(1),
  questions: z.array(quizQuestionSchema).min(1),
});

const submitQuizSchema = z.object({
  answers: z.array(z.number().int().min(0)).min(1),
});

/**
 * Resolves a lesson to its course and the enrollment status of `userId`.
 * Every quiz endpoint needs this to know whether the caller may see/attempt
 * the quiz at all, and (for submission) whether the lesson is unlocked.
 */
async function loadLessonContext(lessonId: string, userId: string) {
  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    include: { section: { select: { courseId: true } } },
  });
  if (!lesson) return null;

  const courseId = lesson.section.courseId;

  const [enrollment, courseLessons] = await Promise.all([
    prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    }),
    prisma.courseLesson.findMany({
      where: { section: { courseId } },
      select: { id: true, isCheckpoint: true },
      orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
    }),
  ]);

  return { lesson, courseId, enrollment, courseLessons };
}

/**
 * Admin endpoint: create or replace the quiz for a lesson. Attaching a quiz
 * always makes the lesson a checkpoint — "has a quiz" and "is a checkpoint"
 * are the same concept by construction, so the two can't drift apart.
 */
export const createQuiz = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createQuizSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { lessonId, questions } = parsed.data;

      const lesson = await prisma.courseLesson.findUnique({
        where: { id: lessonId },
      });
      if (!lesson) {
        return next(new ErrorHandler("Lesson not found", 404));
      }

      await prisma.courseLesson.update({
        where: { id: lessonId },
        data: { isCheckpoint: true },
      });

      const quiz = await prisma.quiz.upsert({
        where: { lessonId },
        update: { questions },
        create: { lessonId, questions },
      });

      res.status(200).json({ success: true, quiz });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * Admin endpoint: remove a lesson's quiz and clear its checkpoint status.
 * Past attempts (EnrollmentQuiz rows) are left alone as a historical record —
 * they stop mattering once the lesson is no longer a checkpoint.
 */
export const deleteQuiz = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lessonId } = req.params;

      const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
      if (!quiz) {
        return next(new ErrorHandler("Quiz not found", 404));
      }

      await prisma.$transaction([
        prisma.quiz.delete({ where: { lessonId } }),
        prisma.courseLesson.update({
          where: { id: lessonId },
          data: { isCheckpoint: false },
        }),
      ]);

      res.status(200).json({ success: true });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * Get the quiz for a lesson.
 *
 * Admins get the full record (including correct answers) so the authoring UI
 * can prefill an edit form — they don't need to be enrolled. Everyone else
 * gets the enrollment-gated, answer-stripped version used by the quiz screen.
 */
export const getQuiz = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lessonId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
      if (!quiz) {
        return next(new ErrorHandler("Quiz not found", 404));
      }

      if (req.user?.role === "admin") {
        return res.status(200).json({ success: true, quiz });
      }

      const context = await loadLessonContext(lessonId, userId);
      if (!context) {
        return next(new ErrorHandler("Lesson not found", 404));
      }
      if (!context.enrollment) {
        return next(
          new ErrorHandler("You are not enrolled in this course", 403)
        );
      }

      const sanitizedQuestions = quiz.questions.map((q: any) => ({
        text: q.text,
        options: q.options,
      }));

      res.status(200).json({
        success: true,
        quiz: { ...quiz, questions: sanitizedQuestions },
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * Submit a quiz attempt. Returns score and pass status.
 * Pass threshold: 70%.
 *
 * Requires enrollment, and requires the lesson to actually be unlocked —
 * without that second check a learner could farm every checkpoint's quiz
 * through the API before ever reaching the content it's meant to confirm
 * they engaged with.
 */
export const submitQuiz = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = submitQuizSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { lessonId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const quiz = await prisma.quiz.findUnique({
        where: { lessonId },
      });
      if (!quiz) {
        return next(new ErrorHandler("Quiz not found", 404));
      }

      const context = await loadLessonContext(lessonId, userId);
      if (!context) {
        return next(new ErrorHandler("Lesson not found", 404));
      }
      if (!context.enrollment) {
        return next(
          new ErrorHandler("You are not enrolled in this course", 403)
        );
      }

      const completedLessonIds = new Set(
        await prisma.enrollmentLesson
          .findMany({
            where: {
              userId,
              lessonId: { in: context.courseLessons.map((l) => l.id) },
              completed: true,
            },
            select: { lessonId: true },
          })
          .then((rows) => rows.map((r) => r.lessonId))
      );
      const passedQuizLessonIds = new Set(
        await prisma.enrollmentQuiz
          .findMany({
            where: {
              userId,
              passed: true,
              lessonId: { in: context.courseLessons.map((l) => l.id) },
            },
            select: { lessonId: true },
          })
          .then((rows) => rows.map((r) => r.lessonId))
      );
      const states = computeLessonProgress(
        context.courseLessons,
        completedLessonIds,
        passedQuizLessonIds
      );
      const target = states.find((s) => s.id === lessonId);
      if (target && !target.available) {
        return next(
          new ErrorHandler(
            "This lesson isn't unlocked yet — you can't take its quiz.",
            423
          )
        );
      }

      const answers = parsed.data.answers;
      let correctCount = 0;
      const detailedAnswers = (quiz.questions as any[]).map((q, idx) => {
        const selected = answers[idx] ?? -1;
        const isCorrect = selected === q.correctIndex;
        if (isCorrect) correctCount++;
        return {
          questionText: q.text,
          selectedOption: selected,
          correctOption: q.correctIndex,
          isCorrect,
        };
      });

      const total = quiz.questions.length;
      const score = total === 0 ? 0 : Math.round((correctCount / total) * 100);
      const passed = score >= 70;

      await prisma.enrollmentQuiz.upsert({
        where: {
          userId_lessonId: { userId, lessonId },
        },
        update: {
          passed,
          score,
          answers: detailedAnswers as any,
        },
        create: {
          userId,
          lessonId,
          passed,
          score,
          answers: detailedAnswers as any,
        },
      });

      res.status(200).json({
        success: true,
        passed,
        score,
        correctCount,
        total,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * Fetch the calling user's own quiz result for a lesson (not admin-only,
 * despite the name of the resource — it's scoped to req.user.id below).
 */
export const getQuizResult = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lessonId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const result = await prisma.enrollmentQuiz.findUnique({
        where: {
          userId_lessonId: { userId, lessonId },
        },
      });

      res.status(200).json({
        success: true,
        result,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
