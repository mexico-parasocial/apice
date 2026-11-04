/**
 * A deliberate HTTP error: its status and message reach the client as-is.
 * Anything else that reaches ErrorMiddleware is treated as a 500 (see
 * http/error.ts).
 */
class ErrorHandler extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ErrorHandler;
