import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    course: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../utils/redis", () => ({
  redis: { set: vi.fn(() => Promise.resolve()) },
}));

import { createOrder } from "../../controllers/order.controller";
import { prisma } from "../../utils/db";

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
