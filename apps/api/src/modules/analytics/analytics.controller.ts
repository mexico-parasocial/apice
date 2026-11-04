import { Request, Response, NextFunction } from "express";
import ErrorHandler from "../../http/ErrorHandler";
import { CatchAsyncError } from "../../http/catchAsyncErrors";
import { generateLast12MothsData } from "./last12Months";
import { prisma } from "../../platform/db";

// get users analytics --- only for admin
export const getUsersAnalytics = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await generateLast12MothsData((startDate, endDate) =>
        prisma.user.count({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          },
        })
      );

      res.status(200).json({
        success: true,
        users,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// get courses analytics --- only for admin
export const getCoursesAnalytics = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const courses = await generateLast12MothsData((startDate, endDate) =>
        prisma.course.count({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          },
        })
      );

      res.status(200).json({
        success: true,
        courses,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// get order analytics --- only for admin
export const getOrderAnalytics = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await generateLast12MothsData((startDate, endDate) =>
        prisma.order.count({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          },
        })
      );

      res.status(200).json({
        success: true,
        orders,
      });
    } catch (error) {
      return next(error);
    }
  }
);
