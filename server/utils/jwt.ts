import { Response } from "express";
import { redis } from "./redis";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

// Token lifetimes in MINUTES, configurable via env.
const accessTokenExpireMin = parseInt(
  process.env.ACCESS_TOKEN_EXPIRE || "60",
  10
);
const refreshTokenExpireMin = parseInt(
  process.env.REFRESH_TOKEN_EXPIRE || "10080", // 7 days
  10
);

export const accessTokenExpireSeconds = accessTokenExpireMin * 60;
export const refreshTokenExpireSeconds = refreshTokenExpireMin * 60;

const refreshKey = (userId: string, jti: string) =>
  `refresh:${userId}:${jti}`;

/**
 * Signs an access + refresh token pair. The refresh token carries a unique
 * `jti` that is whitelisted in Redis, enabling rotation and revocation.
 */
export async function signTokens(userId: string) {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.ACCESS_TOKEN || "",
    { expiresIn: accessTokenExpireSeconds }
  );

  const jti = randomUUID();
  const refreshToken = jwt.sign(
    { id: userId, jti },
    process.env.REFRESH_TOKEN || "",
    { expiresIn: refreshTokenExpireSeconds }
  );

  await redis.set(refreshKey(userId, jti), "1", "EX", refreshTokenExpireSeconds);

  return { accessToken, refreshToken, jti };
}

/** Returns true if the given refresh token jti is still whitelisted. */
export async function isRefreshTokenValid(
  userId: string,
  jti: string
): Promise<boolean> {
  return (await redis.get(refreshKey(userId, jti))) !== null;
}

export async function revokeRefreshToken(userId: string, jti: string) {
  await redis.del(refreshKey(userId, jti));
}

/** Revokes every refresh token for a user (logout / password change). */
export async function revokeAllRefreshTokens(userId: string) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      `refresh:${userId}:*`,
      "COUNT",
      100
    );
    cursor = next;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}

export const sendToken = async (
  user: any,
  statusCode: number,
  res: Response
) => {
  const { accessToken, refreshToken } = await signTokens(user.id);

  // Cache the session for the lifetime of the refresh token.
  await redis.set(
    user.id,
    JSON.stringify(user) as any,
    "EX",
    refreshTokenExpireSeconds
  );

  res.status(statusCode).json({
    success: true,
    user,
    accessToken,
    refreshToken,
  });
};
