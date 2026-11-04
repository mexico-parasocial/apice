// Set required env vars before env.ts is imported by modules under test.
process.env.ACCESS_TOKEN = "dev-access-token";
process.env.REFRESH_TOKEN = "dev-refresh-token";

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../src/platform/db", () => ({
  prisma: {
    course: { findUnique: vi.fn() },
    courseSection: { findMany: vi.fn() },
    review: { findMany: vi.fn() },
  },
}));

vi.mock("../../src/platform/redis", () => ({
  redis: {
    set: vi.fn(() => Promise.resolve("OK")),
    get: vi.fn(),
    del: vi.fn(() => Promise.resolve(1)),
  },
}));

vi.mock("../../src/http/auth", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../src/platform/mail", () => ({ default: vi.fn() }));
vi.mock("cloudinary", () => ({ default: { v2: {} } }));

import { prisma } from "../../src/platform/db";
import { redis } from "../../src/platform/redis";
import { courseCacheKey } from "../../src/platform/cache";
import courseRouter from "../../src/modules/courses/courses.routes";
import { ErrorMiddleware } from "../../src/http/error";

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
