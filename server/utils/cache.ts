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

/**
/**
 * Redis key of the public course view served by GET /get-course/:id.
 *
 * The cached value is the enriched public course (course row + `courseData`
 * without questions + `reviews` with their replies). Any write that changes
 * one of those must `del` this key; never `set` it with anything else.
 *
 * Versioned: v1 entries (keyed by the bare course id) carried reviewer and
 * replier emails. Bumping the prefix means those stale entries are never
 * read again and simply age out under their TTL.
 */
export const courseCacheKey = (courseId: string) => `course:v2:${courseId}`;
