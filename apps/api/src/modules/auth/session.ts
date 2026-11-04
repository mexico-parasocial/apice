import { Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { redis } from "../../platform/redis";
import { prisma } from "../../platform/db";

/**
 * Sessions and tokens — the one place that issues, rotates and revokes them.
 *
 * Model:
 * - A *session* is one signed-in device: `session:{userId}:{sid}` in Redis,
 *   holding the jti of the refresh token currently valid for it.
 * - The access token carries `{ id, sid }`. The auth middleware checks the
 *   session still exists, so logout and revocation take effect immediately,
 *   per device. (Sessions used to be one key per *user*: logging out on the
 *   phone logged out the admin web too, and a role change logged the user
 *   out everywhere.)
 * - `user:{id}` is a plain cache of the user row. Missing it is not an auth
 *   failure; the row is reloaded from Postgres.
 * - Refresh rotates the jti. Parallel requests that present the same
 *   just-rotated refresh token within ROTATION_GRACE_SECONDS get the same new
 *   pair instead of failing. Presenting an older jti after that is treated as
 *   token theft: the whole session is revoked.
 *
 * Transport: mobile sends `access-token` / `refresh-token` headers and gets
 * rotated tokens back on `x-access-token` / `x-refresh-token`. The admin web
 * opts into HttpOnly cookies with `x-auth-mode: cookie` (see readTokens).
 */

const accessTokenExpireMin = parseInt(process.env.ACCESS_TOKEN_EXPIRE || "60", 10);
const refreshTokenExpireMin = parseInt(
  process.env.REFRESH_TOKEN_EXPIRE || "10080", // 7 days
  10
);

export const accessTokenExpireSeconds = accessTokenExpireMin * 60;
export const refreshTokenExpireSeconds = refreshTokenExpireMin * 60;
const ROTATION_GRACE_SECONDS = 30;

export const ACCESS_COOKIE = "apice_at";
export const REFRESH_COOKIE = "apice_rt";
export const AUTH_MODE_HEADER = "x-auth-mode";

const sessionKey = (userId: string, sid: string) => `session:${userId}:${sid}`;
const rotatedKey = (userId: string, sid: string, jti: string) =>
  `session-rotated:${userId}:${sid}:${jti}`;
export const userCacheKey = (userId: string) => `user:${userId}`;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessClaims {
  id: string;
  sid: string;
  exp?: number;
}

function signPair(userId: string, sid: string, jti: string): TokenPair {
  const accessToken = jwt.sign({ id: userId, sid }, process.env.ACCESS_TOKEN || "", {
    expiresIn: accessTokenExpireSeconds,
  });
  const refreshToken = jwt.sign(
    { id: userId, sid, jti },
    process.env.REFRESH_TOKEN || "",
    { expiresIn: refreshTokenExpireSeconds }
  );
  return { accessToken, refreshToken };
}

// ─── User cache ─────────────────────────────────────────────────────

/** Writes the user row to the cache; call after any change to the user. */
export async function cacheUser(user: { id: string }) {
  await redis.set(
    userCacheKey(user.id),
    JSON.stringify(user),
    "EX",
    refreshTokenExpireSeconds
  );
}

export async function forgetUser(userId: string) {
  await redis.del(userCacheKey(userId));
}

/** Cached user, falling back to Postgres. Null if the user no longer exists. */
export async function loadUser(userId: string) {
  const cached = await redis.get(userCacheKey(userId));
  if (cached) return JSON.parse(cached);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  await cacheUser(user);
  return user;
}

// ─── Sessions ───────────────────────────────────────────────────────

/** Starts a session for a new sign-in and returns its tokens. */
export async function createSession(user: { id: string }): Promise<TokenPair & { sid: string }> {
  const sid = randomUUID();
  const jti = randomUUID();
  await redis.set(sessionKey(user.id, sid), jti, "EX", refreshTokenExpireSeconds);
  await cacheUser(user);
  return { sid, ...signPair(user.id, sid, jti) };
}

export async function isSessionActive(userId: string, sid: string) {
  return (await redis.get(sessionKey(userId, sid))) !== null;
}

export async function revokeSession(userId: string, sid: string) {
  await redis.del(sessionKey(userId, sid));
}

/** Ends every session of a user (password change, account deletion). */
export async function revokeAllSessions(userId: string) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `session:${userId}:*`, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
}

