import { prisma } from "../utils/db";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import jwt, { JwtPayload } from "jsonwebtoken";
import sendMail from "../utils/sendMail";
import {
  isRefreshTokenValid,
  refreshTokenExpireSeconds,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  sendToken,
  signTokens,
} from "../utils/jwt";
import { redis } from "../utils/redis";
import { SESSION_CACHE_TTL_SECONDS, courseCacheKey } from "../utils/cache";
import bcrypt from "bcryptjs";
import { createHash, randomInt, randomUUID } from "crypto";
import {
  getAllUsersService,
  getUserById,
  updateUserRoleService,
} from "../services/user.service";
import { refreshCourseRating } from "../services/course.service";
import { Prisma } from "@prisma/client";
import cloudinary from "cloudinary";
import { z } from "zod";
import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

// register user
//
// Pending registrations live in Redis, keyed by an opaque random id that is
// handed to the client as `activationToken`. The password is bcrypt-hashed
// before it is stored and never leaves the server. (It used to travel inside
// a signed — not encrypted — JWT returned to the client, readable by anyone.)
// The code is 6 digits from a CSPRNG, with a per-registration attempt cap so
// it can't be brute-forced by rotating IPs past the rate limiter.
const registrationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

const REGISTRATION_TTL_SECONDS = 10 * 60;
const MAX_ACTIVATION_ATTEMPTS = 5;
const registrationKey = (id: string) => `registration:${id}`;

interface PendingRegistration {
  name: string;
  email: string;
  passwordHash: string;
  codeHash: string;
  attempts: number;
}

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

export const registrationUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ErrorHandler(
          parsed.error.issues.map((e) => e.message).join(", "),
          400
        )
      );
    }

    const { name, email, password } = parsed.data;

    const isEmailExist = await prisma.user.findUnique({ where: { email } });
    if (isEmailExist) {
      return next(new ErrorHandler("Email already exist", 409));
    }

    const activationCode = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const id = randomUUID();
    const pending: PendingRegistration = {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      codeHash: hashCode(activationCode),
      attempts: 0,
    };
    await redis.set(
      registrationKey(id),
      JSON.stringify(pending),
      "EX",
      REGISTRATION_TTL_SECONDS
    );

    try {
      await sendMail({
        email,
        subject: "Activate your account",
        template: "activation-mail.ejs",
        data: { user: { name }, activationCode },
      });
    } catch (error: any) {
      await redis.del(registrationKey(id));
      logger.error({ err: error }, "activation mail failed");
      return next(new ErrorHandler("Could not send the activation email", 502));
    }

    res.status(201).json({
      success: true,
      message: `Please check your email: ${email} to activate your account!`,
      activationToken: id,
    });
  }
);

// activate user
const activationSchema = z.object({
  activation_token: z.string().min(1),
  activation_code: z.string().regex(/^\d{6}$/, "Invalid activation code"),
});

export const activateUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = activationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ErrorHandler(
          parsed.error.issues.map((e) => e.message).join(", "),
          400
        )
      );
    }
    const { activation_token, activation_code } = parsed.data;
    const key = registrationKey(activation_token);

    const raw = await redis.get(key);
    if (!raw) {
      return next(
        new ErrorHandler("Activation expired, please register again", 400)
      );
    }
    const pending: PendingRegistration = JSON.parse(raw);

    // Comparing SHA-256 digests: a timing difference leaks nothing usable
    // about the code itself, and the attempt cap bounds guessing.
    if (hashCode(activation_code) !== pending.codeHash) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_ACTIVATION_ATTEMPTS) {
        await redis.del(key);
        return next(
          new ErrorHandler("Too many attempts, please register again", 400)
        );
      }
      await redis.set(key, JSON.stringify(pending), "KEEPTTL");
      return next(new ErrorHandler("Invalid activation code", 400));
    }

    // One-time: consume before creating, so a replay can't double-create.
    await redis.del(key);

    const existUser = await prisma.user.findUnique({
      where: { email: pending.email },
    });
    if (existUser) {
      return next(new ErrorHandler("Email already exist", 409));
    }

    await prisma.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        password: pending.passwordHash,
        isVerified: true,
      },
    });

    res.status(201).json({ success: true });
  }
);

