import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";

vi.mock("../../utils/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    review: { findMany: vi.fn(), aggregate: vi.fn() },
    reviewReply: { findMany: vi.fn() },
    course: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(() => Promise.resolve("OK")),
    del: vi.fn(() => Promise.resolve(1)),
  },
}));

vi.mock("../../utils/jwt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/jwt")>()),
  revokeAllRefreshTokens: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Auth is not under test here: every request is an authenticated admin.
vi.mock("../../middleware/auth", () => ({
  isAutheticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", role: "admin" };
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import userRouter from "../../routes/user.route";
import { ErrorMiddleware } from "../../middleware/error";
import { prisma } from "../../utils/db";
import { redis } from "../../utils/redis";
import { revokeAllRefreshTokens } from "../../utils/jwt";
import { courseCacheKey } from "../../utils/cache";

const app = express();
app.use(express.json());
app.use("/api/v1", userRouter);
app.use(ErrorMiddleware);

const mocked = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const user = { id: "user-1", name: "Ana", email: "ana@example.com", role: "user" };

beforeEach(() => {
  vi.clearAllMocks();
  // Interactive transactions run against the same mocked client.
  mocked(prisma.$transaction).mockImplementation((fn: any) => fn(prisma));
});

describe("GET /api/v1/me", () => {
  it("answers 500 when Redis rejects, instead of leaving an unhandled rejection", async () => {
    mocked(redis.get).mockRejectedValue(new Error("Connection is closed."));

    const res = await request(app).get("/api/v1/me");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Connection is closed." });
  });

  it("serves the cached session user", async () => {
    mocked(redis.get).mockResolvedValue(JSON.stringify(user));

    const res = await request(app).get("/api/v1/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, user });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the database and caches the user on a miss", async () => {
    mocked(redis.get).mockResolvedValue(null);
    mocked(prisma.user.findUnique).mockResolvedValue(user);

    const res = await request(app).get("/api/v1/me");

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(user);
    expect(redis.set).toHaveBeenCalledWith(
      "user-1",
      JSON.stringify(user),
      "EX",
      expect.any(Number)
    );
  });

  it("answers 404 when the user no longer exists", async () => {
    mocked(redis.get).mockResolvedValue(null);
    mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app).get("/api/v1/me");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "User not found" });
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/update-user", () => {
  const body = { email: "ana@example.com", role: "admin" };

  it("answers 500 when the update fails, instead of leaving an unhandled rejection", async () => {
    mocked(prisma.user.findUnique).mockResolvedValue(user);
    mocked(prisma.user.update).mockRejectedValue(new Error("db down"));

    const res = await request(app).put("/api/v1/update-user").send(body);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it("updates the role and drops the session cache", async () => {
    const promoted = { ...user, role: "admin" };
    mocked(prisma.user.findUnique).mockResolvedValue(user);
    mocked(prisma.user.update).mockResolvedValue(promoted);

    const res = await request(app).put("/api/v1/update-user").send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, user: promoted });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: "admin" },
    });
    expect(redis.del).toHaveBeenCalledWith("user-1");
  });
});

describe("DELETE /api/v1/delete-user/:id", () => {
  beforeEach(() => {
    mocked(prisma.user.findUnique).mockResolvedValue(user);
    mocked(prisma.user.delete).mockResolvedValue(user);
    mocked(prisma.review.findMany).mockResolvedValue([]);
    mocked(prisma.reviewReply.findMany).mockResolvedValue([]);
  });

  it("deletes the user and revokes the session and every refresh token", async () => {
    const res = await request(app).delete("/api/v1/delete-user/user-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(redis.del).toHaveBeenCalledWith("user-1");
    expect(revokeAllRefreshTokens).toHaveBeenCalledWith("user-1");
    // No reviews or replies: no course cache to touch.
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it("recomputes ratings after the cascade and drops affected course caches", async () => {
    mocked(prisma.review.findMany).mockResolvedValue([
      { courseId: "course-a" },
      { courseId: "course-a" },
    ]);
    mocked(prisma.reviewReply.findMany).mockResolvedValue([
      { review: { courseId: "course-b" } },
    ]);
    mocked(prisma.review.aggregate).mockResolvedValue({ _avg: { rating: 4.5 } });

    const res = await request(app).delete("/api/v1/delete-user/user-1");

    expect(res.status).toBe(200);
    // Only the reviewed course changes rating, once.
    expect(prisma.course.update).toHaveBeenCalledTimes(1);
    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: "course-a" },
      data: { ratings: 4.5 },
    });
    // The average is taken after the user's reviews are gone.
    expect(mocked(prisma.review.aggregate).mock.invocationCallOrder[0]).toBeGreaterThan(
      mocked(prisma.user.delete).mock.invocationCallOrder[0]
    );
    expect(redis.del).toHaveBeenCalledWith(
      courseCacheKey("course-a"),
      courseCacheKey("course-b")
    );
  });

  it("maps a foreign key failure (P2003) to a clean 409", async () => {
    mocked(prisma.user.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint failed on the field: `Order_userId_fkey (index)`",
        { code: "P2003", clientVersion: "5.22.0" }
      )
    );

    const res = await request(app).delete("/api/v1/delete-user/user-1");

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).not.toMatch(/constraint|fkey|prisma/i);
    // The delete did not happen, so the sessions stay.
    expect(revokeAllRefreshTokens).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown user", async () => {
    mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app).delete("/api/v1/delete-user/nope");

    expect(res.status).toBe(404);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
