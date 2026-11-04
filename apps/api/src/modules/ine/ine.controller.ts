import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CatchAsyncError } from "../../http/catchAsyncErrors";
import ErrorHandler from "../../http/ErrorHandler";
import { prisma } from "../../platform/db";

/**
 * INE (Mexican voter ID) verification images. The URLs are stored and later
 * rendered in the admin panel, so they must be real http(s) URLs — anything
 * else is at best junk data and at worst a stored payload aimed at the
 * reviewer's browser.
 */
const submitINESchema = z.object({
  frontUrl: z.url().max(2048),
  backUrl: z.url().max(2048),
  ineId: z.string().max(64).optional(),
});

const listINEStatuses = ["pending", "approved", "rejected"] as const;

export const getMyINEVerification = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new ErrorHandler("Please login to access this resource", 401));
      }

      const verification = await prisma.iNEVerification.findUnique({
        where: { userId },
      });

      res.status(200).json({
        success: true,
        verification,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export const submitINEVerification = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new ErrorHandler("Please login to access this resource", 401));
      }

      const parsed = submitINESchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { frontUrl, backUrl, ineId } = parsed.data;
      const upsert = await prisma.iNEVerification.upsert({
        where: { userId },
        update: {
          frontUrl,
          backUrl,
          ineId: ineId ?? null,
          status: "pending",
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
        },
        create: {
          userId,
          frontUrl,
          backUrl,
          ineId: ineId ?? null,
          status: "pending",
        },
      });

      res.status(201).json({
        success: true,
        verification: upsert,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export const listINEVerifications = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.query;
      // Validate the filter into a clean 400 rather than an empty page.
      if (status !== undefined && !listINEStatuses.includes(status as any)) {
        return next(
          new ErrorHandler(
            `status must be one of ${listINEStatuses.join(", ")}`,
            400
          )
        );
      }
      const where = status ? { status: status as string } : {};

      // PII-heavy rows — paginated so an admin page load never pulls the
      // whole verification history into memory and the response.
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit as string, 10) || 50)
      );
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

      const verifications = await prisma.iNEVerification.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      });

      res.status(200).json({
        success: true,
        verifications,
      });
    } catch (error) {
      return next(error);
    }
  }
);

const reviewINESchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export const reviewINEVerification = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = reviewINESchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ErrorHandler("status must be approved or rejected", 400));
      }
      const { status, note } = parsed.data;

      // A missing id is a P2025, which the error middleware answers as 404.
      // Who decided, and when, is kept with the record.
      const updated = await prisma.iNEVerification.update({
        where: { id },
        data: {
          status,
          reviewNote: note ?? null,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        verification: updated,
      });
    } catch (error) {
      return next(error);
    }
  }
);
