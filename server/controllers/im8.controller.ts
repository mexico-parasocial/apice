import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import { refreshTokenExpireSeconds, signTokens } from "../utils/jwt";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { env } from "../utils/env";
import { redis } from "../utils/redis";
import { prisma } from "../utils/db";
import bcrypt from "bcryptjs";

const IM8_SESSION_TTL_SECONDS = 600; // 10 minutes

const startSchema = z.object({
  identifier: z.string().min(1).max(256),
});

const completeSchema = z.object({
  state: z.string().min(1),
  callbackUrl: z.string().url().optional(),
  apiceAccessToken: z.string().optional(),
});

interface PendingIM8State {
  iM8AccessToken: string;
  sessionId: string;
  did: string;
  handle: string;
  localOnly: boolean;
}

function im8BaseUrl(): string {
  const url = env.IM8_IDENTITY_MANAGER_URL;
  if (!url) {
    throw new ErrorHandler("iM8 Identity Manager is not configured", 503);
  }
  return url.replace(/\/$/, "");
}

function stateKey(state: string): string {
  return `im8:state:${state}`;
}

async function issueApiceTokens(
  userId: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // Shared signing: env-driven lifetimes + refresh-token jti whitelist.
  const { accessToken, refreshToken } = await signTokens(userId);
  return { accessToken, refreshToken };
}

async function resolveLinkingUser(
  accessToken: string | undefined
): Promise<{ id: string } | null> {
  if (!accessToken) return null;
  try {
    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN as Secret) as JwtPayload;
    if (!decoded?.id) return null;
    return { id: decoded.id as string };
  } catch {
    throw new ErrorHandler("Invalid Ápice access token", 401);
  }
}

// Start an iM8 login session and return the OAuth URL to the mobile client.
export const startIM8Login = CatchAsyncError(
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

      const baseUrl = im8BaseUrl();
      const { identifier } = parsed.data;

      const startRes = await axios.post(
        `${baseUrl}/v1/sessions/start`,
        { identifier },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );

      const data = startRes.data as {
        attempt?: { sessionId?: string; did?: string; handle?: string };
        tokens?: { accessToken?: string; expiresIn?: number };
        oauthUrl?: string;
      };

      const oauthUrl = data.oauthUrl;
      const iM8AccessToken = data.tokens?.accessToken;
      const sessionId = data.attempt?.sessionId;
      const did = data.attempt?.did;
      const handle = data.attempt?.handle;

      if (!iM8AccessToken || !sessionId || !did || !handle) {
        return next(new ErrorHandler("Invalid response from iM8 Identity Manager", 502));
      }

      // iM8 may return a local-only session when it cannot build a real Bluesky
      // OAuth URL (e.g. dev without SERVICE_URL/private keys). In that case we
      // still have a valid authenticated session and can complete login directly.
      let state: string | null = null;
      let localOnly = false;
      if (oauthUrl) {
        try {
          state = new URL(oauthUrl).searchParams.get("state");
        } catch {
          state = null;
        }
      }
      if (!state) {
        if (oauthUrl) {
          return next(new ErrorHandler("iM8 OAuth URL is missing state", 502));
        }
        state = randomUUID();
        localOnly = true;
      }

      const pending: PendingIM8State = {
        iM8AccessToken,
        sessionId,
        did,
        handle,
        localOnly,
      };

      await redis.set(
        stateKey(state),
        JSON.stringify(pending),
        "EX",
        IM8_SESSION_TTL_SECONDS
      );

      res.status(200).json({
        success: true,
        state,
        sessionId,
        oauthUrl: oauthUrl || null,
        localOnly,
        callbackUrl: `${baseUrl}/v1/sessions/oauth/callback`,
        expiresIn: data.tokens?.expiresIn ?? IM8_SESSION_TTL_SECONDS,
      });
    } catch (error: any) {
      if (error instanceof ErrorHandler) return next(error);
      const message = error?.response?.data?.error || error.message || "Failed to start iM8 login";
      return next(new ErrorHandler(message, error?.response?.status || 500));
    }
  }
);

