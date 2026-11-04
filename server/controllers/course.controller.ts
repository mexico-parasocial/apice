import { prisma } from "../utils/db";
import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import cloudinary from "cloudinary";
import {
  createCourse,
  getAllCoursesService,
  refreshCourseRating,
  syncCourseContent,
} from "../services/course.service";
import { redis } from "../utils/redis";
import { notify } from "../services/notification.service";
import { COURSE_CACHE_TTL_SECONDS, courseCacheKey } from "../utils/cache";
import { Prisma } from "@prisma/client";
import sendMail from "../utils/sendMail";
import { z } from "zod";
import { logger } from "../utils/logger";

// ─── Helpers ────────────────────────────────────────────────────────

async function buildCourseData(courseId: string) {
  const sections = await prisma.courseSection.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
              replies: {
                include: {
                  user: { select: { id: true, name: true, email: true, avatar: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const courseData: any[] = [];
  for (const section of sections) {
    for (const lesson of section.lessons) {
      courseData.push({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        videoSection: section.title,
        videoLength: lesson.videoLength,
        videoPlayer: "",
        links: [],
        suggestion: "",
        questions: lesson.questions.map((q) => ({
          id: q.id,
          user: q.user,
          question: q.question,
          questionReplies: q.replies.map((r) => ({
            user: r.user,
            answer: r.answer,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
        })),
      });
    }
  }
  return courseData;
}

// Public projection: reviewer/replier identity is limited to id, name and
// avatar. Never select email here — this feeds the unauthenticated
// GET /get-course/:id response and its Redis cache.
async function buildReviews(courseId: string) {
  const reviews = await prisma.review.findMany({
    where: { courseId },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      replies: {
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return reviews.map((rev) => ({
    id: rev.id,
    user: rev.user,
    rating: rev.rating,
    comment: rev.comment,
    commentReplies: rev.replies.map((r) => ({
      user: r.user,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  }));
}

/** Q&A is for the course's learners (and staff answering them). */
async function canParticipate(req: Request, courseId: string) {
  if (req.user?.role === "admin") return true;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: req.user!.id, courseId } },
    select: { id: true },
  });
  return enrollment !== null;
}

// ─── Validation Schemas ─────────────────────────────────────────────

/**
 * One lesson in the editor payload. Only these fields are read by
 * syncCourseContent; unknown editor fields (links, suggestion, …) pass
 * through untouched and are ignored.
 */
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().nonnegative().nullable()
);
const lessonItemSchema = z.looseObject({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  videoLength: optionalNumber.optional(),
  videoSection: z.string().optional(),
});

const courseCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  // Free courses are allowed (price 0) — revenue model deferred.
  price: z.number().nonnegative(),
  estimatedPrice: z.number().optional(),
  tags: z.string().min(1),
  level: z.string().min(1),
  demoUrl: z.string().min(1),
  thumbnail: z.string().optional(),
  categories: z.string().min(1),
  benefits: z.array(z.object({ title: z.string() })).default([]),
  prerequisites: z.array(z.object({ title: z.string() })).default([]),
  courseData: z.array(lessonItemSchema).default([]),
});

const courseUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
  estimatedPrice: z.number().optional(),
  tags: z.string().min(1).optional(),
  level: z.string().min(1).optional(),
  demoUrl: z.string().min(1).optional(),
  thumbnail: z.string().optional(),
  categories: z.string().min(1).optional(),
  benefits: z.array(z.object({ title: z.string() })).optional(),
  prerequisites: z.array(z.object({ title: z.string() })).optional(),
  courseData: z.array(lessonItemSchema).optional(),
  confirmDeleteLessonsWithProgress: z.boolean().optional(),
});

// ─── Controllers ────────────────────────────────────────────────────

// upload course
export const uploadCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = courseCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const data = parsed.data as any;
      const thumbnail = data.thumbnail;
      if (thumbnail) {
        const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
          folder: "courses",
        });

        data.thumbnail = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };
      }
      createCourse(data, res, next);
    } catch (error) {
      return next(error);
    }
  }
);

// edit course
export const editCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = courseUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const data = parsed.data as any;
      const thumbnail = data.thumbnail;
      const courseId = req.params.id;

      const courseData = (await prisma.course.findUnique({
        where: { id: courseId },
      })) as any;

      if (!courseData) {
        return next(new ErrorHandler("Course not found", 404));
      }

      if (thumbnail && !thumbnail.startsWith("https")) {
        // A course created without a thumbnail has no public_id to destroy —
        // dereferencing it unconditionally 500s the edit.
        if (courseData.thumbnail?.public_id) {
          await cloudinary.v2.uploader.destroy(courseData.thumbnail.public_id);
        }

        const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
          folder: "courses",
        });

        data.thumbnail = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };
      }

      if (thumbnail && thumbnail.startsWith("https")) {
        data.thumbnail = {
          public_id: courseData.thumbnail?.public_id ?? null,
          url: courseData.thumbnail?.url ?? thumbnail,
        };
      }

      const {
        courseData: contentItems,
        confirmDeleteLessonsWithProgress,
        ...updateFields
      } = data;

      const course = await prisma.$transaction(async (tx) => {
        const updated = await tx.course.update({
          where: { id: courseId },
          data: updateFields,
        });
        if (Array.isArray(contentItems)) {
          await syncCourseContent(courseId, contentItems, tx, {
            confirmDeleteLessonsWithProgress,
          });
        }
        return updated;
      });

      // Invalidate the public course cache so edits are visible immediately.
      await redis.del(courseCacheKey(courseId));

      res.status(200).json({
        success: true,
        course,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// get single course --- without purchasing
export const getSingleCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const courseId = req.params.id;

      const isCacheExist = await redis.get(courseCacheKey(courseId));

      if (isCacheExist) {
        const course = JSON.parse(isCacheExist);
        res.status(200).json({
          success: true,
          course,
        });
      } else {
        const course = await prisma.course.findUnique({
          where: { id: req.params.id },
        });

        if (!course) {
          return next(new ErrorHandler("Course not found", 404));
        }

        const courseData = await buildCourseData(course.id);
        const reviews = await buildReviews(course.id);

        const enrichedCourse = {
          ...course,
          courseData,
          reviews,
        };

        // Strip sensitive fields for public view
        const publicCourse = {
          ...enrichedCourse,
          courseData: courseData.map((d: any) => {
            const { videoUrl, suggestion, questions, links, ...rest } = d;
            return rest;
          }),
        };

        await redis.set(
          courseCacheKey(courseId),
          JSON.stringify(publicCourse),
          "EX",
          COURSE_CACHE_TTL_SECONDS
        );

        res.status(200).json({
          success: true,
          course: publicCourse,
        });
      }
    } catch (error) {
      return next(error);
    }
  }
);

