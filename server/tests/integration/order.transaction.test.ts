import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    enrollment: { findUnique: vi.fn() },
    course: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../utils/redis", () => ({
  redis: { set: vi.fn(() => Promise.resolve()) },
}));

vi.mock("../../utils/sendMail", () => ({ default: vi.fn(() => Promise.resolve()) }));

vi.mock("ejs", () => ({
  default: { renderFile: vi.fn(() => Promise.resolve("<html></html>")) },
}));

vi.mock("../../services/order.service", () => ({
  getAllOrdersService: vi.fn(),
  executeOrderTransaction: vi.fn(() => Promise.resolve([{ id: "order-1" }])),
}));

import { createOrder, createMobileOrder } from "../../controllers/order.controller";
import { prisma } from "../../utils/db";
import { redis } from "../../utils/redis";
import { refreshTokenExpireSeconds, userCacheKey } from "../../utils/jwt";

describe("createOrder error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards a Prisma failure to next() without sending a success response", async () => {
    const req = {
      body: { courseId: "course-123" },
      user: { id: "user-123" },
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    (prisma.user.findUnique as any).mockRejectedValue(
      new Error("Connection lost")
    );

    await createOrder(req, res, next);

    // Ensure success response was NOT sent
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();

    // Ensure error was forwarded via next()
    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = next.mock.calls[0][0];
    expect(errorArg.message).toBe("Connection lost");
    expect(errorArg.statusCode).toBe(500);
  });

  it("returns 404 when user is not found", async () => {
    const req = {
      body: { courseId: "course-123" },
      user: { id: "user-123" },
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    (prisma.user.findUnique as any).mockResolvedValue(null);

    await createOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(next.mock.calls[0][0].message).toBe("User not found");
  });

  it("calls next with validation error when payload is malformed", async () => {
    const req = {
      body: { courseId: "", payment_info: {} },
      user: { id: "user-123" },
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await createOrder(req, res, next);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = next.mock.calls[0][0];
    expect(errorArg.statusCode).toBe(400);
    expect(errorArg.message).toContain("courseId is required");
  });
});

describe.each([
  ["createOrder", createOrder],
  ["createMobileOrder", createMobileOrder],
])("%s session cache write", (_name, handler) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the user cache key with EX and a positive TTL", async () => {
    const user = { id: "user-123", email: "u@example.com", name: "U" };
    const req = { body: { courseId: "course-123" }, user: { id: user.id } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    (prisma.user.findUnique as any).mockResolvedValue(user);
    (prisma.enrollment.findUnique as any).mockResolvedValue(null);
    (prisma.course.findUnique as any).mockResolvedValue({
      id: "course-123",
      name: "Course",
      price: 10,
    });

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);

    const sessionWrites = (redis.set as any).mock.calls.filter(
      (call: any[]) => call[0] === userCacheKey(user.id)
    );
    expect(sessionWrites).toHaveLength(1);
    const [key, value, mode, ttl] = sessionWrites[0];
    expect(key).toBe(userCacheKey(user.id));
    expect(JSON.parse(value)).toEqual(user);
    expect(mode).toBe("EX");
    expect(typeof ttl).toBe("number");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBe(refreshTokenExpireSeconds);
  });
});
