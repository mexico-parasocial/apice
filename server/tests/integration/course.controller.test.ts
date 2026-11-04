import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";

vi.mock("../../utils/db", () => ({
  prisma: {
    course: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    courseSection: { findMany: vi.fn() },
    enrollment: { findUnique: vi.fn() },
    review: {
      create: vi.fn(),
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    reviewReply: { create: vi.fn() },
    notification: { create: vi.fn() },
    order: { count: vi.fn() },
  },
}));

vi.mock("../../utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(() => Promise.resolve("OK")),
    del: vi.fn(() => Promise.resolve(1)),
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../middleware/auth", () => ({
  isAutheticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", name: "Ana", role: "admin" };
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import courseRouter from "../../routes/course.route";
import { ErrorMiddleware } from "../../middleware/error";
import { prisma } from "../../utils/db";
import { redis } from "../../utils/redis";

const app = express();
app.use(express.json());
app.use("/api/v1", courseRouter);
app.use(ErrorMiddleware);

const mocked = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const course = { id: "course-1", name: "Civics 101", ratings: 0, purchased: 0 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/get-course/:id", () => {
  it("reads and writes the namespaced course key", async () => {
    mocked(redis.get).mockResolvedValue(null);
    mocked(prisma.course.findUnique).mockResolvedValue(course);
    mocked(prisma.courseSection.findMany).mockResolvedValue([]);
    mocked(prisma.review.findMany).mockResolvedValue([]);

    const res = await request(app).get("/api/v1/get-course/course-1");

    expect(res.status).toBe(200);
    expect(res.body.course).toMatchObject({ courseData: [], reviews: [] });
    expect(redis.get).toHaveBeenCalledWith("course:v2:course-1");
    expect(redis.set).toHaveBeenCalledWith(
      "course:v2:course-1",
      expect.any(String),
      "EX",
      expect.any(Number)
    );
  });
});

describe("PUT /api/v1/add-review/:id", () => {
  beforeEach(() => {
    mocked(prisma.enrollment.findUnique).mockResolvedValue({ id: "enr-1" });
    mocked(prisma.course.findUnique).mockResolvedValue(course);
    mocked(prisma.review.create).mockResolvedValue({ id: "rev-1" });
    mocked(prisma.review.aggregate).mockResolvedValue({ _avg: { rating: 4 } });
    mocked(prisma.course.update).mockResolvedValue({ ...course, ratings: 4 });
  });

  it("invalidates the public course cache instead of overwriting it", async () => {
    const res = await request(app)
      .put("/api/v1/add-review/course-1")
      .send({ review: "Great", rating: 4 });

    expect(res.status).toBe(200);
    expect(redis.del).toHaveBeenCalledWith("course:v2:course-1");
    // The bare course row must never be written over the enriched view.
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("stores the recomputed average rating", async () => {
    await request(app)
      .put("/api/v1/add-review/course-1")
      .send({ review: "Great", rating: 4 });

    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { ratings: 4 },
    });
  });
});

describe("PUT /api/v1/add-reply", () => {
  it("invalidates the cache of the review's course", async () => {
    mocked(prisma.course.findUnique).mockResolvedValue(course);
    mocked(prisma.review.findUnique).mockResolvedValue({
      id: "rev-1",
      courseId: "course-1",
    });
    mocked(prisma.reviewReply.create).mockResolvedValue({ id: "reply-1" });

    const res = await request(app)
      .put("/api/v1/add-reply")
      .send({ comment: "Thanks!", courseId: "course-1", reviewId: "rev-1" });

    expect(res.status).toBe(200);
    expect(redis.del).toHaveBeenCalledWith("course:v2:course-1");
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/get-admin-courses", () => {
  it("answers 200 with the courses", async () => {
    mocked(prisma.course.findMany).mockResolvedValue([course]);

    const res = await request(app).get("/api/v1/get-admin-courses");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, courses: [course] });
  });

  it("answers 500 when the query fails, instead of leaving an unhandled rejection", async () => {
    mocked(prisma.course.findMany).mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/v1/get-admin-courses");

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("DELETE /api/v1/delete-course/:id", () => {
  beforeEach(() => {
    mocked(prisma.course.findUnique).mockResolvedValue(course);
  });

  it("refuses with 409 when the course has orders", async () => {
    mocked(prisma.order.count).mockResolvedValue(2);

    const res = await request(app).delete("/api/v1/delete-course/course-1");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        "This course has 2 orders and cannot be deleted: orders are kept as financial records.",
    });
    expect(prisma.course.delete).not.toHaveBeenCalled();
  });

  it("deletes a course without orders and drops its cache", async () => {
    mocked(prisma.order.count).mockResolvedValue(0);
    mocked(prisma.course.delete).mockResolvedValue(course);

    const res = await request(app).delete("/api/v1/delete-course/course-1");

    expect(res.status).toBe(200);
    expect(prisma.course.delete).toHaveBeenCalledWith({ where: { id: "course-1" } });
    expect(redis.del).toHaveBeenCalledWith("course:v2:course-1");
  });

  it("maps a foreign key race (P2003) to a clean 409", async () => {
    mocked(prisma.order.count).mockResolvedValue(0);
    mocked(prisma.course.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint failed on the field: `Order_courseId_fkey (index)`",
        { code: "P2003", clientVersion: "5.22.0" }
      )
    );

    const res = await request(app).delete("/api/v1/delete-course/course-1");

    expect(res.status).toBe(409);
    expect(res.body.message).not.toMatch(/constraint|fkey|prisma/i);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