// get full relational course content for admin (includes lesson IDs and videoUrl)
export const getAdminCourseContent = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const courseId = req.params.id;
      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const content = await buildCourseData(course.id);

      res.status(200).json({
        success: true,
        content,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// get all courses --- without purchasing
export const getAllCourses = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      /*
       * The catalogue lists courses; it does not render their contents.
       *
       * This used to call buildCourseData() per course, which loads every
       * section, every lesson, every question on every lesson, each question's
       * author, every reply, and each reply's author — then threw `questions`
       * away again in the mapping below. So the catalogue paid for the entire
       * Q&A tree of the whole platform and discarded it, on a request the app
       * makes on every launch. Worse, the cost grew with participation: the
       * list got slower precisely as more militantes asked questions.
       *
       * Lesson counts are cheap to aggregate, so they come along; anything
       * heavier belongs to /get-course-content, which is enrollment-gated.
       *
       * Paginated (?page=&limit=): this is the public, unauthenticated
       * entry point the apps hit on launch — it must stay O(page), not
       * O(platform). The aggregation below is scoped to the page's courses
       * for the same reason.
       */
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit as string, 10) || 12)
      );

      const [total, courses] = await Promise.all([
        prisma.course.count(),
        prisma.course.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            _count: { select: { sections: true } },
          },
        }),
      ]);

      const pageCourseIds = courses.map((c) => c.id);
      const sections = pageCourseIds.length
        ? await prisma.courseSection.findMany({
            where: { courseId: { in: pageCourseIds } },
            select: { id: true, courseId: true },
          })
        : [];
      const sectionIds = sections.map((s) => s.id);
      const lessonCounts = sectionIds.length
        ? await prisma.courseLesson.groupBy({
            by: ["sectionId"],
            where: { sectionId: { in: sectionIds } },
            _count: { _all: true },
          })
        : [];
      const lessonsByCourse = new Map<string, number>();
      for (const section of sections) {
        const count =
          lessonCounts.find((row) => row.sectionId === section.id)?._count._all ?? 0;
        lessonsByCourse.set(
          section.courseId,
          (lessonsByCourse.get(section.courseId) ?? 0) + count
        );
      }

      const enrichedCourses = courses.map(({ _count, ...course }) => ({
        ...course,
        moduleCount: _count.sections,
        lessonCount: lessonsByCourse.get(course.id) ?? 0,
      }));

      res.status(200).json({
        success: true,
        courses: enrichedCourses,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
          hasMore: page * limit < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// get course content -- only for valid user
export const getCourseByUser = CatchAsyncError(
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

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      const content = await buildCourseData(courseId);

      res.status(200).json({
        success: true,
        course,
        content,
      });
    } catch (error) {
      return next(error);
    }
  }
);

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
          userId: req.user?.id!,
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

export const addAnwser = CatchAsyncError(
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
          userId: req.user?.id!,
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
          userId: req.user?.id!,
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

// get all courses --- only for admin
export const getAdminAllCourses = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const courses = await getAllCoursesService();
      res.status(200).json({
        success: true,
        courses,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Delete Course --- only for admin
export const deleteCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const course = await prisma.course.findUnique({
        where: { id },
      });

      if (!course) {
        return next(new ErrorHandler("course not found", 404));
      }

      // Order.course is ON DELETE RESTRICT: orders are financial records, and
      // the course is what says what was bought and for how much. Say so
      // plainly rather than letting the delete fail on the foreign key.
      const orderCount = await prisma.order.count({
        where: { courseId: id },
      });
      if (orderCount > 0) {
        return next(
          new ErrorHandler(
            `This course has ${orderCount} order${orderCount === 1 ? "" : "s"} and cannot be deleted: orders are kept as financial records.`,
            409
          )
        );
      }

      await prisma.course.delete({
        where: { id },
      });

      await redis.del(courseCacheKey(id));

      res.status(200).json({
        success: true,
        message: "course deleted successfully",
      });
    } catch (error: any) {
      // An order created between the count and the delete still trips the
      // foreign key; the error middleware maps that to a clean 409.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return next(error);
      }
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
