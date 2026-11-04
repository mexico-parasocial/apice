import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { CatchAsyncError } from "./catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import {
  deliverTokens,
  isCookieMode,
  isSessionActive,
  loadUser,
  readTokens,
  rotateSession,
} from "../utils/jwt";

/**
 * Authenticates the request (see utils/jwt.ts for the session model).
 *
 * Every "no usable session" outcome is a 401, never a 400: clients treat 401
 * as "the session is dead, log out" (the mobile AuthProvider does exactly
 * that). 403 is reserved for authorizeRoles below.
 *
 * An expired access token is refreshed transparently when a valid refresh
 * token comes along: the new pair goes back on x-access-token /
 * x-refresh-token (header mode) or as HttpOnly cookies (cookie mode), and the
 * request continues.
 */
export const isAutheticated = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { access, refresh } = readTokens(req);
    if (!access) {
      return next(new ErrorHandler("Please login to access this resource", 401));
    }

    let decoded: JwtPayload;
    try {
      // Expiry is checked below so the refresh flow can take over.
      decoded = jwt.verify(access, process.env.ACCESS_TOKEN as string, {
        ignoreExpiration: true,
      }) as JwtPayload;
    } catch {
      return next(new ErrorHandler("access token is not valid", 401));
    }

    let userId = decoded?.id as string | undefined;
    let sid = decoded?.sid as string | undefined;
    if (!userId || !sid) {
      return next(new ErrorHandler("access token is not valid", 401));
    }

    if (decoded.exp && decoded.exp <= Date.now() / 1000) {
      if (!refresh) {
        return next(new ErrorHandler("Could not refresh token", 401));
      }
      const rotated = await rotateSession(refresh);
      if (!rotated.ok) {
        return next(new ErrorHandler(rotated.reason, 401));
      }
      if (rotated.userId !== userId) {
        return next(new ErrorHandler("Could not refresh token", 401));
      }
      sid = rotated.sid;
      deliverTokens(req, res, rotated.tokens);
      if (!isCookieMode(req)) {
        res.setHeader("x-access-token", rotated.tokens.accessToken);
        res.setHeader("x-refresh-token", rotated.tokens.refreshToken);
      }
    } else if (!(await isSessionActive(userId, sid))) {
      return next(new ErrorHandler("Please login to access this resource", 401));
    }

    const user = await loadUser(userId);
    if (!user) {
      return next(new ErrorHandler("Please login to access this resource", 401));
    }
    req.user = user;
    req.sessionId = sid;
    next();
  }
);

// validate user role
export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ErrorHandler("Please login to access this resource", 401));
    }
    if (!roles.includes(req.user.role || "")) {
      return next(
        new ErrorHandler(
          `Role: ${req.user.role} is not allowed to access this resource`,
          403
        )
      );
    }
    next();
  };
};
