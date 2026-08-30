import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { prisma } from "../utils/db";

// check if the authenticated user is enrolled in a course
export const checkEnrollment = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const { courseId } = req.params;

      if (!userId) {
        return next(new ErrorHandler("Unauthorized", 401));
      }

      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });

      res.status(200).json({
        success: true,
        enrolled: Boolean(enrollment),
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// enroll the authenticated user in a course (free — no payment required)
export const enrollFree = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const { courseId } = req.params;

      if (!userId) {
        return next(new ErrorHandler("Unauthorized", 401));
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const enrollment = await prisma.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        update: {},
        create: {
          userId,
          courseId,
          enrolledAt: new Date(),
          lastAccessedAt: new Date(),
        },
      });

      res.status(201).json({
        success: true,
        enrollment,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);
