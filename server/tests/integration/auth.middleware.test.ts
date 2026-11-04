// Real jsonwebtoken, real middleware, real session helpers, real error
// handler; only Redis and Prisma are faked. The point is the status code a
// client actually sees.
process.env.ACCESS_TOKEN = "test-access-secret";
process.env.REFRESH_TOKEN = "test-refresh-secret";

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";

const { store, users } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  users: new Map<string, any>(),
}));

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
    scan: vi.fn(async (_cursor: string, _m: string, pattern: string) => {
      const prefix = pattern.replace(/\*$/, "");
      return ["0", [...store.keys()].filter((k) => k.startsWith(prefix))];
    }),
  },
}));

vi.mock("../../utils/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
  },
}));

import { isAutheticated, authorizeRoles } from "../../middleware/auth";
import { ErrorMiddleware } from "../../middleware/error";
import {
  createSession,
  revokeAllSessions,
  revokeSession,
  userCacheKey,
} from "../../utils/jwt";

const USER = { id: "user-1", name: "Ana", email: "ana@example.org", role: "user" };
const ADMIN = { ...USER, id: "admin-1", role: "admin" };

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.get("/private", isAutheticated, (req, res) => {
    res.json({ id: req.user?.id, role: req.user?.role, sid: req.sessionId });
  });
  app.get("/admin", isAutheticated, authorizeRoles("admin"), (_req, res) => {
    res.json({ ok: true });
  });
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

/** An access token for an existing session, with exp already in the past. */
function expire(accessToken: string) {
  const { id, sid } = jwt.decode(accessToken) as any;
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ id, sid, iat: now - 7200, exp: now - 60 }, process.env.ACCESS_TOKEN as string);
}

const app = buildApp();

beforeEach(() => {
  store.clear();
  users.clear();
  users.set(USER.id, USER);
  users.set(ADMIN.id, ADMIN);
});

describe("isAutheticated", () => {
  it("401s when no access token is sent", async () => {
    expect((await request(app).get("/private")).status).toBe(401);
  });

  it("401s when the access token has a bad signature", async () => {
    const forged = jwt.sign({ id: USER.id, sid: "s" }, "some-other-secret");
    const res = await request(app).get("/private").set("access-token", forged);
    expect(res.status).toBe(401);
  });

  it("401s when the access token is not a JWT at all", async () => {
    const res = await request(app).get("/private").set("access-token", "nope");
    expect(res.status).toBe(401);
  });

  it("401s a token without a session id (pre-session tokens)", async () => {
    const legacy = jwt.sign({ id: USER.id }, process.env.ACCESS_TOKEN as string);
    const res = await request(app).get("/private").set("access-token", legacy);
    expect(res.status).toBe(401);
  });

  it("lets a token for a live session through", async () => {
    const { accessToken, sid } = await createSession(USER);
    const res = await request(app).get("/private").set("access-token", accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: USER.id, role: "user", sid });
  });

  it("reloads the user from Postgres when the cache is cold", async () => {
    const { accessToken } = await createSession(USER);
    store.delete(userCacheKey(USER.id));
    const res = await request(app).get("/private").set("access-token", accessToken);
    expect(res.status).toBe(200);
    expect(store.has(userCacheKey(USER.id))).toBe(true);
  });

  it("401s once the user no longer exists", async () => {
    const { accessToken } = await createSession(USER);
    store.delete(userCacheKey(USER.id));
    users.delete(USER.id);
    const res = await request(app).get("/private").set("access-token", accessToken);
    expect(res.status).toBe(401);
  });
});

describe("sessions are per device", () => {
  it("revoking one session leaves the others signed in", async () => {
    const phone = await createSession(USER);
    const web = await createSession(USER);

    await revokeSession(USER.id, phone.sid);

    expect((await request(app).get("/private").set("access-token", phone.accessToken)).status).toBe(401);
    expect((await request(app).get("/private").set("access-token", web.accessToken)).status).toBe(200);
  });

  it("revokeAllSessions signs out every device", async () => {
    const a = await createSession(USER);
    const b = await createSession(USER);
    await revokeAllSessions(USER.id);
    for (const s of [a, b]) {
      expect((await request(app).get("/private").set("access-token", s.accessToken)).status).toBe(401);
    }
  });

  it("a role change applies without logging the user out", async () => {
    const { accessToken } = await createSession(USER);
    // What updateUserRoleService does: rewrite the cache, keep sessions.
    store.set(userCacheKey(USER.id), JSON.stringify({ ...USER, role: "admin" }));
    const res = await request(app).get("/admin").set("access-token", accessToken);
    expect(res.status).toBe(200);
  });
});

describe("authorizeRoles", () => {
  it("403s an authenticated user without the role", async () => {
    const { accessToken } = await createSession(USER);
    expect((await request(app).get("/admin").set("access-token", accessToken)).status).toBe(403);
  });

  it("lets an admin through", async () => {
    const { accessToken } = await createSession(ADMIN);
    expect((await request(app).get("/admin").set("access-token", accessToken)).status).toBe(200);
  });

  it("401s (not 403s) when the caller is not authenticated at all", async () => {
    expect((await request(app).get("/admin")).status).toBe(401);
  });
});

