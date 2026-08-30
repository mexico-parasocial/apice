import { Request, Response, NextFunction } from "express";
import { metrics } from "../utils/metrics";

/**
 * Labels a request with its route *pattern*, not its URL.
 *
 * At "finish" time Express has already matched the route, so req.route.path
 * is available; /api/v1/courses/:id stays one series instead of one per
 * course. Unmatched requests (404s) collapse into "unmatched".
 */
function routePattern(req: Request): string {
  const route = req.route as { path?: string } | undefined;
  if (route?.path) {
    // Nested routers leave their mount point on req.baseUrl.
    return `${req.baseUrl}${route.path}` || route.path;
  }
  return "unmatched";
}

/**
 * Records request count and duration for every response.
 *
 * Registered before the routes so res.on("finish") fires no matter which
 * layer (handler, error middleware, rate limiter) produced the response.
 * Probes and scrapes are skipped: they are constant-rate traffic that adds
 * noise, not signal.
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (
    req.url === "/health" ||
    req.url === "/ready" ||
    req.url === "/metrics"
  ) {
    return next();
  }

  const end = metrics.httpDuration.startTimer();
  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: routePattern(req),
      status: String(res.statusCode),
    };
    end(labels);
    metrics.httpRequests.inc(labels);
  });

  next();
}
