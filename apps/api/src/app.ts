require("dotenv").config();
import express, { NextFunction, Request, Response } from "express";
import { loadEnv } from "./platform/env";
// Fail the deploy, not the first request: validated before anything below
// reads process.env (the CORS whitelist in particular).
loadEnv();

export const app = express();

// Trust the first proxy hop (Cloudflare → Caddy → Express) so req.ip and
// the rate limiter see the real client IP instead of the proxy's.
app.set("trust proxy", 1);

import cors from "cors";
import helmet from "helmet";
import path from "path";
import { FIXTURES_DIR } from "./platform/paths";
import cookieParser from "cookie-parser";
import { ErrorMiddleware } from "./http/error";
import ErrorHandler from "./http/ErrorHandler";
import { apiRouter } from "./modules";
import healthRouter from "./http/health.routes";
import metricsRouter from "./http/metrics.routes";
import { metricsMiddleware } from "./http/metrics";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { readTokens } from "./modules/auth/session";
import pinoHttp from "pino-http";
import { logger } from "./platform/logger";

// Security headers
app.use(helmet());

// body parser — 2 MB is generous for a course-management API; lesson
// content is uploaded directly to Streamplace/S3, not through this endpoint.
app.use(express.json({ limit: "2mb" }));

// cookie parser
app.use(cookieParser());

// cors => cross origin resource sharing
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:8081"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    // Rotated tokens come back on these (see updateAccessToken). Browsers hide
    // non-safelisted response headers from cross-origin JS unless exposed, so
    // without this the web clients never see the new pair and the next request
    // presents the refresh token that was just revoked.
    exposedHeaders: ["x-access-token", "x-refresh-token"],
  })
);

// Request logging. Health probes are noisy and carry no signal, so they log
// only when they fail; /metrics is scraped on a fixed interval, same story.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) =>
        req.url === "/health" ||
        req.url === "/ready" ||
        req.url === "/metrics",
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  })
);

// Rate limiting — MUST be registered BEFORE routes.
//
// Keyed by authenticated user, falling back to IP only for anonymous traffic.
// A per-IP quota is wrong for this product's actual deployment: a community
// centre where twenty militantes share one connection would exhaust a single
// IP budget in minutes and lock all of them out at once.
/**
 * Anonymous callers are keyed by IP, collapsing IPv6 to its /64 prefix — a
 * single client is handed a whole /64, so keying on the full address would let
 * one machine rotate through addresses to bypass the quota.
 */
function anonymousKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  return ip.split(":").slice(0, 4).join(":") + "::/64";
}

/**
 * Resolves the caller's user id from the access token.
 *
 * This middleware runs before the routes, so `req.user` (set by
 * isAuthenticated) is not populated yet — reading it here would silently always
 * fall through to the IP bucket. The signature must be verified rather than
 * merely decoded: an unverified id would let a caller mint arbitrary buckets
 * and escape the quota entirely.
 */
function rateLimitKey(req: Request): string {
  const token = readTokens(req).access;
  if (token && process.env.ACCESS_TOKEN) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN, {
        ignoreExpiration: true,
      }) as { id?: string };
      if (decoded?.id) return `user:${decoded.id}`;
    } catch {
      // Fall through to the IP bucket on an invalid token.
    }
  }
  return `ip:${anonymousKey(req.ip ?? "unknown")}`;
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
});

// Credential endpoints stay strictly per-IP and much tighter — this is the
// brute-force surface, and there is no authenticated user to key on yet.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  },
});

// Request metrics — before the routes so every response, including the rate
// limiter's own 429s, is counted.
app.use(metricsMiddleware);

app.use(limiter);
app.use(
  [
    "/api/v1/login",
    "/api/v1/registration",
    "/api/v1/activate-user",
    "/api/v1/auth/atproto/exchange",
  ],
  authLimiter
);

// routes (see modules/index.ts)
app.use("/api/v1", apiRouter);

// Liveness/readiness/metrics probes live at the root, above the rate
// limiter's concern — Caddy, Docker and a future scraper hit them directly,
// not through /api/v1.
app.use(healthRouter);
app.use(metricsRouter);

// Local demo media. Serves fixtures/videos so a lesson can point at a real
// playable file without a Streamplace node. Same gate as DirectUrlProvider —
// off unless ALLOW_DIRECT_VIDEO_URLS=true, so it never ships in production.
if (process.env.ALLOW_DIRECT_VIDEO_URLS === "true") {
  const demoMediaRoot = path.join(FIXTURES_DIR, "videos");
  app.use(
    "/demo-media",
    (req: Request, res: Response, next: NextFunction) => {
      // helmet defaults CORP to same-origin, which blocks the media element
      // on the Expo web origin.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(demoMediaRoot, {
      // Byte-range requests, so the browser can seek in the MP4.
      acceptRanges: true,
    })
  );
}

// unknown route
app.all("*", (req: Request, res: Response, next: NextFunction) => {
  next(new ErrorHandler(`Route ${req.originalUrl} not found`, 404));
});

// middleware calls
app.use(ErrorMiddleware);
