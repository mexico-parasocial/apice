// Set required env vars before env.ts is imported by modules under test.
process.env.ACCESS_TOKEN = "dev-access-token";
process.env.REFRESH_TOKEN = "dev-refresh-token";

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
    set: vi.fn(() => Promise.resolve("OK")),
    get: vi.fn(),
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

vi.mock("../../utils/sendMail", () => ({ default: vi.fn() }));
vi.mock("cloudinary", () => ({ default: { v2: {} } }));

import { prisma } from "../../utils/db";
import { redis } from "../../utils/redis";
import { courseCacheKey } from "../../utils/cache";
import courseRouter from "../../routes/course.route";
import { ErrorMiddleware } from "../../middleware/error";

const db = prisma as unknown as {
  course: { findUnique: ReturnType<typeof vi.fn> };
  courseSection: { findMany: ReturnType<typeof vi.fn> };
  review: { findMany: ReturnType<typeof vi.fn> };
};
const mockedRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

const REVIEWER = {
  id: "u-reviewer",
  name: "Rita Reviewer",
  email: "rita.reviewer@example.com",
  avatar: null,
};
const REPLIER = {
  id: "u-admin",
  name: "Adam Admin",
  email: "adam.admin@example.com",
  avatar: null,
};

/** Emulate Prisma: a `select` returns only the chosen columns of the row. */
function applySelect(row: Record<string, unknown>, select?: Record<string, boolean>) {
  if (!select) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => select[key])
  );
}

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/v1", courseRouter);
  a.use(ErrorMiddleware);
  return a;
}

/** Collect every value stored under an `email` key, at any depth. */
function findEmails(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    value.forEach((v) => findEmails(v, found));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "email") found.push(v);
      findEmails(v, found);
    }
  }
  return found;
}

describe("GET /api/v1/get-course/:id (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRedis.get.mockResolvedValue(null);
    db.course.findUnique.mockResolvedValue({ id: "c1", name: "Course One" });
    db.courseSection.findMany.mockResolvedValue([]);
    db.review.findMany.mockImplementation(async (args: any) => {
      const userSel = args.include.user.select;
      const replyUserSel = args.include.replies.include.user.select;
      return [
        {
          id: "r1",
          rating: 5,
          comment: "Great",
          createdAt: new Date(),
          user: applySelect(REVIEWER, userSel),
          replies: [
            {
              comment: "Thanks!",
              createdAt: new Date(),
              updatedAt: new Date(),
              user: applySelect(REPLIER, replyUserSel),
            },
          ],
        },
      ];
    });
  });

  it("does not expose email on review or reply users", async () => {
    const res = await request(app()).get("/api/v1/get-course/c1");

    expect(res.status).toBe(200);
    const { reviews } = res.body.course;
    expect(reviews).toHaveLength(1);
    expect(reviews[0].user).toEqual({
      id: "u-reviewer",
      name: "Rita Reviewer",
      avatar: null,
    });
    expect(reviews[0].commentReplies).toHaveLength(1);
    expect(reviews[0].commentReplies[0].user).toEqual({
      id: "u-admin",
      name: "Adam Admin",
      avatar: null,
    });
    expect(reviews[0].user).not.toHaveProperty("email");
    expect(reviews[0].commentReplies[0].user).not.toHaveProperty("email");
    expect(findEmails(res.body)).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("@example.com");
  });

  it("does not write emails into the Redis cache", async () => {
    await request(app()).get("/api/v1/get-course/c1");

    expect(mockedRedis.set).toHaveBeenCalledTimes(1);
    const [key, payload] = mockedRedis.set.mock.calls[0];
    expect(key).toBe(courseCacheKey("c1"));
    expect(payload).not.toContain("@example.com");
    expect(findEmails(JSON.parse(payload))).toEqual([]);
  });

  it("reads from the versioned key, so legacy v1 entries are never served", async () => {
    // Legacy entries lived under the bare course id and carried emails.
    mockedRedis.get.mockImplementation(async (key: string) =>
      key === "c1"
        ? JSON.stringify({ id: "c1", reviews: [{ user: REVIEWER }] })
        : null
    );

    const res = await request(app()).get("/api/v1/get-course/c1");

    expect(mockedRedis.get).toHaveBeenCalledWith(courseCacheKey("c1"));
    expect(mockedRedis.get).not.toHaveBeenCalledWith("c1");
    expect(courseCacheKey("c1")).not.toBe("c1");
    expect(res.status).toBe(200);
    expect(findEmails(res.body)).toEqual([]);
  });
});

// ─── Cache invalidation, admin list, course delete ─────────────────

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

    const res = await request(app()).get("/api/v1/get-course/course-1");

    expect(res.status).toBe(200);
    expect(res.body.course).toMatchObject({ courseData: [], reviews: [] });
    expect(redis.get).toHaveBeenCalledWith(courseCacheKey("course-1"));
    expect(redis.set).toHaveBeenCalledWith(
      courseCacheKey("course-1"),
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
    const res = await request(app())
      .put("/api/v1/add-review/course-1")
      .send({ review: "Great", rating: 4 });

    expect(res.status).toBe(200);
    expect(redis.del).toHaveBeenCalledWith(courseCacheKey("course-1"));
    // The bare course row must never be written over the enriched view.
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("stores the recomputed average rating", async () => {
    await request(app())
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

    const res = await request(app())
      .put("/api/v1/add-reply")
      .send({ comment: "Thanks!", courseId: "course-1", reviewId: "rev-1" });

    expect(res.status).toBe(200);
    expect(redis.del).toHaveBeenCalledWith(courseCacheKey("course-1"));
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/get-admin-courses", () => {
  it("answers 200 with the courses", async () => {
    mocked(prisma.course.findMany).mockResolvedValue([course]);

    const res = await request(app()).get("/api/v1/get-admin-courses");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, courses: [course] });
  });

  it("answers 500 when the query fails, instead of leaving an unhandled rejection", async () => {
    mocked(prisma.course.findMany).mockRejectedValue(new Error("db down"));

    const res = await request(app()).get("/api/v1/get-admin-courses");

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

    const res = await request(app()).delete("/api/v1/delete-course/course-1");

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

    const res = await request(app()).delete("/api/v1/delete-course/course-1");

    expect(res.status).toBe(200);
    expect(prisma.course.delete).toHaveBeenCalledWith({ where: { id: "course-1" } });
    expect(redis.del).toHaveBeenCalledWith(courseCacheKey("course-1"));
  });

  it("maps a foreign key race (P2003) to a clean 409", async () => {
    mocked(prisma.order.count).mockResolvedValue(0);
    mocked(prisma.course.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint failed on the field: `Order_courseId_fkey (index)`",
        { code: "P2003", clientVersion: "5.22.0" }
      )
    );

    const res = await request(app()).delete("/api/v1/delete-course/course-1");

    expect(res.status).toBe(409);
    expect(res.body.message).not.toMatch(/constraint|fkey|prisma/i);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
