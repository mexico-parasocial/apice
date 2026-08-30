require("dotenv").config();
import express, { NextFunction, Request, Response } from "express";
import { loadEnv } from "./utils/env";
// Fail the deploy, not the first request: validated before anything below
// reads process.env (the CORS whitelist in particular).
loadEnv();

export const app = express();
import cors from "cors";
import helmet from "helmet";
import path from "path";
import cookieParser from "cookie-parser";
import { ErrorMiddleware } from "./middleware/error";
import userRouter from "./routes/user.route";
import courseRouter from "./routes/course.route";
import orderRouter from "./routes/order.route";
import notificationRouter from "./routes/notification.route";
import analyticsRouter from "./routes/analytics.route";
import layoutRouter from "./routes/layout.route";
import progressRouter from "./routes/progress.route";
import ineRouter from "./routes/ine.route";
import atprotoRouter from "./routes/atproto.route";
import quizRouter from "./routes/quiz.route";
import im8Router from "./routes/im8.route";
import certificateRouter from "./routes/certificate.route";
import videoRouter from "./routes/video.route";
import enrollmentRouter from "./routes/enrollment.route";
import atprotoAuthRouter from "./routes/atprotoAuth.route";
import networkRouter from "./routes/network.route";
import healthRouter from "./routes/health.route";
import metricsRouter from "./routes/metrics.route";
import { metricsMiddleware } from "./middleware/metrics";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import pinoHttp from "pino-http";
import { logger } from "./utils/logger";

// Security headers
app.use(helmet());

// body parser
app.use(express.json({ limit: "50mb" }));

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
 * isAutheticated) is not populated yet — reading it here would silently always
 * fall through to the IP bucket. The signature must be verified rather than
 * merely decoded: an unverified id would let a caller mint arbitrary buckets
 * and escape the quota entirely.
 */
function rateLimitKey(req: Request): string {
  const token = req.headers["access-token"];
  if (typeof token === "string" && token && process.env.ACCESS_TOKEN) {
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
  ["/api/v1/login", "/api/v1/registration", "/api/v1/activate-user"],
  authLimiter
);

// routes
app.use(
  "/api/v1",
  userRouter,
  orderRouter,
  courseRouter,
  notificationRouter,
  analyticsRouter,
  layoutRouter,
  progressRouter,
  ineRouter,
  atprotoRouter,
  quizRouter,
  certificateRouter,
  im8Router,
  enrollmentRouter,
  atprotoAuthRouter,
  networkRouter
);

// Liveness/readiness/metrics probes live at the root, above the rate
// limiter's concern — Caddy, Docker and a future scraper hit them directly,
// not through /api/v1.
app.use(healthRouter);
app.use(metricsRouter);

// video delivery routes live under /api/v1/videos
app.use("/api/v1/videos", videoRouter);

// Local demo media. Serves fixtures/videos so a lesson can point at a real
// playable file without a Streamplace node. Same gate as DirectUrlProvider —
// off unless ALLOW_DIRECT_VIDEO_URLS=true, so it never ships in production.
if (process.env.ALLOW_DIRECT_VIDEO_URLS === "true") {
  app.use(
    "/demo-media",
    (req: Request, res: Response, next: NextFunction) => {
      // helmet defaults CORP to same-origin, which blocks the media element
      // on the Expo web origin.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "..", "fixtures", "videos"), {
      // Byte-range requests, so the browser can seek in the MP4.
      acceptRanges: true,
    })
  );
}

// testing api
app.get("/test", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    succcess: true,
    message: "API is working",
  });
});

// unknown route
app.all("*", (req: Request, res: Response, next: NextFunction) => {
  const err = new Error(`Route ${req.originalUrl} not found`) as any;
  err.statusCode = 404;
  next(err);
});

// middleware calls
app.use(ErrorMiddleware);
