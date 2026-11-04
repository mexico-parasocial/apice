import { createHash } from "crypto";
import { AtpAgent } from "@atproto/api";
import { createCivicValidator } from "@apice/lexicons";
import { prisma } from "../utils/db";
import { log } from "../utils/logger";
import { restoreSession } from "./atprotoOAuth.service";

/**
 * Portable credentials: `app.civic.progress` records in the LEARNER'S OWN
 * repo, written with the OAuth session they granted at login. The record is
 * self-attested by construction (learnerDid == repo owner).
 *
 * Two rules shape this module:
 *
 * 1. Consent. ATProto repos are public: a progress record is broadcast on the
 *    firehose and copied by relays, so "who studied which course" becomes
 *    public and permanent. Nothing is published unless the learner opted in
 *    (User.credentialsConsent).
 *
 * 2. Durability. Publishing goes through the CredentialPublication outbox:
 *    completing a lesson enqueues a row, and a drain loop (startCredential
 *    Outbox) publishes it, retrying with backoff when the PDS is down. Every
 *    credential therefore has a status you can query — the old
 *    fire-and-forget call lost it silently on any failure.
 */

const COLLECTION = "app.civic.progress";
const credLog = log("credentials");
const validator = createCivicValidator();

const MAX_ATTEMPTS = 8;
const DRAIN_INTERVAL_MS = 30_000;
const DRAIN_BATCH = 20;
/** A row stuck in "processing" this long belonged to a crashed drain. */
const STALE_PROCESSING_MS = 5 * 60_000;

export type PublicationStatus =
  | "pending"
  | "processing"
  | "published"
  | "skipped"
  | "failed";

export type PublishOutcome =
  | { status: "published"; uri: string; cid: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

interface StrongRef {
  uri: string;
  cid: string;
}

/** Deterministic rkey → idempotent re-publishes (putRecord upserts). */
export function progressRkey(courseUri: string, lessonUri?: string): string {
  return createHash("sha256")
    .update(`${courseUri}|${lessonUri ?? "course"}`)
    .digest("hex")
    .slice(0, 20);
}

const publicationKey = (userId: string, courseId: string, lessonId?: string | null) =>
  `${userId}:${courseId}:${lessonId ?? "course"}`;

interface PublishContext {
  did: string;
  agent: AtpAgent;
  courseRef: StrongRef;
  lessonRefs: Map<string, StrongRef>;
}

type ContextResult = { ok: true; ctx: PublishContext } | { ok: false; outcome: PublishOutcome };

async function loadPublishContext(userId: string, courseId: string): Promise<ContextResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { blueskyDid: true },
  });
  if (!user?.blueskyDid) {
    return { ok: false, outcome: { status: "skipped", reason: "learner has no Bluesky DID" } };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      atprotoUri: true,
      atprotoCid: true,
      lessonRefs: { select: { lessonId: true, uri: true, cid: true } },
    },
  });
  if (!course?.atprotoUri || !course.atprotoCid) {
    return {
      ok: false,
      outcome: { status: "skipped", reason: "course is not published to the Atmosphere" },
    };
  }

  let session;
  try {
    session = await restoreSession(user.blueskyDid);
  } catch {
    return {
      ok: false,
      outcome: { status: "skipped", reason: "no OAuth session with write scope" },
    };
  }

  // Self-attestation invariant: the repo we write to must be the learner's.
  if (session.sub !== user.blueskyDid) {
    return {
      ok: false,
      outcome: { status: "skipped", reason: "OAuth session belongs to another DID" },
    };
  }

  return {
    ok: true,
    ctx: {
      did: user.blueskyDid,
      agent: new AtpAgent(session as any),
      courseRef: { uri: course.atprotoUri, cid: course.atprotoCid },
      lessonRefs: new Map(course.lessonRefs.map((r) => [r.lessonId, { uri: r.uri, cid: r.cid }])),
    },
  };
}

