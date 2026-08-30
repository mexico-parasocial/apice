// Metrics middleware + /metrics route, exercised against a small Express app
// rather than the real one: importing ../app would drag in every controller
// and its env requirements, and none of that is what's under test here.
import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { metricsMiddleware } from "../../middleware/metrics";
import metricsRouter from "../../routes/metrics.route";
import { metrics } from "../../utils/metrics";

function buildApp() {
  const app = express();
  app.use(metricsMiddleware);
  app.get("/api/v1/courses/:id", (_req, res) => res.status(200).json({ ok: true }));
  app.use(metricsRouter);
  return app;
}

describe("metrics middleware", () => {
  it("counts requests under the route pattern, not the URL", async () => {
    const app = buildApp();
    await request(app).get("/api/v1/courses/course-123").expect(200);

    const registryOutput = await metrics.registry.metrics();
    expect(registryOutput).toContain('route="/api/v1/courses/:id"');
    // The literal id must not become its own label value.
    expect(registryOutput).not.toContain("course-123");
  });

  it("labels unmatched requests as unmatched", async () => {
    const app = buildApp();
    await request(app).get("/nowhere").expect(404);

    const registryOutput = await metrics.registry.metrics();
    expect(registryOutput).toContain('route="unmatched"');
  });

  it("skips /metrics itself so scrapes never inflate the counters", async () => {
    const app = buildApp();
    await request(app).get("/metrics").expect(200);
    await request(app).get("/metrics").expect(200);

    const registryOutput = await metrics.registry.metrics();
    expect(registryOutput).not.toContain('route="/metrics"');
  });
});

describe("GET /metrics", () => {
  it("serves the Prometheus text format with app metrics", async () => {
    const app = buildApp();
    const res = await request(app).get("/metrics").expect(200);
    expect(res.headers["content-type"]).toContain(metrics.registry.contentType);
    expect(res.text).toContain("apice_http_requests_total");
    expect(res.text).toContain("apice_video_playback_requests_total");
    expect(res.text).toContain("apice_socket_connections");
    expect(res.text).toContain("apice_ready");
  });
});
