import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { AtpAgent } from "@atproto/api";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { prisma } from "../utils/db";
import { redis } from "../utils/redis";
import {
  completeAuthorization,
  getClientMetadata,
  isLoopbackMode,
  startAuthorization,
} from "../services/atprotoOAuth.service";
import { refreshTokenExpireSeconds, signTokens } from "../utils/jwt";

const startSchema = z.object({
  handle: z
    .string()
    .min(3, "handle is required")
    .regex(/^@?[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/, "invalid Bluesky handle"),
  platform: z.enum(["mobile", "web"]).default("web"),
});

const MOBILE_DEEPLINK = "apice://auth/callback";

/**
 * GET /api/v1/auth/atproto/client-metadata.json
 *
 * Public OAuth client metadata (discoverable clients must serve this).
 */
export const getAtprotoClientMetadata = CatchAsyncError(
  async (_req: Request, res: Response) => {
    res.status(200).json(getClientMetadata());
  }
);

/**
 * POST /api/v1/auth/atproto/start
 *
 * Starts the ATProto OAuth flow. Returns the authorization URL the client
 * should open (browser / expo-web-browser).
 */
export const startAtprotoAuth = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = startSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const handle = parsed.data.handle.replace(/^@/, "");
      const authorizeUrl = await startAuthorization(handle, {
        platform: parsed.data.platform,
      });

      res.status(200).json({
        success: true,
        authorizeUrl: authorizeUrl.toString(),
      });
    } catch (error: any) {
      return next(
        new ErrorHandler(
          error.message || "Could not start Bluesky sign-in",
          400
        )
      );
    }
  }
);

/**
 * GET /api/v1/auth/atproto/callback
 *
 * OAuth redirect target. Completes the flow, finds/creates the local user by
 * DID, and returns Ápice tokens — as JSON for web, or via deep-link redirect
 * for mobile.
 */
export const atprotoAuthCallback = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = new URLSearchParams(req.query as Record<string, string>);
      const { session, stateData } = await completeAuthorization(params);

      const did = session.sub;

      // Best-effort handle resolution for display purposes.
      let handle: string | undefined;
      try {
        const agent = new AtpAgent(session as any);
        const repo = await agent.com.atproto.repo.describeRepo({ repo: did });
        handle = repo.data.handle;
      } catch {
        /* non-fatal — handle stays unset */
      }

      let user = await prisma.user.findUnique({ where: { blueskyDid: did } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: handle || did,
            email: `${did.replace(/:/g, "-")}@atproto.apice.local`,
            password: await bcrypt.hash(randomUUID(), 10),
            blueskyDid: did,
            blueskyHandle: handle ?? null,
            isVerified: true,
          },
        });
      } else if (handle && user.blueskyHandle !== handle) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { blueskyHandle: handle },
        });
      }

      const { accessToken, refreshToken } = await signTokens(user.id);
      await redis.set(
        user.id,
        JSON.stringify(user),
        "EX",
        refreshTokenExpireSeconds
      );

      if (stateData.platform === "mobile") {
        const url = new URL(MOBILE_DEEPLINK);
        url.searchParams.set("accessToken", accessToken);
        url.searchParams.set("refreshToken", refreshToken);
        return res.redirect(url.toString());
      }

      res.status(200).json({
        success: true,
        user,
        accessToken,
        refreshToken,
      });
    } catch (error: any) {
      return next(
        new ErrorHandler(error.message || "Bluesky sign-in failed", 400)
      );
    }
  }
);

/**
 * GET /api/v1/auth/atproto/mode
 *
 * Tells clients which OAuth mode this server runs (loopback vs discoverable),
 * so they can warn about environment limitations.
 */
export const getAtprotoAuthMode = CatchAsyncError(
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      mode: isLoopbackMode() ? "loopback" : "discoverable",
    });
  }
);