async function putProgressRecord(
  ctx: PublishContext,
  record: Record<string, unknown>,
  rkey: string
): Promise<PublishOutcome> {
  // Validate locally against our own lexicon: the PDS doesn't know
  // app.civic.*, so this is the only check the record will ever get.
  try {
    validator.assertValidRecord(COLLECTION, record);
  } catch (error: any) {
    return { status: "skipped", reason: `record fails lexicon: ${error?.message}` };
  }
  try {
    const res = await ctx.agent.com.atproto.repo.putRecord({
      repo: ctx.did,
      collection: COLLECTION,
      rkey,
      record,
    });
    return { status: "published", uri: res.data.uri, cid: res.data.cid };
  } catch (error: any) {
    return { status: "failed", error: error?.message ?? "putRecord failed" };
  }
}

/** Publishes one lesson-level progress record. Never throws. */
export async function publishLessonCredential(
  userId: string,
  courseId: string,
  lessonId: string,
  preloaded?: PublishContext
): Promise<PublishOutcome> {
  try {
    let ctx = preloaded;
    if (!ctx) {
      const loaded = await loadPublishContext(userId, courseId);
      if (!loaded.ok) return loaded.outcome;
      ctx = loaded.ctx;
    }
    const lessonRef = ctx.lessonRefs.get(lessonId);
    if (!lessonRef) {
      return { status: "skipped", reason: "lesson has no published app.civic.lesson ref" };
    }
    return await putProgressRecord(
      ctx,
      {
        $type: COLLECTION,
        learnerDid: ctx.did,
        courseRef: ctx.courseRef,
        lessonRef,
        completedAt: new Date().toISOString(),
        progressPercent: 100,
      },
      progressRkey(ctx.courseRef.uri, lessonRef.uri)
    );
  } catch (error: any) {
    return { status: "failed", error: error?.message ?? "unexpected error" };
  }
}

/** Publishes the course-level completion record. Never throws. */
export async function publishCourseCredential(
  userId: string,
  courseId: string,
  preloaded?: PublishContext
): Promise<PublishOutcome> {
  try {
    let ctx = preloaded;
    if (!ctx) {
      const loaded = await loadPublishContext(userId, courseId);
      if (!loaded.ok) return loaded.outcome;
      ctx = loaded.ctx;
    }
    return await putProgressRecord(
      ctx,
      {
        $type: COLLECTION,
        learnerDid: ctx.did,
        courseRef: ctx.courseRef,
        completedAt: new Date().toISOString(),
        progressPercent: 100,
      },
      progressRkey(ctx.courseRef.uri)
    );
  } catch (error: any) {
    return { status: "failed", error: error?.message ?? "unexpected error" };
  }
}

// ─── Outbox ─────────────────────────────────────────────────────────

/**
 * Queues a credential for publishing, if the learner consented.
 * Re-queuing an already published credential is a no-op.
 */
export async function enqueueCredential(
  userId: string,
  courseId: string,
  lessonId?: string | null
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credentialsConsent: true },
  });
  if (!user?.credentialsConsent) return false;

  const key = publicationKey(userId, courseId, lessonId);
  const existing = await prisma.credentialPublication.findUnique({ where: { key } });
  if (existing?.status === "published") return false;

  await prisma.credentialPublication.upsert({
    where: { key },
    update: { status: "pending", attempts: 0, lastError: null, nextAttemptAt: new Date() },
    create: { key, userId, courseId, lessonId: lessonId ?? null },
  });
  kickCredentialOutbox();
  return true;
}

/**
 * Queues every credential the learner has earned: each completed lesson and
 * each completed course. Used when consent is granted.
 */
export async function enqueueAllEarnedCredentials(userId: string): Promise<number> {
  const [lessons, courses] = await Promise.all([
    prisma.enrollmentLesson.findMany({
      where: { userId, completed: true },
      select: { lessonId: true, lesson: { select: { section: { select: { courseId: true } } } } },
    }),
    prisma.enrollment.findMany({
      where: { userId, completed: true },
      select: { courseId: true },
    }),
  ]);
  let queued = 0;
  for (const l of lessons) {
    if (await enqueueCredential(userId, l.lesson.section.courseId, l.lessonId)) queued++;
  }
  for (const c of courses) {
    if (await enqueueCredential(userId, c.courseId)) queued++;
  }
  return queued;
}

