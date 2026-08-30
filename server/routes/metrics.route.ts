import express, { Request, Response } from "express";
import { metrics } from "../utils/metrics";

const metricsRouter = express.Router();

/**
 * GET /metrics — Prometheus scrape endpoint.
 *
 * Mounted at the root, above the rate limiter, alongside /health and /ready:
 * a scraper's fixed-interval pulls must never consume the users' request
 * budget, and a wedged app that rejects everything must still be scrapable.
 *
 * METRICS_ENABLED=false disables it. Through the Cloudflare tunnel this
 * endpoint is publicly reachable; the labels carry no user data (only route
 * patterns and providers), but deployments that want it fully private can
 * turn it off and scrape inside the compose network instead.
 */
metricsRouter.get("/metrics", async (_req: Request, res: Response) => {
  if (process.env.METRICS_ENABLED === "false") {
    res.status(404).end();
    return;
  }
  try {
    res.setHeader("Content-Type", metrics.registry.contentType);
    res.end(await metrics.registry.metrics());
  } catch {
    // Registry failures should never take down the scrape endpoint itself.
    res.status(500).end("# metrics registry error\n");
  }
});

export default metricsRouter;
