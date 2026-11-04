import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import ErrorHandler from "../utils/ErrorHandler";
import { logger } from "../utils/logger";

export const ErrorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal server error";

  // wrong jwt error
  if (err.name === "JsonWebTokenError") {
    const message = `Json web token is invalid, try again`;
    err = new ErrorHandler(message, 400);
  }

  // JWT expired error
  if (err.name === "TokenExpiredError") {
    const message = `Json web token is expired, try again`;
    err = new ErrorHandler(message, 400);
  }

  // Prisma's messages name tables, constraints and query internals, so they
  // never go to the client verbatim. The original error is still logged.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Foreign key constraint failed: the record is still referenced by
    // others (a delete blocked by ON DELETE RESTRICT), or a write points at
    // a record that does not exist.
    if (err.code === "P2003") {
      logger.warn(
        { err, url: req.originalUrl, method: req.method },
        "foreign key constraint failed"
      );
      err = new ErrorHandler(
        "This change conflicts with related records, so it was not applied.",
        409
      );
    }

    // The record an update or delete targeted does not exist (e.g. it was
    // deleted concurrently).
    if (err.code === "P2025") {
      err = new ErrorHandler("Record not found", 404);
    }
  }

  // 5xx means we broke; log the stack. 4xx is the caller's problem and would
  // otherwise drown the error stream in routine validation failures.
  if (err.statusCode >= 500) {
    logger.error(
      { err, url: req.originalUrl, method: req.method },
      "unhandled server error"
    );
  }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
  });
};
