import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import {
  publishCourseToPDS,
  readCourseRecord,
} from "../services/atproto.service";
import { prisma } from "../utils/db";
import { z } from "zod";

const publishSchema = z.object({
  courseId: z.string().min(1),
});

const strongRefSchema = z.object({
  uri: z.string().startsWith("at://"),
  cid: z.string().min(1),
});

const atprotoRefSchema = z.object({
  courseUri: z.string().startsWith("at://"),
  courseCid: z.string().min(1),
  lessonRefs: z.record(z.string(), strongRefSchema).default({}),
});

/**
 * POST /api/v1/course/:id/atprotoRef
 *
 * Registers the AT URIs of a course that an instructor published to their OWN
 * PDS from the admin panel (client-side flow). The server trusts the admin
 * role here; the records themselves are verifiable on the instructor's repo.
 */
export const registerCourseAtprotoRef = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = atprotoRefSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const courseId = req.params.id;
      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });
      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const { courseUri, courseCid, lessonRefs } = parsed.data;

      await prisma.$transaction([
        prisma.course.update({
          where: { id: courseId },
          data: {
            atprotoUri: courseUri,
            atprotoCid: courseCid,
          },
        }),
        // Upsert each lesson ref — delete removed ones, create new ones
        ...Object.entries(lessonRefs).map(([lessonId, ref]) =>
          prisma.lessonRef.upsert({
            where: { courseId_lessonId: { courseId, lessonId } },
            update: { uri: ref.uri, cid: ref.cid },
            create: { courseId, lessonId, uri: ref.uri, cid: ref.cid },
          })
        ),
        // Remove refs for lessons no longer in the map
        prisma.lessonRef.deleteMany({
          where: {
            courseId,
            lessonId: { notIn: Object.keys(lessonRefs) },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        courseUri,
        courseCid,
        lessonCount: Object.keys(lessonRefs).length,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

export const publishCourseToAtmosphere = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = publishSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ErrorHandler(parsed.error.issues.map((e) => e.message).join(", "), 400));
      }

      const result = await publishCourseToPDS(parsed.data.courseId);

      res.status(200).json({
        success: true,
        courseUri: result.courseUri,
        courseCid: result.courseCid,
        lessonUris: result.lessonUris,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

export const getCourseAtprotoRecord = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const courseId = req.params.id;
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { atprotoUri: true, name: true },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      if (!course.atprotoUri) {
        return res.status(200).json({
          success: true,
          published: false,
          message: "Course has not been published to the Atmosphere",
        });
      }

      const record = await readCourseRecord(course.atprotoUri);

      res.status(200).json({
        success: true,
        published: true,
        courseUri: course.atprotoUri,
        record,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

