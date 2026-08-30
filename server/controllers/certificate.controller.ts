import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { prisma } from "../utils/db";

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateCertificateSvg(
  recipientName: string,
  courseName: string,
  issuedAt: Date
): string {
  const dateStr = issuedAt.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#FFFFFF" />
  <rect x="24" y="24" width="752" height="552" rx="16" fill="none" stroke="#4A1052" stroke-width="4" />
  <text x="400" y="110" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#4A1052" font-weight="bold">ÁPICE</text>
  <text x="400" y="170" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#4A1052" font-weight="bold">Certificado de Finalización</text>
  <text x="400" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#374151">Otorgado a</text>
  <text x="400" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#111827" font-weight="bold">${escapeXml(
    recipientName
  )}</text>
  <text x="400" y="370" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#374151">Por completar el programa</text>
  <text x="400" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#4A1052" font-weight="bold">${escapeXml(
    courseName
  )}</text>
  <text x="400" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#6B7280">Fecha de emisión: ${escapeXml(
    dateStr
  )}</text>
</svg>`;
}

export const getMyCertificates = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const certificates = await prisma.certificate.findMany({
        where: { userId },
        orderBy: { issuedAt: "desc" },
        // svgContent is regenerated on demand at /download — shipping it
        // per row makes the list payload kilobytes-per-certificate heavy.
        omit: { svgContent: true },
      });

      res.status(200).json({
        success: true,
        certificates,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

export const claimCertificate = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const { courseId } = req.params;

      if (!userId) {
        return next(new ErrorHandler("User not found", 404));
      }

      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        include: { course: true },
      });

      if (!enrollment) {
        return next(new ErrorHandler("Enrollment not found", 404));
      }

      if (!enrollment.completed) {
        return next(
          new ErrorHandler(
            "Course must be completed before claiming a certificate",
            400
          )
        );
      }

      const existing = await prisma.certificate.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });

      if (existing) {
        return res.status(200).json({
          success: true,
          certificate: existing,
          alreadyClaimed: true,
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      const issuedAt = new Date();
      const svgContent = generateCertificateSvg(
        user.name,
        enrollment.course.name,
        issuedAt
      );

      const certificate = await prisma.certificate.create({
        data: {
          userId,
          courseId,
          courseName: enrollment.course.name,
          issuedAt,
          svgContent,
        },
      });

      const downloadUrl = `/api/v1/certificates/${certificate.id}/download`;
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { downloadUrl },
      });

      res.status(201).json({
        success: true,
        certificate: { ...certificate, downloadUrl },
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

export const downloadCertificate = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const certificate = await prisma.certificate.findUnique({
        where: { id },
      });

      if (!certificate) {
        return next(new ErrorHandler("Certificate not found", 404));
      }

      if (certificate.userId !== userId) {
        return next(new ErrorHandler("Unauthorized", 403));
      }

      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="certificado-${certificate.courseName
          .toLowerCase()
          .replace(/\s+/g, "-")}.svg"`
      );
      res.status(200).send(certificate.svgContent);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