/** Consent withdrawn: nothing still queued for this learner goes out. */
export async function cancelPendingCredentials(userId: string) {
  await prisma.credentialPublication.updateMany({
    where: { userId, status: { in: ["pending", "failed"] } },
    data: { status: "skipped", lastError: "consent withdrawn" },
  });
}

/**
 * Re-queues credentials that were skipped because the course or its lessons
 * weren't on the Atmosphere yet. Called after an admin publishes a course.
 */
export async function requeueSkippedForCourse(courseId: string) {
  const { count } = await prisma.credentialPublication.updateMany({
    where: { courseId, status: "skipped", NOT: { lastError: "consent withdrawn" } },
    data: { status: "pending", attempts: 0, nextAttemptAt: new Date() },
  });
  if (count > 0) kickCredentialOutbox();
  return count;
}

/**
 * Re-queues a learner's credentials that were skipped for lack of an OAuth
 * session or DID. Called after they sign in with Bluesky.
 */
export async function requeueSkippedForUser(userId: string) {
  const { count } = await prisma.credentialPublication.updateMany({
    where: { userId, status: "skipped", NOT: { lastError: "consent withdrawn" } },
    data: { status: "pending", attempts: 0, nextAttemptAt: new Date() },
  });
  if (count > 0) kickCredentialOutbox();
  return count;
}

function backoffMs(attempts: number) {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** attempts);
}

/** Processes due outbox rows. Exported for tests and scripts. */
export async function drainCredentialOutbox(now = new Date()): Promise<number> {
  await prisma.credentialPublication.updateMany({
    where: {
      status: "processing",
      updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) },
    },
    data: { status: "pending" },
  });

  const due = await prisma.credentialPublication.findMany({
    where: { status: "pending", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: DRAIN_BATCH,
  });

  let processed = 0;
  for (const row of due) {
    // Claim atomically so two API instances never publish the same row.
    const claim = await prisma.credentialPublication.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "processing" },
    });
    if (claim.count !== 1) continue;
    processed++;

    const outcome = row.lessonId
      ? await publishLessonCredential(row.userId, row.courseId, row.lessonId)
      : await publishCourseCredential(row.userId, row.courseId);

    if (outcome.status === "published") {
      await prisma.credentialPublication.update({
        where: { id: row.id },
        data: {
          status: "published",
          uri: outcome.uri,
          cid: outcome.cid,
          publishedAt: new Date(),
          lastError: null,
        },
      });
    } else if (outcome.status === "skipped") {
      await prisma.credentialPublication.update({
        where: { id: row.id },
        data: { status: "skipped", lastError: outcome.reason },
      });
    } else {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      credLog.warn(
        { userId: row.userId, courseId: row.courseId, lessonId: row.lessonId, attempts, err: outcome.error },
        giveUp ? "credential publish failed permanently" : "credential publish failed; will retry"
      );
      await prisma.credentialPublication.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "failed" : "pending",
          attempts,
          lastError: outcome.error,
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
        },
      });
    }
  }
  return processed;
}

let timer: NodeJS.Timeout | null = null;
let draining = false;
let again = false;

async function runDrain() {
  if (draining) {
    again = true;
    return;
  }
  draining = true;
  try {
    do {
      again = false;
      await drainCredentialOutbox();
    } while (again);
  } catch (err) {
    credLog.error({ err }, "credential outbox drain failed");
  } finally {
    draining = false;
  }
}

/** Runs a drain soon, without blocking the caller. No-op until started. */
export function kickCredentialOutbox() {
  if (timer) setImmediate(() => void runDrain());
}

export function startCredentialOutbox() {
  if (timer) return;
  timer = setInterval(() => void runDrain(), DRAIN_INTERVAL_MS);
  timer.unref();
  void runDrain();
}

export function stopCredentialOutbox() {
  if (timer) clearInterval(timer);
  timer = null;
}
