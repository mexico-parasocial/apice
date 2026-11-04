import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ErrorMiddleware } from "../../middleware/error";
import ErrorHandler from "../../utils/ErrorHandler";

function run(err: unknown) {
  const res: any = { json: vi.fn() };
  res.status = vi.fn().mockReturnValue(res);
  ErrorMiddleware(err, { originalUrl: "/x", method: "DELETE" } as any, res, vi.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

const prismaError = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "5.22.0",
  });

describe("ErrorMiddleware", () => {
  it("maps a foreign key failure (P2003) to 409 without Prisma's message", () => {
    const raw =
      "Invalid `prisma.user.delete()` invocation:\n\nForeign key constraint failed on the field: `Order_userId_fkey (index)`";

    const { status, body } = run(prismaError("P2003", raw));

    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).not.toContain("prisma");
    expect(body.message).not.toContain("fkey");
  });

  it("maps a missing record (P2025) to 404", () => {
    const { status, body } = run(
      prismaError("P2025", "An operation failed because it depends on one or more records that were required but not found.")
    );

    expect(status).toBe(404);
    expect(body).toEqual({ success: false, message: "Record not found" });
  });

  it("passes an ErrorHandler through unchanged", () => {
    const { status, body } = run(new ErrorHandler("course not found", 404));

    expect(status).toBe(404);
    expect(body).toEqual({ success: false, message: "course not found" });
  });

  it("defaults anything else to 500", () => {
    const { status } = run(new Error("boom"));

    expect(status).toBe(500);
  });
});