// Complete an iM8 login after the user authorizes via ATProto OAuth.
// If `apiceAccessToken` is provided, the iM8 identity is linked to the
// currently logged-in Ápice account instead of creating a new one.
export const completeIM8Login = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = completeSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const baseUrl = im8BaseUrl();
      const { state, callbackUrl, apiceAccessToken } = parsed.data;

      const linkingUser = await resolveLinkingUser(apiceAccessToken);

      const pendingRaw = await redis.get(stateKey(state));
      if (!pendingRaw) {
        return next(new ErrorHandler("iM8 login session expired or invalid", 400));
      }

      const pending: PendingIM8State = JSON.parse(pendingRaw);

      // For real Bluesky OAuth flows we must forward the authorization code
      // callback to iM8. Local-only dev sessions are already authenticated, so
      // we skip that step and go straight to fetching the session.
      if (!pending.localOnly) {
        const query = callbackUrl && callbackUrl.includes("?") ? callbackUrl.split("?")[1] : "";
        await axios.get(`${baseUrl}/v1/sessions/oauth/callback?${query}`, {
          timeout: 15000,
        });
      }

      // Fetch the finalized session to get the verified DID and handle.
      const meRes = await axios.get(`${baseUrl}/v1/sessions/me`, {
        headers: {
          Authorization: `Bearer ${pending.iM8AccessToken}`,
        },
        timeout: 15000,
      });

      const meData = meRes.data as {
        session?: { did?: string; handle?: string; displayName?: string };
      };
      const session = meData.session;
      if (!session?.did || !session?.handle) {
        return next(new ErrorHandler("Could not retrieve iM8 session", 502));
      }

      if (session.did !== pending.did) {
        return next(new ErrorHandler("iM8 session DID mismatch", 400));
      }

      let user;

      if (linkingUser) {
        // Make sure this DID isn't already attached to a different account.
        const existingDidUser = await prisma.user.findUnique({
          where: { blueskyDid: session.did },
        });
        if (existingDidUser && existingDidUser.id !== linkingUser.id) {
          return next(
            new ErrorHandler(
              "This Bluesky account is already linked to another Ápice user.",
              409
            )
          );
        }

        user = await prisma.user.update({
          where: { id: linkingUser.id },
          data: { blueskyDid: session.did, blueskyHandle: session.handle },
        });
      } else {
        // Find or create an Ápice user linked to this Bluesky DID.
        user = await prisma.user.findUnique({
          where: { blueskyDid: session.did },
        });

        if (!user) {
          const email = `${session.handle.replace(/\s+/g, "").toLowerCase()}@im8.apice.local`;
          const existingEmail = await prisma.user.findUnique({ where: { email } });
          if (existingEmail) {
            return next(
              new ErrorHandler(
                "A user with this email already exists. Please log in with your email and link iM8 from settings.",
                409
              )
            );
          }

          user = await prisma.user.create({
            data: {
              name: session.displayName || session.handle,
              email,
              password: await bcrypt.hash(Math.random().toString(36).slice(2), 10),
              blueskyDid: session.did,
              blueskyHandle: session.handle,
            },
          });
        } else {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { blueskyHandle: session.handle },
          });
        }
      }

      // Clean up the one-time pending state.
      await redis.del(stateKey(state));

      const { accessToken, refreshToken } = await issueApiceTokens(user.id);
      await redis.set(
        user.id,
        JSON.stringify(user),
        "EX",
        refreshTokenExpireSeconds
      );

      res.status(200).json({
        success: true,
        user,
        accessToken,
        refreshToken,
        iM8Session: {
          accessToken: pending.iM8AccessToken,
          sessionId: pending.sessionId,
          did: session.did,
          handle: session.handle,
        },
      });
    } catch (error: any) {
      if (error instanceof ErrorHandler) return next(error);
      const message =
        error?.response?.data?.error || error.message || "Failed to complete iM8 login";
      return next(new ErrorHandler(message, error?.response?.status || 500));
    }
  }
);
