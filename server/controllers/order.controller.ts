import { prisma } from "../utils/db";
import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import path from "path";
import ejs from "ejs";
import sendMail from "../utils/sendMail";
import { getAllOrdersService, executeOrderTransaction } from "../services/order.service";
import { redis } from "../utils/redis";
import { z } from "zod";
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ─── Validation Schemas ─────────────────────────────────────────────

export const orderPayloadSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
  payment_info: z.record(z.string(), z.any()).optional().nullable(),
});

// ─── Helpers ────────────────────────────────────────────────────────

async function sendOrderConfirmationEmail(
  userEmail: string,
  course: { id: string; name: string; price: number }
) {
  const mailData = {
    order: {
      id: course.id.slice(0, 6),
      name: course.name,
      price: course.price,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    },
  };

  const html = await ejs.renderFile(
    path.join(__dirname, "../mails/order-confirmation.ejs"),
    { order: mailData }
  );

  await sendMail({
    email: userEmail,
    subject: "Order Confirmation",
    template: "order-confirmation.ejs",
    data: mailData,
  });
}

// ─── Controllers ────────────────────────────────────────────────────

// create order
export const createOrder = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = orderPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { courseId, payment_info } = parsed.data;

      if (payment_info) {
        if ("id" in payment_info) {
          const paymentIntentId = payment_info.id;
          const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId
          );

          if (paymentIntent.status !== "succeeded") {
            return next(new ErrorHandler("Payment not authorized!", 400));
          }
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user?.id },
      });

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      const existingEnrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId } },
      });

      if (existingEnrollment) {
        return next(
          new ErrorHandler("You have already purchased this course", 400)
        );
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      try {
        await sendOrderConfirmationEmail(user.email, course);
      } catch (error: any) {
        if (process.env.NODE_ENV === "production") {
          return next(new ErrorHandler(error.message, 500));
        }
        console.warn(
          "[createOrder] Order confirmation email failed (dev mode, continuing):",
          error.message
        );
      }

      const [order] = await executeOrderTransaction(
        course.id,
        user.id,
        payment_info,
        course.name
      );

      await redis.set(user.id, JSON.stringify(user));

      res.status(201).json({
        success: true,
        order,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// create order for mobile
export const createMobileOrder = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = orderPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { courseId, payment_info } = parsed.data;

      if (payment_info) {
        if ("id" in payment_info) {
          const paymentIntentId = payment_info.id;
          const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId
          );

          if (paymentIntent.status !== "succeeded") {
            return next(new ErrorHandler("Payment not authorized!", 400));
          }
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user?.id },
      });

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      const existingEnrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId } },
      });

      if (existingEnrollment) {
        return next(
          new ErrorHandler("You have already purchased this course", 400)
        );
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      try {
        await sendOrderConfirmationEmail(user.email, course);
      } catch (error: any) {
        if (process.env.NODE_ENV === "production") {
          return next(new ErrorHandler(error.message, 500));
        }
        console.warn(
          "[createMobileOrder] Order confirmation email failed (dev mode, continuing):",
          error.message
        );
      }

      const [order] = await executeOrderTransaction(
        course.id,
        user.id,
        payment_info,
        course.name
      );

      await redis.set(user.id, JSON.stringify(user));

      res.status(201).json({
        success: true,
        order,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// get All orders --- only for admin
export const getAllOrders = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      getAllOrdersService(res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// send stripe publishable key
export const sendStripePublishableKey = CatchAsyncError(
  async (req: Request, res: Response) => {
    res.status(200).json({
      publishablekey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  }
);

const paymentPayloadSchema = z.object({
  amount: z.number().int().positive().max(1000000, "Amount exceeds maximum allowed"),
  courseIds: z.array(z.string()).optional(),
});

// new payment
export const newPayment = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = paymentPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { amount, courseIds } = parsed.data;
      let validatedAmount = amount;

      // Course purchase amount validation
      if (courseIds && courseIds.length > 0) {
        const courses = await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { price: true },
        });

        if (courses.length !== courseIds.length) {
          return next(new ErrorHandler("One or more courses not found", 404));
        }

        const expectedAmount = Math.round(
          courses.reduce((sum, c) => sum + c.price, 0) * 100
        );

        if (amount !== expectedAmount) {
          return next(
            new ErrorHandler(
              `Invalid payment amount. Expected ${expectedAmount} pence for the selected courses.`,
              400
            )
          );
        }
      }

      const myPayment = await stripe.paymentIntents.create({
        amount: validatedAmount,
        currency: "GBP",
        metadata: {
          company: "E-Learning",
          courseIds: courseIds?.join(",") || "",
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.status(201).json({
        success: true,
        client_secret: myPayment.client_secret,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

