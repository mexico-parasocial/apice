import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/platform/db", () => ({
  prisma: { courseSection: { findMany: vi.fn() } },
}));
vi.mock("../../src/platform/logger", () => ({
  log: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { prisma } from "../../src/platform/db";
import { verifyVideoRef, resolvePlaybackUrlWithMetrics } from "../../src/modules/video/videoDelivery.service";
import { syncCourseContent } from "../../src/modules/courses/courses.service";

const ALLOWED = "did:plc:7uz5wwvtnu36wtdanvr5m2jt";
const STRANGER = "did:plc:abcdefghijklmnopqrstuvwx";
const original = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.STREAMPLACE_ALLOWED_STREAMS = ALLOWED;
});
afterEach(() => {
  process.env = { ...original };
  vi.clearAllMocks();
});

describe("instructor allowlist enforcement", () => {
  it("refuses to attach a video from a non-approved account (no network call)", async () => {
    const check = await verifyVideoRef(`at://${STRANGER}/place.stream.video/abc`);
    expect(check).toEqual({
      ready: false,
      error: expect.stringContaining("not an approved instructor"),
    });
  });

  it("refuses to resolve playback for a non-approved account", async () => {
    await expect(
      resolvePlaybackUrlWithMetrics(`at://${STRANGER}/place.stream.video/abc`)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("closes everything in production when no list is configured", async () => {
    delete process.env.STREAMPLACE_ALLOWED_STREAMS;
    const check = await verifyVideoRef(`at://${ALLOWED}/place.stream.video/abc`);
    expect(check.ready).toBe(false);
  });

  it("rejects an editor payload carrying a stranger's video before touching the DB", async () => {
    await expect(
      syncCourseContent("course-1", [
        { title: "Lesson", videoSection: "S", videoUrl: `at://${STRANGER}/place.stream.video/abc` },
      ])
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((prisma as any).courseSection.findMany).not.toHaveBeenCalled();
  });
});
