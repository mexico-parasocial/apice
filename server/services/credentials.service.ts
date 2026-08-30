import { createHash } from "crypto";
import { AtpAgent } from "@atproto/api";
import { prisma } from "../utils/db";
import { restoreSession } from "./atprotoOAuth.service";

/**
 * Portable credential writer (Workstream D2).
 *
 * When a learner completes a lesson/course, we publish an `app.civic.progress`
 * record into the LEARNER'S OWN repo on their PDS, using the OAuth session
 * they granted at login. The record is self-attested by construction
 * (learnerDid == repo owner), which is the invariant the standard requires.
 *
 * All functions are non-blocking by design: failures are logged, never thrown
 * into the request path. Local Postgres progress remains the UX source of
 * truth; PDS records are the portability layer.
 */

const COLLECTION = "app.civic.progress";

interface LessonRef {
  uri: string;
  cid: string;
}

/** Deterministic rkey → idempotent re-publishes (putRecord upserts). */
function progressRkey(courseUri: string, lessonUri?: string): string {
  return createHash("sha256")
    .update(`${courseUri}|${lessonUri ?? "course"}`)
    .digest("hex")
    .slice(0, 20);
}

interface PublishContext {
  did: string;
  agent: AtpAgent;
  course: {
    atprotoUri: string;
    atprotoCid: string;
    atprotoLessonRefs: Record<string, LessonRef> | null;
  };
}

async function loadPublishContext(
  userId: string,
  courseId: string
): Promise<PublishContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { blueskyDid: true },
  });
  if (!user?.blueskyDid) return null;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      atprotoUri: true,
      atprotoCid: true,
      atprotoLessonRefs: true,
    },
  });
  if (!course?.atprotoUri || !course.atprotoCid) return null;

  let session;
  try {
    session = await restoreSession(user.blueskyDid);
  } catch {
    return null; // no OAuth session with write scope for this learner
  }

  // Self-attestation invariant: the repo we write to must be the learner's.
  if (session.sub !== user.blueskyDid) return null;

  return {
    did: user.blueskyDid,
    agent: new AtpAgent(session as any),
    course: {
      atprotoUri: course.atprotoUri,
      atprotoCid: course.atprotoCid,
      atprotoLessonRefs:
        (course.atprotoLessonRefs as Record<string, LessonRef> | null) ?? null,
    },
  };
}

/** Publishes one lesson-level progress record to the learner's repo. */
export async function publishLessonCredential(
  userId: string,
  courseId: string,
  lessonId: string,
  preloaded?: PublishContext
): Promise<boolean> {
  try {
    const ctx = preloaded ?? (await loadPublishContext(userId, courseId));
    if (!ctx) return false;

    const lessonRef = ctx.course.atprotoLessonRefs?.[lessonId];
    if (!lessonRef) return false;

    const courseRef = {
      uri: ctx.course.atprotoUri,
      cid: ctx.course.atprotoCid,
    };

    await ctx.agent.com.atproto.repo.putRecord({
      repo: ctx.did,
      collection: COLLECTION,
      rkey: progressRkey(courseRef.uri, lessonRef.uri),
      record: {
        $type: COLLECTION,
        learnerDid: ctx.did,
        courseRef,
        lessonRef,
        completedAt: new Date().toISOString(),
        progressPercent: 100,
      },
      validate: false,
    });
    return true;
  } catch (error: any) {
    console.error(
      `[credentials] lesson credential failed (user=${userId}, lesson=${lessonId}):`,
      error?.message
    );
    return false;
  }
}

/** Publishes the course-level completion record to the learner's repo. */
export async function publishCourseCredential(
  userId: string,
  courseId: string,
  preloaded?: PublishContext
): Promise<boolean> {
  try {
    const ctx = preloaded ?? (await loadPublishContext(userId, courseId));
    if (!ctx) return false;

    const courseRef = {
      uri: ctx.course.atprotoUri,
      cid: ctx.course.atprotoCid,
    };

    await ctx.agent.com.atproto.repo.putRecord({
      repo: ctx.did,
      collection: COLLECTION,
      rkey: progressRkey(courseRef.uri),
      record: {
        $type: COLLECTION,
        learnerDid: ctx.did,
        courseRef,
        completedAt: new Date().toISOString(),
        progressPercent: 100,
      },
      validate: false,
    });
    return true;
  } catch (error: any) {
    console.error(
      `[credentials] course credential failed (user=${userId}, course=${courseId}):`,
      error?.message
    );
    return false;
  }
}

/**
 * Called when a course reaches 100%: republishes every completed lesson's
 * credential plus the course-level record. Best-effort fan-out.
 */
export async function publishCredentialsOnCourseComplete(
  userId: string,
  courseId: string
): Promise<void> {
  const completedLessons = await prisma.enrollmentLesson.findMany({
    where: { userId, completed: true, lesson: { section: { courseId } } },
    select: { lessonId: true },
  });

  // Context (user + course refs + OAuth session) is identical for every
  // lesson here; loading it once turns N×(2 queries + 1 session restore)
  // into one of each for the whole fan-out.
  const ctx = await loadPublishContext(userId, courseId).catch(() => null);

  await Promise.allSettled(
    completedLessons.map((l) =>
      publishLessonCredential(userId, courseId, l.lessonId, ctx ?? undefined)
    )
  );
  await publishCourseCredential(userId, courseId, ctx ?? undefined);
}
