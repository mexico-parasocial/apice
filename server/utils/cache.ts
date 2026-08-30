import { refreshTokenExpireSeconds } from "./jwt";

/**
 * Session-cache TTL.
 *
 * The Redis `userId → user JSON` cache backs every authenticated request
 * (middleware/auth.ts reads it), so it must never outlive the refresh token
 * it authenticates. Hardcoded 604800s desynced from REFRESH_TOKEN_EXPIRE
 * whenever that env changed.
 */
export const SESSION_CACHE_TTL_SECONDS = refreshTokenExpireSeconds;

/** Course-detail cache — content changes rarely; 7 days. */
export const COURSE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
