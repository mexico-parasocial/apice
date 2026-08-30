import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/db", () => ({
  prisma: {
    order: { create: vi.fn(() => "order-promise") },
    enrollment: { upsert: vi.fn(() => "enrollment-promise") },
    notification: { create: vi.fn(() => "notification-promise") },
    course: { update: vi.fn(() => "course-promise") },
    $transaction: vi.fn(),
  },
}));

import { executeOrderTransaction } from "../../services/order.service";
import { prisma } from "../../utils/db";

describe("executeOrderTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps all order side-effects in a single prisma.$transaction call", async () => {
    (prisma.$transaction as any).mockResolvedValue([
      { id: "order-1" },
      { id: "enrollment-1", userId: "user-1", courseId: "course-1" },
      { id: "notif-1" },
      { id: "course-1", purchased: 1 },
    ]);

    const result = await executeOrderTransaction(
      "course-1",
      "user-1",
      { id: "pi_123" },
      "Test Course"
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Verify all four Prisma operations are passed inside the transaction array
    const transactionCalls = (prisma.$transaction as any).mock.calls[0][0];
    expect(transactionCalls).toHaveLength(4);

    // Verify individual operations were invoked (they return promises fed into $transaction)
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        courseId: "course-1",
        userId: "user-1",
        payment_info: { id: "pi_123" },
      },
    });
    expect(prisma.enrollment.upsert).toHaveBeenCalledWith({
      where: { userId_courseId: { userId: "user-1", courseId: "course-1" } },
      update: {},
      create: {
        userId: "user-1",
        courseId: "course-1",
        enrolledAt: expect.any(Date),
        lastAccessedAt: expect.any(Date),
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "New Order",
        message: "You have a new order from Test Course",
      },
    });
    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { purchased: { increment: 1 } },
    });

    // Verify the returned destructured array
    expect(result[0]).toEqual({ id: "order-1" });
    expect(result[1]).toEqual({
      id: "enrollment-1",
      userId: "user-1",
      courseId: "course-1",
    });
  });

  it("rejects and rolls back when any operation inside the transaction fails", async () => {
    (prisma.$transaction as any).mockRejectedValue(
      new Error("Deadlock detected")
    );

    await expect(
      executeOrderTransaction("course-1", "user-1", {}, "Test Course")
    ).rejects.toThrow("Deadlock detected");

    // $transaction should still have been called (Prisma handles rollback internally)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
