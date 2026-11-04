import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { CatchAsyncError } from "../../http/catchAsyncErrors";
import ErrorHandler from "../../http/ErrorHandler";
import { prisma } from "../../platform/db";

const registerSchema = z.object({
  token: z.string().min(10).startsWith("ExpoPushToken["),
  platform: z.enum(["ios", "android", "web"]),
});

/**
 * POST /push/register — registers (or refreshes) the caller's Expo push
 * token. Idempotent per token: re-registering from the same device just
 * refreshes ownership.
 */
export const registerPushToken = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) return next(new ErrorHandler("User not found", 404));

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ErrorHandler(parsed.error.issues.map((e) => e.message).join(", "), 400)
      );
    }

    const { token, platform } = parsed.data;
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    res.status(201).json({ success: true });
  }
);

/**
 * POST /push/unregister — removes a token (e.g. on logout, so the logged-out
 * device stops receiving the user's notifications).
 */
export const unregisterPushToken = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!token) return next(new ErrorHandler("token is required", 400));

    await prisma.pushToken.deleteMany({ where: { token, userId: req.user?.id } });
    res.status(200).json({ success: true });
  }
);