// Login user
interface ILoginRequest {
  email: string;
  password: string;
}

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const loginUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { email, password } = parsed.data;

      // Opt back into the hash (utils/db.ts omits it globally) purely to
      // verify the credential — `safeUser` is what leaves this function.
      const user = await prisma.user.findUnique({
        where: { email },
        omit: { password: false },
      });

      if (!user) {
        return next(new ErrorHandler("Invalid email or password", 400));
      }

      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
        return next(new ErrorHandler("Invalid email or password", 400));
      }

      const { password: _discarded, ...safeUser } = user;
      await sendToken(safeUser, 200, res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// logout user
export const logoutUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.cookie("access_token", "", { maxAge: 1 });
      res.cookie("refresh_token", "", { maxAge: 1 });
      const userId = req.user?.id || "";
      if (userId) {
        await redis.del(userId);
        await revokeAllRefreshTokens(userId);
      }
      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// update access token (refresh token rotation)
export const updateAccessToken = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refresh_token = req.headers["refresh-token"] as string;
      const message = "Could not refresh token";

      // Every rejection below is a 401: by the time we get here the access
      // token has expired, so failing to refresh means the session is over.
      if (!refresh_token) {
        return next(new ErrorHandler(message, 401));
      }

      let decoded: JwtPayload;
      try {
        decoded = jwt.verify(
          refresh_token,
          process.env.REFRESH_TOKEN as string
        ) as JwtPayload;
      } catch {
        return next(new ErrorHandler(message, 401));
      }

      if (!decoded?.id || !decoded?.jti) {
        return next(new ErrorHandler(message, 401));
      }

      const session = await redis.get(decoded.id as string);

      if (!session) {
        return next(
          new ErrorHandler("Please login for access this resources!", 401)
        );
      }

      // Reject revoked or reused refresh tokens (rotation whitelist).
      const stillValid = await isRefreshTokenValid(decoded.id, decoded.jti);
      if (!stillValid) {
        return next(
          new ErrorHandler("Session expired, please login again", 401)
        );
      }

      const user = JSON.parse(session);

      // Rotate: revoke the presented token, issue a fresh pair.
      await revokeRefreshToken(decoded.id, decoded.jti);
      const { accessToken, refreshToken } = await signTokens(user.id);

      await redis.set(
        user.id,
        JSON.stringify(user),
        "EX",
        refreshTokenExpireSeconds
      );

      // The middleware chain continues with the original request; the new
      // tokens travel back on response headers for the client to store.
      res.setHeader("x-access-token", accessToken);
      res.setHeader("x-refresh-token", refreshToken);

      req.user = user;

      return next();
    } catch (error: any) {
      // Redis or signing blew up: our failure, not the caller's credentials.
      // Must not be a 401, or an infra blip would log every client out.
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

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

      await redis.set(userId, JSON.stringify(user), "EX", SESSION_CACHE_TTL_SECONDS);

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

const updatePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Old password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

// update user password
export const updatePassword = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updatePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { oldPassword, newPassword } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { id: req.user?.id },
        omit: { password: false },
      });

      if (!user) {
        return next(new ErrorHandler("Invalid user", 400));
      }

      const isPasswordMatch = await bcrypt.compare(oldPassword, user.password);

      if (!isPasswordMatch) {
        return next(new ErrorHandler("Invalid old password", 400));
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      // A password change invalidates every session: refresh tokens issued
      // before it must not survive. A fresh pair is returned so the device
      // that made the change stays logged in; every other device logs out.
      await revokeAllRefreshTokens(user.id);
      const { accessToken, refreshToken } = await signTokens(user.id);
      await redis.set(user.id, JSON.stringify(updatedUser), "EX", SESSION_CACHE_TTL_SECONDS);

      res.status(200).json({
        success: true,
        user: updatedUser,
        accessToken,
        refreshToken,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
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
        let userAvatar = user.avatar as any;
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
        await redis.set(userId!, JSON.stringify(updatedUser), "EX", SESSION_CACHE_TTL_SECONDS);

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
      await getAllUsersService(res, page, limit);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
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

      // Kill the session cache AND every live refresh token — deleting the
      // cache alone would leave issued tokens working until they expire.
      await redis.del(id);
      await revokeAllRefreshTokens(id);

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
