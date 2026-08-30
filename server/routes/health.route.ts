import express, { Request, Response } from "express";
import { prisma } from "../utils/db";
import { redis } from "../utils/redis";
import { metrics } from "../utils/metrics";
import { version } from "../package.json";

const healthRouter = express.Router();

/**
 * Liveness — "is this process alive?"
 *
 * Deliberately checks nothing external. A liveness probe that fails on a
 * database blip gets the container killed and restarted, which turns a brief
 * dependency hiccup into a restart loop. Dependency health is /ready's job.
 *
 * Version comes along for the ride (atproto PDS pattern): during a rolling
 * deploy, "which build is answering" is the first question worth asking.
 */
healthRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    version,
    uptime: Math.floor(process.uptime()),
  });
});

/** Fails a check rather than hanging forever when a dependency is wedged. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const CHECK_TIMEOUT_MS = 2000;

/**
 * Readiness — "can this instance actually serve a request?"
 *
 * Returns 503 when a dependency is unreachable so a load balancer takes the
 * instance out of rotation without killing it. Reports each dependency
 * separately: "ready: false" alone doesn't tell you which one to go look at.
 */
healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS);
    checks.database = { ok: true };
  } catch (error: any) {
    checks.database = { ok: false, error: error?.message ?? "unknown error" };
  }

  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT_MS);
    checks.redis = { ok: true };
  } catch (error: any) {
    checks.redis = { ok: false, error: error?.message ?? "unknown error" };
  }

  const ready = Object.values(checks).every((c) => c.ok);
  // Mirrored as a metric so an alert rule can fire on `apice_ready == 0`
  // without parsing probe logs.
  metrics.readiness.set(ready ? 1 : 0);
  res.status(ready ? 200 : 503).json({ ready, checks });
});

export default healthRouter;
