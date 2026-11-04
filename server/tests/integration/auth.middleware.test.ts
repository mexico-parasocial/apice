// Real jsonwebtoken, real middleware, real error handler; only Redis and
// Prisma are faked. The point is the status code a client actually sees.
process.env.ACCESS_TOKEN = "test-access-secret";
process.env.REFRESH_TOKEN = "test-refresh-secret";

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("../../utils/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) if (store.delete(key)) removed++;
      return removed;
    }),
  },
}));

vi.mock("../../utils/db", () => ({ prisma: {} }));

import { isAutheticated, authorizeRoles } from "../../middleware/auth";
import { ErrorMiddleware } from "../../middleware/error";
import { signTokens } from "../../utils/jwt";

const USER = { id: "user-1", name: "Ana", email: "ana@example.org", role: "user" };
const ADMIN = { ...USER, id: "admin-1", role: "admin" };

function buildApp() {
  const app = express();
  app.get("/private", isAutheticated, (req, res) => {
    res.json({ id: req.user?.id });
  });
  app.get("/admin", isAutheticated, authorizeRoles("admin"), (_req, res) => {
    res.json({ ok: true });
  });
  // Exercises the JsonWebTokenError / TokenExpiredError mapping directly.
  app.get("/throws-jwt", (_req, _res, next) => {
    try {
      jwt.verify("not.a.jwt", "whatever");
    } catch (err) {
      next(err);
    }
  });
  app.use(ErrorMiddleware);
  return app;
}

function accessTokenFor(id: string, opts: jwt.SignOptions = { expiresIn: 3600 }) {
  return jwt.sign({ id }, process.env.ACCESS_TOKEN as string, opts);
}

/** An access token whose exp is already in the past. */
function expiredAccessTokenFor(id: string) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ id, iat: now - 7200, exp: now - 60 }, process.env.ACCESS_TOKEN as string);
}

function startSession(user: { id: string }) {
  store.set(user.id, JSON.stringify(user));
}

describe("isAutheticated status codes", () => {
  const app = buildApp();

  beforeEach(() => {
    store.clear();
  });

  it("401s when no access token is sent", async () => {
    const res = await request(app).get("/private");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("401s when the access token has a bad signature", async () => {
    startSession(USER);
    const forged = jwt.sign({ id: USER.id }, "some-other-secret", { expiresIn: 3600 });
    const res = await request(app).get("/private").set("access-token", forged);
    expect(res.status).toBe(401);
  });

  it("401s when the access token is not a JWT at all", async () => {
    const res = await request(app).get("/private").set("access-token", "garbage");
    expect(res.status).toBe(401);
  });

  it("401s when the access token carries no user id", async () => {
    const token = jwt.sign({ sub: "nobody" }, process.env.ACCESS_TOKEN as string, {
      expiresIn: 3600,
    });
    const res = await request(app).get("/private").set("access-token", token);
    expect(res.status).toBe(401);
  });

  it("401s when the token is valid but there is no session in Redis", async () => {
    const res = await request(app)
      .get("/private")
      .set("access-token", accessTokenFor(USER.id));
    expect(res.status).toBe(401);
  });

  it("lets a valid token with a live session through", async () => {
    startSession(USER);
    const res = await request(app)
      .get("/private")
      .set("access-token", accessTokenFor(USER.id));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(USER.id);
  });
});

describe("authorizeRoles", () => {
  const app = buildApp();

  beforeEach(() => {
    store.clear();
  });

  it("403s an authenticated user without the role", async () => {
    startSession(USER);
    const res = await request(app)
      .get("/admin")
      .set("access-token", accessTokenFor(USER.id));
    expect(res.status).toBe(403);
  });

  it("lets an admin through", async () => {
    startSession(ADMIN);
    const res = await request(app)
      .get("/admin")
      .set("access-token", accessTokenFor(ADMIN.id));
    expect(res.status).toBe(200);
  });

  it("401s (not 403s) when the caller is not authenticated at all", async () => {
    const res = await request(app).get("/admin");
    expect(res.status).toBe(401);
  });
});

describe("expired access token → refresh flow", () => {
  const app = buildApp();

  beforeEach(() => {
    store.clear();
  });

  it("401s when no refresh token is sent", async () => {
    startSession(USER);
    const res = await request(app)
      .get("/private")
      .set("access-token", expiredAccessTokenFor(USER.id));
    expect(res.status).toBe(401);
  });

  it("401s when the refresh token has a bad signature", async () => {
    startSession(USER);
    const forged = jwt.sign({ id: USER.id, jti: "x" }, "some-other-secret");
    const res = await request(app)
      .get("/private")
      .set("access-token", expiredAccessTokenFor(USER.id))
      .set("refresh-token", forged);
    expect(res.status).toBe(401);
  });

  it("401s when the refresh token is valid but the session is gone", async () => {
    const { refreshToken } = await signTokens(USER.id);
    const res = await request(app)
      .get("/private")
      .set("access-token", expiredAccessTokenFor(USER.id))
      .set("refresh-token", refreshToken);
    expect(res.status).toBe(401);
  });

  it("rotates the pair and lets the request through with a whitelisted refresh token", async () => {
    startSession(USER);
    const { refreshToken } = await signTokens(USER.id);
    const res = await request(app)
      .get("/private")
      .set("access-token", expiredAccessTokenFor(USER.id))
      .set("refresh-token", refreshToken);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(USER.id);
    expect(res.headers["x-access-token"]).toBeTruthy();
    expect(res.headers["x-refresh-token"]).toBeTruthy();
    expect(res.headers["x-refresh-token"]).not.toBe(refreshToken);
  });

  it("401s when a refresh token is reused after rotation (revoked)", async () => {
    startSession(USER);
    const { refreshToken } = await signTokens(USER.id);
    const expired = expiredAccessTokenFor(USER.id);

    const first = await request(app)
      .get("/private")
      .set("access-token", expired)
      .set("refresh-token", refreshToken);
    expect(first.status).toBe(200);

    const replay = await request(app)
      .get("/private")
      .set("access-token", expired)
      .set("refresh-token", refreshToken);
    expect(replay.status).toBe(401);
  });

  it("the rotated pair works on the next request", async () => {
    startSession(USER);
    const { refreshToken } = await signTokens(USER.id);
    const first = await request(app)
      .get("/private")
      .set("access-token", expiredAccessTokenFor(USER.id))
      .set("refresh-token", refreshToken);

    const next = await request(app)
      .get("/private")
      .set("access-token", first.headers["x-access-token"])
      .set("refresh-token", first.headers["x-refresh-token"]);
    expect(next.status).toBe(200);
  });
});

describe("ErrorMiddleware JWT mapping", () => {
  it("maps a JsonWebTokenError that reaches it to 401", async () => {
    const res = await request(buildApp()).get("/throws-jwt");
    expect(res.status).toBe(401);
  });
});
