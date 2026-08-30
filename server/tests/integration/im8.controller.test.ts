// Set required env vars before env.ts is imported by the controller under test.
process.env.ACCESS_TOKEN = "dev-access-token";
process.env.REFRESH_TOKEN = "dev-refresh-token";

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(() => Promise.resolve("hashed-password")),
  },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(() => "signed-token"),
    verify: vi.fn(() => ({ id: "existing-user-id" })),
  },
}));

vi.mock("../../utils/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../utils/redis", () => ({
  redis: {
    set: vi.fn(() => Promise.resolve("OK")),
    get: vi.fn(),
    del: vi.fn(() => Promise.resolve(1)),
  },
}));

vi.mock("../../utils/env", () => ({
  env: {
    IM8_IDENTITY_MANAGER_URL: "http://localhost:8787",
  },
}));

import axios from "axios";
import { prisma } from "../../utils/db";
import { redis } from "../../utils/redis";
import {
  startIM8Login,
  completeIM8Login,
} from "../../controllers/im8.controller";

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

function mockReqResNext(body: any) {
  const req = { body } as any;
  const res: any = { json: vi.fn() };
  res.status = vi.fn().mockReturnValue(res);
  const next = vi.fn();
  return { req, res, next };
}

describe("iM8 BFF controllers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startIM8Login", () => {
    it("returns the OAuth URL and stores the pending state", async () => {
      const { req, res, next } = mockReqResNext({
        identifier: "testuser.bsky.social",
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          attempt: {
            sessionId: "im8-session-1",
            did: "did:plc:test",
            handle: "testuser.bsky.social",
          },
          tokens: { accessToken: "im8-access-token", expiresIn: 900 },
          oauthUrl:
            "https://bsky.social/oauth/authorize?client_id=m8.broker&state=state-123",
        },
      });

      await startIM8Login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          state: "state-123",
          sessionId: "im8-session-1",
          oauthUrl: expect.stringContaining("bsky.social"),
          localOnly: false,
          callbackUrl: "http://localhost:8787/v1/sessions/oauth/callback",
        })
      );
      expect(redis.set).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("returns a local-only session when iM8 cannot initialize OAuth", async () => {
      const { req, res, next } = mockReqResNext({
        identifier: "testuser.example.com",
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          attempt: {
            sessionId: "im8-session-1",
            did: "did:plc:test",
            handle: "testuser.example.com",
          },
          tokens: { accessToken: "im8-access-token", expiresIn: 900 },
          oauthUrl: null,
        },
      });

      await startIM8Login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          oauthUrl: null,
          localOnly: true,
        })
      );
      expect(redis.set).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("completeIM8Login", () => {
    it("creates a new Ápice user and returns tokens + iM8 session", async () => {
      (redis.get as any).mockResolvedValue(
        JSON.stringify({
          iM8AccessToken: "im8-access-token",
          sessionId: "im8-session-1",
          did: "did:plc:test",
          handle: "testuser.bsky.social",
          localOnly: false,
        })
      );

      mockedAxios.get.mockResolvedValueOnce({ data: {} }); // callback
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          session: {
            did: "did:plc:test",
            handle: "testuser.bsky.social",
            displayName: "Test User",
          },
        },
      });

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: "new-user-id",
        email: "testuser.bsky.social@im8.apice.local",
        name: "Test User",
        role: "user",
      });

      const { req, res, next } = mockReqResNext({
        state: "state-123",
        callbackUrl:
          "http://localhost:8787/v1/sessions/oauth/callback?code=abc&state=state-123",
      });

      await completeIM8Login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          accessToken: "signed-token",
          refreshToken: "signed-token",
          iM8Session: expect.objectContaining({
            did: "did:plc:test",
            handle: "testuser.bsky.social",
          }),
        })
      );
      expect(redis.del).toHaveBeenCalled();
    });

    it("completes a local-only session without forwarding an OAuth callback", async () => {
      (redis.get as any).mockResolvedValue(
        JSON.stringify({
          iM8AccessToken: "im8-access-token",
          sessionId: "im8-session-1",
          did: "did:plc:test",
          handle: "testuser.bsky.social",
          localOnly: true,
        })
      );

      mockedAxios.get.mockResolvedValue({
        data: {
          session: {
            did: "did:plc:test",
            handle: "testuser.bsky.social",
            displayName: "Test User",
          },
        },
      });

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: "local-user-id",
        email: "testuser.bsky.social@im8.apice.local",
        name: "Test User",
        role: "user",
      });

      const { req, res, next } = mockReqResNext({
        state: "state-local",
        callbackUrl: "http://localhost:8787/v1/sessions/oauth/callback",
      });

      await completeIM8Login(req, res, next);

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "http://localhost:8787/v1/sessions/me",
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it("links the DID to an existing user when apiceAccessToken is provided", async () => {
      (redis.get as any).mockResolvedValue(
        JSON.stringify({
          iM8AccessToken: "im8-access-token",
          sessionId: "im8-session-1",
          did: "did:plc:test",
          handle: "testuser.bsky.social",
          localOnly: false,
        })
      );

      mockedAxios.get.mockResolvedValueOnce({ data: {} });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          session: {
            did: "did:plc:test",
            handle: "testuser.bsky.social",
            displayName: "Test User",
          },
        },
      });

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.update as any).mockResolvedValue({
        id: "existing-user-id",
        email: "existing@example.com",
        name: "Existing User",
        role: "user",
      });

      const { req, res, next } = mockReqResNext({
        state: "state-123",
        callbackUrl:
          "http://localhost:8787/v1/sessions/oauth/callback?code=abc&state=state-123",
        apiceAccessToken: "valid-apice-token",
      });

      await completeIM8Login(req, res, next);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-user-id" },
          data: expect.objectContaining({ blueskyDid: "did:plc:test" }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 400 when the pending state is missing/expired", async () => {
      (redis.get as any).mockResolvedValue(null);

      const { req, res, next } = mockReqResNext({
        state: "state-123",
        callbackUrl:
          "http://localhost:8787/v1/sessions/oauth/callback?code=abc&state=state-123",
      });

      await completeIM8Login(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });
});
