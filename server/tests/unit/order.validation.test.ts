import { describe, it, expect, vi } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_123";

vi.mock("../../utils/redis", () => ({
  redis: { set: vi.fn(() => Promise.resolve()) },
}));

vi.mock("ejs", () => ({
  default: {
    renderFile: vi.fn(() => Promise.resolve("<html></html>")),
  },
}));

vi.mock("../../utils/sendMail", () => ({
  default: vi.fn(() => Promise.resolve()),
}));

import { orderPayloadSchema } from "../../controllers/order.controller";

describe("orderPayloadSchema", () => {
  it("accepts a valid payload with courseId and payment_info", () => {
    const result = orderPayloadSchema.safeParse({
      courseId: "course-123",
      payment_info: { id: "pi_123", status: "succeeded" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload with only courseId", () => {
    const result = orderPayloadSchema.safeParse({
      courseId: "course-456",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null payment_info", () => {
    const result = orderPayloadSchema.safeParse({
      courseId: "course-789",
      payment_info: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty courseId", () => {
    const result = orderPayloadSchema.safeParse({
      courseId: "",
      payment_info: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("courseId is required");
    }
  });

  it("rejects a missing courseId", () => {
    const result = orderPayloadSchema.safeParse({
      payment_info: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string courseId", () => {
    const result = orderPayloadSchema.safeParse({
      courseId: 12345,
      payment_info: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed session token inside payment_info gracefully", () => {
    const result = orderPayloadSchema.safeParse({
      courseId: "course-abc",
      payment_info: {
        sessionToken: "malformed<>token",
        metadata: undefined,
      },
    });
    expect(result.success).toBe(true);
  });
});

