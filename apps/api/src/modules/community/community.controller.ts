import { prisma } from "../../platform/db";
import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../../http/catchAsyncErrors";
import ErrorHandler from "../../http/ErrorHandler";
import { refreshCourseRating } from "../courses/courses.service";
import { redis } from "../../platform/redis";
import { notify } from "../notifications/notifications.service";
import { courseCacheKey } from "../../platform/cache";
import sendMail from "../../platform/mail";
import { sendPushToUser } from "../push/push.service";
import { z } from "zod";
import { logger } from "../../platform/logger";

/** Q&A is for the course's learners (and staff answering them). */
async function canParticipate(req: Request, courseId: string) {
  if (req.user?.role === "admin") return true;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: req.user!.id, courseId } },
    select: { id: true },
  });
  return enrollment !== null;
}

// add question in course
const addQuestionSchema = z.object({
  question: z.string().min(1),
  courseId: z.string().min(1),
  contentId: z.string().min(1),
});

export const addQuestion = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = addQuestionSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { question, courseId, contentId } = parsed.data;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const lesson = await prisma.courseLesson.findUnique({
        where: { id: contentId },
        include: { section: { select: { courseId: true } } },
      });

      if (!lesson || lesson.section.courseId !== courseId) {
        return next(new ErrorHandler("Invalid content id", 400));
      }

      if (!(await canParticipate(req, courseId))) {
        return next(new ErrorHandler("You are not enrolled in this course", 403));
      }

      const newQuestion = await prisma.question.create({
        data: {
          lessonId: contentId,
          userId: req.user!.id,
          question,
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          replies: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
          },
        },
      });

      await notify({
        audience: "admin",
        title: "New Question Received",
        message: `${req.user?.name ?? "A learner"} asked a question in ${lesson.title}`,
      });

      res.status(200).json({
        success: true,
        question: newQuestion,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// add answer in course question
const addAnswerSchema = z.object({
  answer: z.string().min(1),
  courseId: z.string().min(1),
  contentId: z.string().min(1),
  questionId: z.string().min(1),
});

export const addAnswer = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = addAnswerSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { answer, courseId, contentId, questionId } = parsed.data;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          lesson: true,
        },
      });

      if (!question || question.lessonId !== contentId) {
        return next(new ErrorHandler("Invalid question id", 400));
      }
      const questionLesson = await prisma.courseLesson.findUnique({
        where: { id: question.lessonId },
        select: { section: { select: { courseId: true } } },
      });
      if (questionLesson?.section.courseId !== courseId) {
        return next(new ErrorHandler("Invalid question id", 400));
      }

      if (!(await canParticipate(req, courseId))) {
        return next(new ErrorHandler("You are not enrolled in this course", 403));
      }

      const newAnswer = await prisma.answer.create({
        data: {
          questionId,
          userId: req.user!.id,
          answer,
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });

      if (req.user?.id === question.user.id) {
        await notify({
          audience: "admin",
          title: "New Question Reply Received",
          message: `${req.user?.name ?? "A learner"} replied to their question in ${question.lesson.title}`,
        });
      } else {
        const data = {
          name: question.user.name,
          title: question.lesson.title,
        };

        // The answer is already saved: a mail failure is logged, not
        // reported to the person who answered as if their answer failed.
        try {
          await sendMail({
            email: question.user.email,
            subject: "Question Reply",
            template: "question-reply.ejs",
            data,
          });
        } catch (error) {
          logger.error({ err: error, questionId }, "question reply mail failed");
        }

        void sendPushToUser(question.user.id, {
          title: "Respondieron tu pregunta",
          body: `Tu pregunta en "${question.lesson.title}" tiene una respuesta nueva.`,
          data: { questionId },
        });
      }

      res.status(200).json({
        success: true,
        answer: newAnswer,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// add review in course
const addReviewSchema = z.object({
  review: z.string().min(1),
  rating: z.number().min(1).max(5),
});

export const addReview = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const courseId = req.params.id;

      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: userId!, courseId } },
      });

      if (!enrollment) {
        return next(
          new ErrorHandler("You are not eligible to access this course", 404)
        );
      }

      const parsed = addReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { review, rating } = parsed.data;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const newReview = await prisma.review.create({
        data: {
          courseId,
          userId: userId!,
          rating,
          comment: review,
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });

      await refreshCourseRating(courseId);

      // The cached public course carries the reviews and the rating, so drop
      // it; the next GET rebuilds the full view. Writing the bare course row
      // here would serve a course with no curriculum and no reviews.
      await redis.del(courseCacheKey(courseId));

      await notify({
        audience: "admin",
        title: "New Review Received",
        message: `${req.user?.name} has given a review in ${course?.name}`,
      });

      res.status(200).json({
        success: true,
        review: newReview,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// add reply in review
const addReviewReplySchema = z.object({
  comment: z.string().min(1),
  courseId: z.string().min(1),
  reviewId: z.string().min(1),
});

export const addReplyToReview = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = addReviewReplySchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { comment, courseId, reviewId } = parsed.data;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const review = await prisma.review.findUnique({
        where: { id: reviewId },
      });

      if (!review) {
        return next(new ErrorHandler("Review not found", 404));
      }

      const reply = await prisma.reviewReply.create({
        data: {
          reviewId,
          userId: req.user!.id,
          comment,
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });

      // Replies are part of the cached public course view. Key off the
      // review's own course: that is where the reply is rendered.
      await redis.del(courseCacheKey(review.courseId));

      res.status(200).json({
        success: true,
        reply,
      });
    } catch (error) {
      return next(error);
    }
  }
);
