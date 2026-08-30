import { Request, Response, NextFunction } from "express";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { prisma } from "../utils/db";
import cloudinary from "cloudinary";
import { z } from "zod";

const layoutCreateSchema = z.object({
  type: z.enum(["Banner", "FAQ", "Categories"]),
  image: z.string().optional(),
  title: z.string().optional(),
  subTitle: z.string().optional(),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
  categories: z.array(z.object({ title: z.string() })).optional(),
});

// create layout
export const createLayout = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = layoutCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { type, image, title, subTitle, faq, categories } = parsed.data;
      const isTypeExist = await prisma.layout.findFirst({
        where: { type },
      });
      if (isTypeExist) {
        return next(new ErrorHandler(`${type} already exist`, 400));
      }
      if (type === "Banner") {
        if (!image) {
          return next(new ErrorHandler("Image is required for Banner", 400));
        }
        const myCloud = await cloudinary.v2.uploader.upload(image, {
          folder: "layout",
        });
        await prisma.layout.create({
          data: {
            type: "Banner",
            banner: {
              image: {
                public_id: myCloud.public_id,
                url: myCloud.secure_url,
              },
              title,
              subTitle,
            } as any,
          },
        });
      }
      if (type === "FAQ") {
        if (!faq) {
          return next(new ErrorHandler("FAQ items are required", 400));
        }
        const faqItems = faq.map((item) => ({
          question: item.question,
          answer: item.answer,
        }));
        await prisma.layout.create({
          data: {
            type: "FAQ",
            faq: faqItems,
          },
        });
      }
      if (type === "Categories") {
        if (!categories) {
          return next(new ErrorHandler("Categories are required", 400));
        }
        const categoriesItems = categories.map((item) => ({
          title: item.title,
        }));
        await prisma.layout.create({
          data: {
            type: "Categories",
            categories: categoriesItems,
          },
        });
      }

      res.status(200).json({
        success: true,
        message: "Layout created successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

const layoutUpdateSchema = z.object({
  type: z.enum(["Banner", "FAQ", "Categories"]),
  image: z.string().optional(),
  title: z.string().optional(),
  subTitle: z.string().optional(),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
  categories: z.array(z.object({ title: z.string() })).optional(),
});

// Edit layout
export const editLayout = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = layoutUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new ErrorHandler(
            parsed.error.issues.map((e) => e.message).join(", "),
            400
          )
        );
      }

      const { type, image, title, subTitle, faq, categories } = parsed.data;
      if (type === "Banner") {
        const bannerData: any = await prisma.layout.findFirst({
          where: { type: "Banner" },
        });
        if (!bannerData) {
          return next(new ErrorHandler("Banner layout not found", 404));
        }

        const data = image?.startsWith("https")
          ? bannerData.banner
          : await cloudinary.v2.uploader.upload(image || "", {
              folder: "layout",
            });

        const banner = {
          image: {
            public_id: image?.startsWith("https")
              ? bannerData.banner.image.public_id
              : data?.public_id,
            url: image?.startsWith("https")
              ? bannerData.banner.image.url
              : data?.secure_url,
          },
          title,
          subTitle,
        };

        await prisma.layout.update({
          where: { id: bannerData.id },
          data: { banner: banner as any },
        });
      }

      if (type === "FAQ") {
        if (!faq) {
          return next(new ErrorHandler("FAQ items are required", 400));
        }
        const faqItem = await prisma.layout.findFirst({
          where: { type: "FAQ" },
        });
        const faqItems = faq.map((item) => ({
          question: item.question,
          answer: item.answer,
        }));
        await prisma.layout.update({
          where: { id: faqItem?.id },
          data: {
            faq: faqItems,
          },
        });
      }
      if (type === "Categories") {
        if (!categories) {
          return next(new ErrorHandler("Categories are required", 400));
        }
        const categoriesData = await prisma.layout.findFirst({
          where: { type: "Categories" },
        });
        const categoriesItems = categories.map((item) => ({
          title: item.title,
        }));
        await prisma.layout.update({
          where: { id: categoriesData?.id },
          data: {
            categories: categoriesItems,
          },
        });
      }

      res.status(200).json({
        success: true,
        message: "Layout Updated successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// get layout by type
export const getLayoutByType = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.params;
      const layout = await prisma.layout.findFirst({
        where: { type },
      });
      res.status(201).json({
        success: true,
        layout,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

