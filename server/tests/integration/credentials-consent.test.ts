import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/db", () => ({
  prisma: { user: { update: vi.fn() } },
}));
vi.mock("../../utils/redis", () => ({
  redis: { set: vi.fn(() => Promise.resolve("OK")), get: vi.fn(), del: vi.fn() },
}));
vi.mock("../../utils/logger", () => {
  const l = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: l, log: () => l };
});
vi.mock("../../services/credentials.service", () => ({
  enqueueAllEarnedCredentials: vi.fn(() => Promise.resolve(3)),
  cancelPendingCredentials: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../middleware/auth", () => ({
  isAutheticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", role: "user" };
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import userRouter from "../../routes/user.route";
import { ErrorMiddleware } from "../../middleware/error";
import { prisma } from "../../utils/db";
import {
  cancelPendingCredentials,
  enqueueAllEarnedCredentials,
} from "../../services/credentials.service";

const app = express();
app.use(express.json());
app.use("/api/v1", userRouter);
app.use(ErrorMiddleware);

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.user.update as any).mockImplementation(({ data }: any) =>
    Promise.resolve({ id: "user-1", ...data })
  );
});

describe("PUT /api/v1/me/credentials-consent", () => {
  it("opting in records the time and queues earned credentials", async () => {
    const res = await request(app)
      .put("/api/v1/me/credentials-consent")
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(3);
    const data = (prisma.user.update as any).mock.calls[0][0].data;
    expect(data.credentialsConsent).toBe(true);
    expect(data.credentialsConsentAt).toBeTruthy();
    expect(enqueueAllEarnedCredentials).toHaveBeenCalledWith("user-1");
  });

  it("opting out cancels anything still queued", async () => {
    const res = await request(app)
      .put("/api/v1/me/credentials-consent")
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(cancelPendingCredentials).toHaveBeenCalledWith("user-1");
    expect(enqueueAllEarnedCredentials).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean", async () => {
    const res = await request(app)
      .put("/api/v1/me/credentials-consent")
      .send({ enabled: "yes" });
    expect(res.status).toBe(400);
  });
});
