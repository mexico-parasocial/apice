import { Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { prisma } from "../utils/db";

// create new order
export const newOrder = CatchAsyncError(async (data: any, res: Response) => {
  const order = await prisma.order.create({
    data,
  });

  res.status(201).json({
    success: true,
    order,
  });
});

// Get All Orders (paginated)
export const getAllOrdersService = async (
  res: Response,
  page: number = 1,
  limit: number = 50
) => {
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count(),
  ]);

  res.status(200).json({
    success: true,
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

/**
 * Execute the order creation as an atomic Prisma transaction.
 * This ensures that a user is never charged without an Enrollment
 * being created for the course.
 */
export async function executeOrderTransaction(
  courseId: string,
  userId: string,
  payment_info: any,
  courseName: string
) {
  return prisma.$transaction([
    prisma.order.create({
      data: {
        courseId,
        userId,
        payment_info: (payment_info ?? {}) as any,
      },
    }),
    prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {},
      create: {
        userId,
        courseId,
        enrolledAt: new Date(),
        lastAccessedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        title: "New Order",
        message: `You have a new order from ${courseName}`,
      },
    }),
    prisma.course.update({
      where: { id: courseId },
      data: { purchased: { increment: 1 } },
    }),
  ]);
}
