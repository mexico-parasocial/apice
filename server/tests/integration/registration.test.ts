import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";

const store = new Map<string, string>();

vi.mock("../../utils/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../../utils/redis", () => ({
  redis: {
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    del: vi.fn((k: string) => {
      store.delete(k);
      return Promise.resolve(1);
    }),
  },
}));

const sent: { email: string; data: any }[] = [];
vi.mock("../../utils/sendMail", () => ({
  default: vi.fn((opts: any) => {
    sent.push(opts);
    return Promise.resolve();
  }),
}));

vi.mock("../../utils/logger", () => {
  const l = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: l, log: () => l };
});

import userRouter from "../../routes/user.route";
import { ErrorMiddleware } from "../../middleware/error";
import { prisma } from "../../utils/db";

const app = express();
app.use(express.json());
app.use("/api/v1", userRouter);
app.use(ErrorMiddleware);

const mocked = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const body = { name: "Ana", email: "ana@example.com", password: "s3cret-pass" };

async function register() {
  const res = await request(app).post("/api/v1/registration").send(body);
  return { res, code: sent[sent.length - 1]?.data.activationCode as string };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  sent.length = 0;
  mocked(prisma.user.findUnique).mockResolvedValue(null);
  mocked(prisma.user.create).mockResolvedValue({ id: "u1" });
});

describe("POST /api/v1/registration", () => {
  it("returns an opaque token that does not contain the password", async () => {
    const { res, code } = await register();

    expect(res.status).toBe(201);
    const token: string = res.body.activationToken;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(res.body)).not.toContain(body.password);
    expect(code).toMatch(/^\d{6}$/);

    // What is stored server-side holds a hash, never the plaintext.
    const stored = [...store.values()].join("");
    expect(stored).not.toContain(body.password);
    expect(stored).not.toContain(code);
  });

  it("rejects an email that already has an account", async () => {
    mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" });
    const { res } = await register();
    expect(res.status).toBe(409);
  });
});

describe("POST /api/v1/activate-user", () => {
  it("creates the user with the bcrypt hash on the right code, once", async () => {
    const { res, code } = await register();
    const token = res.body.activationToken;

    const ok = await request(app)
      .post("/api/v1/activate-user")
      .send({ activation_token: token, activation_code: code });
    expect(ok.status).toBe(201);

    const created = mocked(prisma.user.create).mock.calls[0][0].data;
    expect(created.email).toBe(body.email);
    expect(await bcrypt.compare(body.password, created.password)).toBe(true);

    // Replaying the same token fails: it was consumed.
    const replay = await request(app)
      .post("/api/v1/activate-user")
      .send({ activation_token: token, activation_code: code });
    expect(replay.status).toBe(400);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("burns the registration after five wrong codes", async () => {
    const { res, code } = await register();
    const token = res.body.activationToken;
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post("/api/v1/activate-user")
        .send({ activation_token: token, activation_code: wrong });
      expect(r.status).toBe(400);
    }

    const late = await request(app)
      .post("/api/v1/activate-user")
      .send({ activation_token: token, activation_code: code });
    expect(late.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
