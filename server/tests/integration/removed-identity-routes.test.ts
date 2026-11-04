// Two endpoints used to accept an identity claim from the request body with
// no proof behind it:
//
//   POST /api/v1/social-auth      { email } in, an access + refresh token pair
//                                 for that account out. An admin's email got
//                                 admin tokens; an unknown one created a user.
//   POST /api/v1/connect-bluesky  { did, handle } written onto the caller's
//                                 account. That passed the verified-Bluesky
//                                 gate on lesson playback, and squatted the
//                                 real owner's DID so their own Bluesky login
//                                 landed in the squatter's account.
//
// Both are gone. Verified Bluesky linking goes through completeIM8Login.
//
// This runs against the real app with every router mounted, so it fails if
// either path comes back on any router, not only user.route.ts.

const ACCESS_SECRET = vi.hoisted(() => {
  // loadEnv() runs when app.ts is imported and exits the process if these
  // are missing.
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("ACCESS_TOKEN", "test-access-token-secret");
  vi.stubEnv("REFRESH_TOKEN", "test-refresh-token-secret");
  vi.stubEnv("ACTIVATION_SECRET", "test-activation-secret");
  // pino-http logs every request; keep the test output readable.
  vi.stubEnv("LOG_LEVEL", "silent");
  return "test-access-token-secret";
});

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../utils/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  default: vi.fn(),
}));

vi.mock("../../utils/redis", () => ({
  redis: {
    set: vi.fn(() => Promise.resolve("OK")),
    get: vi.fn(),
    del: vi.fn(() => Promise.resolve(1)),
  },
}));

// notification.controller schedules a daily job at import time.
vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

import { app } from "../../app";
import { prisma } from "../../utils/db";
import { redis } from "../../utils/redis";

const adminUser = {
  id: "admin-user-id",
  email: "admin@apice.example",
  name: "Admin",
  role: "admin",
};

const signedInUser = {
  id: "attacker-user-id",
  email: "attacker@apice.example",
  name: "Attacker",
  role: "user",
};

describe("removed identity-claim routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Give the old handlers everything they needed to succeed, so a 404
    // can only come from the route being gone.
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue(adminUser);
    (prisma.user.update as any).mockResolvedValue(signedInUser);
    (redis.get as any).mockResolvedValue(JSON.stringify(signedInUser));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("POST /api/v1/social-auth", () => {
    it("returns 404 and issues no tokens for an existing admin's email", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(adminUser);

      const res = await request(app)
        .post("/api/v1/social-auth")
        .send({ email: adminUser.email, name: "Anyone" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: "Route /api/v1/social-auth not found",
      });
      expect(res.body).not.toHaveProperty("accessToken");
      expect(res.body).not.toHaveProperty("refreshToken");
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("returns 404 and creates no account for an unknown email", async () => {
      const res = await request(app)
        .post("/api/v1/social-auth")
        .send({ email: "new@apice.example", name: "New" });

      expect(res.status).toBe(404);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/connect-bluesky", () => {
    it("returns 404 for a signed-in user and links no DID", async () => {
      const accessToken = jwt.sign({ id: signedInUser.id }, ACCESS_SECRET, {
        expiresIn: "5m",
      });

      const res = await request(app)
        .post("/api/v1/connect-bluesky")
        .set("access-token", accessToken)
        .send({ did: "did:plc:someoneelse", handle: "someoneelse.bsky.social" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: "Route /api/v1/connect-bluesky not found",
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("returns 404 without a token", async () => {
      const res = await request(app)
        .post("/api/v1/connect-bluesky")
        .send({ did: "did:plc:someoneelse", handle: "someoneelse.bsky.social" });

      expect(res.status).toBe(404);
    });
  });

  // Control: the user router is still mounted, so the 404s above come from
  // the missing routes and not from an app that failed to wire up.
  it("still serves the rest of the user router", async () => {
    const res = await request(app).post("/api/v1/login").send({});

    expect(res.status).toBe(400);
  });
});
