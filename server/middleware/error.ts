import { NextFunction, Request, Response } from "express";
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
