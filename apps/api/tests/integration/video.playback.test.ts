import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../src/platform/db", () => ({
  prisma: {
    courseLesson: { findUnique: vi.fn() },
    enrollment: { findUnique: vi.fn() },
    videoView: { findFirst: vi.fn(async () => null), create: vi.fn() },
    enrollmentLesson: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("../../src/platform/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock("../../src/modules/video/videoDelivery.service", () => ({
  resolvePlaybackUrlWithMetrics: vi.fn(async () => ({
    provider: "streamplace",
    playbackUrl: "https://vod.example/playlist.m3u8",
  })),
  verifyVideoRef: vi.fn(),
}));

let user: any;
vi.mock("../../src/http/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = user;
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import videoRouter from "../../src/modules/video/video.routes";
import { ErrorMiddleware } from "../../src/http/error";
import { prisma } from "../../src/platform/db";

const app = express();
app.use(express.json());
app.use("/api/v1/videos", videoRouter);
app.use(ErrorMiddleware);

const m = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const lesson = (isPreview: boolean) => ({
  id: "l1",
  videoUrl: "at://did:plc:i/place.stream.video/v",
  videoLength: 100,
  isPreview,
  section: { courseId: "c1", course: {} },
});
const play = () => request(app).get("/api/v1/videos/lessons/l1/playback");

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "u1", role: "user", blueskyDid: "did:plc:learner" };
});

describe("GET /videos/lessons/:id/playback", () => {
  it("403s a learner who is not enrolled", async () => {
    m(prisma.courseLesson.findUnique).mockResolvedValue(lesson(false));
    m(prisma.enrollment.findUnique).mockResolvedValue(null);
    expect((await play()).status).toBe(403);
  });

  it("serves an enrolled learner", async () => {
    m(prisma.courseLesson.findUnique).mockResolvedValue(lesson(false));
    m(prisma.enrollment.findUnique).mockResolvedValue({ id: "e1" });
    const res = await play();
    expect(res.status).toBe(200);
    expect(res.body.playbackUrl).toContain("m3u8");
  });

  it("serves a preview lesson without enrollment", async () => {
    m(prisma.courseLesson.findUnique).mockResolvedValue(lesson(true));
    expect((await play()).status).toBe(200);
    expect(prisma.enrollment.findUnique).not.toHaveBeenCalled();
  });

  it("still requires a Bluesky identity", async () => {
    user = { id: "u1", role: "user", blueskyDid: null };
    expect((await play()).status).toBe(403);
    expect(prisma.courseLesson.findUnique).not.toHaveBeenCalled();
  });
});
