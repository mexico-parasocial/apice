import { prisma } from "../../platform/db";
import ErrorHandler from "../../http/ErrorHandler";
import { CatchAsyncError } from "../../http/catchAsyncErrors";
import { cacheUser, forgetUser, revokeAllSessions } from "../auth/session";
import { redis } from "../../platform/redis";
import { courseCacheKey } from "../../platform/cache";
import { getAllUsersService, getUserById, updateUserRoleService } from "./users.service";
import { refreshCourseRating } from "../courses/courses.service";
import { Prisma } from "@prisma/client";
import cloudinary from "cloudinary";
import { z } from "zod";
import { NextFunction, Request, Response } from "express";
import { logger } from "../../platform/logger";
import { cancelPendingCredentials, enqueueAllEarnedCredentials } from "../credentials/credentials.service";

// get user info
export const getUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new ErrorHandler("Unauthorized", 401));
      }
      const user = await getUserById(userId);
      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }
      res.status(200).json({
        success: true,
        user,
      });
    } catch (error: any) {
      // Only infrastructure failures (Redis, the database) land here.
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

const credentialsConsentSchema = z.object({ enabled: z.boolean() });

/**
 * PUT /api/v1/me/credentials-consent  { enabled }
 *
 * Opt in or out of publishing app.civic.progress records to the learner's
 * public ATProto repo. Opting in queues every credential already earned;
 * opting out cancels anything still queued. Records already published stay
 * in the learner's repo — they own it and can delete them there.
 */
export const updateCredentialsConsent = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = credentialsConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ErrorHandler("enabled must be a boolean", 400));
    }
    const userId = req.user!.id;
    const { enabled } = parsed.data;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        credentialsConsent: enabled,
        credentialsConsentAt: enabled ? new Date() : null,
      },
    });
    await cacheUser(user);

    const queued = enabled
      ? await enqueueAllEarnedCredentials(userId)
      : (await cancelPendingCredentials(userId), 0);

    res.status(200).json({ success: true, user, queued });
  }
);

const updateUserInfoSchema = z.object({
  name: z.string().min(1).optional(),
});

// update user info
export const updateUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateUserInfoSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { name } = parsed.data;
      const userId = req.user?.id;

      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { name },
      });

      await cacheUser(user);

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(error);
    }
  }
);

interface IUpdateProfilePicture {
  avatar: string;
}

// update profile picture
export const updateProfilePicture = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { avatar } = req.body as IUpdateProfilePicture;

      const userId = req.user?.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!avatar || !user) {
        // Without this branch the request would hang forever — Express
        // never gets a response and the client times out on its own.
        return next(new ErrorHandler("avatar is required", 400));
      }

      {
        const userAvatar = user.avatar as any;
        // if user have one avatar then call this if
        if (userAvatar?.public_id) {
          // first delete the old image
          await cloudinary.v2.uploader.destroy(userAvatar?.public_id);
        }

        const myCloud = await cloudinary.v2.uploader.upload(avatar, {
          folder: "avatars",
          width: 150,
        });

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            avatar: {
              public_id: myCloud.public_id,
              url: myCloud.secure_url,
            },
          },
        });

        // EX matters: an immortal session key would outlive the user's
        // tokens and leak a stale user object into every authed request.
        await cacheUser(updatedUser);

        res.status(200).json({
          success: true,
          user: updatedUser,
        });
      }
    } catch (error: any) {
      logger.error(error, "updateProfilePicture failed");
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// get all users --- only for admin
export const getAllUsers = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit as string, 10) || 50)
      );
      res.status(200).json({ success: true, ...(await getAllUsersService(page, limit)) });
    } catch (error) {
      return next(error);
    }
  }
);

const updateUserRoleSchema = z.object({
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
});

// update user role --- only for admin
export const updateUserRole = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateUserRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { email, role } = parsed.data;
      const isUserExist = await prisma.user.findUnique({
        where: { email },
      });
      if (isUserExist) {
        const user = await updateUserRoleService(isUserExist.id, role);
        res.status(200).json({
          success: true,
          user,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "User not found",
        });
      }
    } catch (error: any) {
      // Validation is handled above; only server-side failures land here.
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Delete user --- only for admin
//
// What goes with the user is decided by the relations in schema.prisma:
// enrollments, progress, certificates, video views, the INE verification and
// community content (questions, answers, reviews, review replies) cascade.
// Orders are financial records, so they stay, with `userId` set to null.
export const deleteUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      // The user's reviews cascade away, so the courses they reviewed need
      // their average rating recomputed in the same transaction. Those
      // courses, and the ones the user replied to reviews on, also need
      // their public cache dropped, or it keeps showing the deleted user.
      const affectedCourseIds = await prisma.$transaction(async (tx) => {
        const reviews = await tx.review.findMany({
          where: { userId: id },
          select: { courseId: true },
        });
        const replies = await tx.reviewReply.findMany({
          where: { userId: id },
          select: { review: { select: { courseId: true } } },
        });

        await tx.user.delete({
          where: { id },
        });

        const reviewedCourseIds = [...new Set(reviews.map((r) => r.courseId))];
        for (const courseId of reviewedCourseIds) {
          await refreshCourseRating(courseId, tx);
        }

        return [
          ...new Set([
            ...reviewedCourseIds,
            ...replies.map((r) => r.review.courseId),
          ]),
        ];
      });

      if (affectedCourseIds.length > 0) {
        await redis.del(...affectedCourseIds.map(courseCacheKey));
      }

      // End every session and drop the cached row.
      await revokeAllSessions(id);
      await forgetUser(id);

      res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error: any) {
      // Forward Prisma errors untouched: the error middleware turns a foreign
      // key failure into a clean 409 instead of echoing Prisma's message.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return next(error);
      }
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
