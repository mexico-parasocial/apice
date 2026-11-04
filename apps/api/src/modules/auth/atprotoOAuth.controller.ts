import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import { AtpAgent } from "@atproto/api";
import { CatchAsyncError } from "../../http/catchAsyncErrors";
import ErrorHandler from "../../http/ErrorHandler";
import { prisma } from "../../platform/db";
import { redis } from "../../platform/redis";
import {
  completeAuthorization,
  getClientMetadata,
  isLoopbackMode,
  startAuthorization,
} from "./atprotoOAuth.service";
import { signIn } from "./session";
import { requeueSkippedForUser } from "../credentials/credentials.service";

const startSchema = z.object({
  handle: z
    .string()
    .min(3, "handle is required")
    .regex(/^@?[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/, "invalid Bluesky handle"),
  platform: z.enum(["mobile", "web"]).default("web"),
});

const MOBILE_DEEPLINK = "apice://auth/callback";
const LOGIN_CODE_TTL_SECONDS = 60;
const loginCodeKey = (code: string) => `login-code:${code}`;

const exchangeSchema = z.object({ code: z.string().min(16).max(128) });

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

      // A fresh OAuth session may unblock credentials skipped for lack of one.
      await requeueSkippedForUser(user.id).catch(() => 0);

      if (stateData.platform === "mobile") {
        // Tokens never ride in the deep link: any app can register the
        // apice:// scheme, and URLs end up in logs and history. The link
        // carries a one-time code the app exchanges over HTTPS instead.
        const code = randomBytes(32).toString("base64url");
        await redis.set(loginCodeKey(code), user.id, "EX", LOGIN_CODE_TTL_SECONDS);
        const url = new URL(MOBILE_DEEPLINK);
        url.searchParams.set("code", code);
        return res.redirect(url.toString());
      }

      await signIn(req, res, user);
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

/**
 * POST /api/v1/auth/atproto/exchange  { code }
 *
 * Mobile half of the OAuth callback: trades the one-time code from the deep
 * link for a session. Single use, valid for a minute.
 */
export const exchangeAtprotoLoginCode = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = exchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ErrorHandler("Invalid login code", 400));
    }
    const key = loginCodeKey(parsed.data.code);
    const userId = await redis.get(key);
    await redis.del(key);
    if (!userId) {
      return next(new ErrorHandler("Login code expired or already used", 401));
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new ErrorHandler("Login code expired or already used", 401));
    }
    await signIn(req, res, user);
  }
);