describe("expired access token → refresh flow", () => {
  it("401s when no refresh token is sent", async () => {
    const { accessToken } = await createSession(USER);
    const res = await request(app).get("/private").set("access-token", expire(accessToken));
    expect(res.status).toBe(401);
  });

  it("401s when the refresh token has a bad signature", async () => {
    const { accessToken, sid } = await createSession(USER);
    const forged = jwt.sign({ id: USER.id, sid, jti: "x" }, "some-other-secret");
    const res = await request(app)
      .get("/private")
      .set("access-token", expire(accessToken))
      .set("refresh-token", forged);
    expect(res.status).toBe(401);
  });

  it("401s when the session was revoked", async () => {
    const { accessToken, refreshToken, sid } = await createSession(USER);
    await revokeSession(USER.id, sid);
    const res = await request(app)
      .get("/private")
      .set("access-token", expire(accessToken))
      .set("refresh-token", refreshToken);
    expect(res.status).toBe(401);
  });

  it("rotates the pair and lets the request through", async () => {
    const { accessToken, refreshToken } = await createSession(USER);
    const res = await request(app)
      .get("/private")
      .set("access-token", expire(accessToken))
      .set("refresh-token", refreshToken);
    expect(res.status).toBe(200);
    expect(res.headers["x-access-token"]).toBeTruthy();
    expect(res.headers["x-refresh-token"]).toBeTruthy();
    expect(res.headers["x-refresh-token"]).not.toBe(refreshToken);

    // The rotated pair works on the next request.
    const next = await request(app)
      .get("/private")
      .set("access-token", res.headers["x-access-token"])
      .set("refresh-token", res.headers["x-refresh-token"]);
    expect(next.status).toBe(200);
  });

  it("parallel requests with the same refresh token all succeed with one new pair", async () => {
    const { accessToken, refreshToken } = await createSession(USER);
    const expired = expire(accessToken);
    const send = () =>
      request(app).get("/private").set("access-token", expired).set("refresh-token", refreshToken);

    const [a, b, c] = await Promise.all([send(), send(), send()]);

    for (const r of [a, b, c]) expect(r.status).toBe(200);
    expect(new Set([a, b, c].map((r) => r.headers["x-refresh-token"])).size).toBe(1);
  });

  it("replaying a refresh token after the grace window revokes the session", async () => {
    const { accessToken, refreshToken } = await createSession(USER);
    const expired = expire(accessToken);
    const first = await request(app)
      .get("/private")
      .set("access-token", expired)
      .set("refresh-token", refreshToken);
    expect(first.status).toBe(200);

    // Grace window over.
    for (const key of [...store.keys()]) if (key.startsWith("session-rotated:")) store.delete(key);

    const replay = await request(app)
      .get("/private")
      .set("access-token", expired)
      .set("refresh-token", refreshToken);
    expect(replay.status).toBe(401);

    // Theft assumed: even the legitimately rotated pair is dead now.
    const victim = await request(app)
      .get("/private")
      .set("access-token", first.headers["x-access-token"]);
    expect(victim.status).toBe(401);
  });
});

describe("cookie transport (admin web)", () => {
  const cookies = (t: { accessToken: string; refreshToken: string }) =>
    `apice_at=${t.accessToken}; apice_rt=${t.refreshToken}`;

  it("ignores auth cookies without the x-auth-mode header (CSRF guard)", async () => {
    const session = await createSession(USER);
    const res = await request(app).get("/private").set("Cookie", cookies(session));
    expect(res.status).toBe(401);
  });

  it("accepts auth cookies with x-auth-mode: cookie", async () => {
    const session = await createSession(USER);
    const res = await request(app)
      .get("/private")
      .set("x-auth-mode", "cookie")
      .set("Cookie", cookies(session));
    expect(res.status).toBe(200);
  });

  it("rotates into HttpOnly cookies, never readable headers", async () => {
    const session = await createSession(USER);
    const res = await request(app)
      .get("/private")
      .set("x-auth-mode", "cookie")
      .set("Cookie", cookies({ ...session, accessToken: expire(session.accessToken) }));
    expect(res.status).toBe(200);
    expect(res.headers["x-access-token"]).toBeUndefined();
    const set = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(set.some((c) => c.startsWith("apice_at=") && /HttpOnly/i.test(c))).toBe(true);
    expect(set.some((c) => c.startsWith("apice_rt=") && /HttpOnly/i.test(c))).toBe(true);
  });
});

describe("ErrorMiddleware JWT mapping", () => {
  it("maps a JsonWebTokenError that reaches it to 401", async () => {
    const res = await request(app).get("/throws-jwt");
    expect(res.status).toBe(401);
  });
});
