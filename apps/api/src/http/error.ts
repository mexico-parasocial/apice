import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import ErrorHandler from "./ErrorHandler";
import { logger } from "../platform/logger";

export const ErrorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal server error";

  // A JWT that fails verification is a credential problem, not a malformed
  // request: 401, so clients drop the dead session (see middleware/auth.ts).
  if (err.name === "JsonWebTokenError") {
    const message = `Json web token is invalid, try again`;
    err = new ErrorHandler(message, 401);
  }

  if (err.name === "TokenExpiredError") {
    const message = `Json web token is expired, try again`;
    err = new ErrorHandler(message, 401);
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

    // Unique constraint: the thing being created already exists.
    if (err.code === "P2002") {
      err = new ErrorHandler("This record already exists", 409);
    }
  }

  // Anything that isn't a deliberate HTTP error (ErrorHandler, or a JWT /
  // Prisma error mapped above) is our failure: 500, and in production its
  // message stays in the logs — it can name tables, hosts or file paths.
  const isDeliberate = err instanceof ErrorHandler;
  if (!isDeliberate) {
    err.statusCode = 500;
  }

  // 5xx means we broke; log the stack. 4xx is the caller's problem and would
  // otherwise drown the error stream in routine validation failures.
  if (err.statusCode >= 500) {
    logger.error(
      { err, url: req.originalUrl, method: req.method },
      "unhandled server error"
    );
  }

  const hideMessage =
    !isDeliberate && process.env.NODE_ENV === "production";
  res.status(err.statusCode).json({
    success: false,
    message: hideMessage ? "Internal server error" : err.message,
  });
};
