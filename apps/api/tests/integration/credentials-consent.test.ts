import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../src/platform/db", () => ({
  prisma: { user: { update: vi.fn() } },
}));
vi.mock("../../src/platform/redis", () => ({
  redis: { set: vi.fn(() => Promise.resolve("OK")), get: vi.fn(), del: vi.fn() },
}));
vi.mock("../../src/platform/logger", () => {
  const l = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: l, log: () => l };
});
vi.mock("../../src/modules/credentials/credentials.service", () => ({
  enqueueAllEarnedCredentials: vi.fn(() => Promise.resolve(3)),
  cancelPendingCredentials: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../src/http/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", role: "user" };
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import userRouter from "../../src/modules/users/users.routes";
import { ErrorMiddleware } from "../../src/http/error";
import { prisma } from "../../src/platform/db";
import {
  cancelPendingCredentials,
  enqueueAllEarnedCredentials,
} from "../../src/modules/credentials/credentials.service";

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
