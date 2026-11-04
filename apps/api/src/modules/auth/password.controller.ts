import { prisma } from "../../platform/db";
import ErrorHandler from "../../http/ErrorHandler";
import { CatchAsyncError } from "../../http/catchAsyncErrors";
import sendMail from "../../platform/mail";
import {
  clearTokenCookies,
  createSession,
  deliverTokens,
  revokeAllSessions,
  revokeSession,
  signIn,
} from "./session";
import { redis } from "../../platform/redis";
import bcrypt from "bcryptjs";
import { createHash, randomInt, randomUUID } from "crypto";
import { z } from "zod";
import { NextFunction, Request, Response } from "express";
import { logger } from "../../platform/logger";

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
      await signIn(req, res, safeUser);
    } catch (error) {
      return next(error);
    }
  }
);

// logout user — ends this device's session only.
export const logoutUser = CatchAsyncError(
  async (req: Request, res: Response) => {
    if (req.user?.id && req.sessionId) {
      await revokeSession(req.user.id, req.sessionId);
    }
    clearTokenCookies(res);
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
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
      await revokeAllSessions(user.id);
      const tokens = await createSession(updatedUser);

      res.status(200).json({
        success: true,
        user: updatedUser,
        ...deliverTokens(req, res, tokens),
      });
    } catch (error) {
      return next(error);
    }
  }
);