export type RotateResult =
  | { ok: true; userId: string; sid: string; tokens: TokenPair }
  | { ok: false; reason: string };

/** Exchanges a refresh token for a new pair (see the model above). */
export async function rotateSession(refreshToken: string): Promise<RotateResult> {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN as string) as JwtPayload;
  } catch {
    return { ok: false, reason: "Could not refresh token" };
  }
  const { id: userId, sid, jti } = decoded as { id?: string; sid?: string; jti?: string };
  if (!userId || !sid || !jti) return { ok: false, reason: "Could not refresh token" };

  const current = await redis.get(sessionKey(userId, sid));
  if (current === null) {
    return { ok: false, reason: "Session expired, please login again" };
  }

  if (current !== jti) {
    // Lost a race with a parallel refresh? Hand back the pair it issued.
    const recent = await redis.get(rotatedKey(userId, sid, jti));
    if (recent) {
      return { ok: true, userId, sid, tokens: JSON.parse(recent) };
    }
    // An old refresh token replayed: assume theft and end the session.
    await revokeSession(userId, sid);
    return { ok: false, reason: "Session expired, please login again" };
  }

  const nextJti = randomUUID();
  const tokens = signPair(userId, sid, nextJti);
  await redis.set(sessionKey(userId, sid), nextJti, "EX", refreshTokenExpireSeconds);
  await redis.set(
    rotatedKey(userId, sid, jti),
    JSON.stringify(tokens),
    "EX",
    ROTATION_GRACE_SECONDS
  );
  return { ok: true, userId, sid, tokens };
}

// ─── Transport ──────────────────────────────────────────────────────

/** True when the caller opted into HttpOnly-cookie transport (admin web). */
export function isCookieMode(req: Request) {
  return req.headers[AUTH_MODE_HEADER] === "cookie";
}

/**
 * Reads tokens from the request.
 *
 * Cookies are honoured only together with the `x-auth-mode: cookie` header.
 * A custom header can't be set by a cross-site form or image, and makes a
 * cross-origin fetch preflight against the CORS allowlist, so the cookie
 * transport isn't open to CSRF.
 */
export function readTokens(req: Request): { access?: string; refresh?: string } {
  const header = (name: string) => {
    const v = req.headers[name];
    return typeof v === "string" && v ? v : undefined;
  };
  if (isCookieMode(req)) {
    return {
      access: req.cookies?.[ACCESS_COOKIE] || header("access-token"),
      refresh: req.cookies?.[REFRESH_COOKIE] || header("refresh-token"),
    };
  }
  return { access: header("access-token"), refresh: header("refresh-token") };
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: refreshTokenExpireSeconds * 1000,
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

/**
 * Delivers a token pair. Cookie mode: HttpOnly cookies, nothing readable by
 * page scripts. Header mode: the caller puts the pair in the body or on
 * x-*-token headers (see the return value).
 */
export function deliverTokens(req: Request, res: Response, tokens: TokenPair) {
  if (isCookieMode(req)) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOptions());
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions());
    return {};
  }
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export function clearTokenCookies(res: Response) {
  const { maxAge: _m, ...opts } = cookieOptions();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}

/**
 * Signs a user in: new session, cached user, tokens delivered for the
 * caller's transport. Every login path (password, Bluesky OAuth, iM8) ends
 * here, so they can't drift apart again.
 */
export async function signIn(
  req: Request,
  res: Response,
  user: { id: string },
  statusCode = 200,
  extra: Record<string, unknown> = {}
) {
  const tokens = await createSession(user);
  const body = deliverTokens(req, res, tokens);
  res.status(statusCode).json({ success: true, user, ...body, ...extra });
}
