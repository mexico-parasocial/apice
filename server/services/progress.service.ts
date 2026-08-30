import { prisma } from "../utils/db";
import ErrorHandler from "../utils/ErrorHandler";
import {
  computeLessonProgress,
  summarizeCourseProgress,
} from "../utils/courseProgress";
import {
  publishCredentialsOnCourseComplete,
  publishLessonCredential,
} from "./credentials.service";

export interface PlaybackTelemetry {
  startupMs?: number;
  stallCount?: number;
  errorCount?: number;
}

interface RecordLessonProgressInput {
  userId: string;
  courseId: string;
  lessonId: string;
  /** When true, marks the lesson completed. Never un-completes a lesson. */
  completed?: boolean;
  /** Current playback position. Never decreases stored watchedSeconds. */
  watchedSeconds?: number;
  /** Optional QoS telemetry from the player. */
  telemetry?: PlaybackTelemetry;
}

interface RecordLessonProgressResult {
  enrollmentId: string;
  lessonCompleted: boolean;
  watchedSeconds: number;
  /** Course-wide completion percentage (0-100). */
  progress: number;
  /** True when every lesson in the course is completed. */
  courseCompleted: boolean;
}

/**
 * Records lesson-level progress for an enrolled user and recomputes the
 * course-wide enrollment progress.
 *
 * Semantics:
 * - Auto-enrolls the user if needed (all courses are free; progress implies
 *   enrollment).
 * - `watchedSeconds` only ever increases (player retries / out-of-order
 *   reports cannot regress it).
 * - `completed` only ever transitions false → true.
 */
export async function recordLessonProgress(
  input: RecordLessonProgressInput
): Promise<RecordLessonProgressResult> {
  const { userId, courseId, lessonId, completed, watchedSeconds, telemetry } =
    input;

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { lastAccessedAt: new Date() },
    create: {
      userId,
      courseId,
      progress: 0,
      completed: false,
      lastAccessedAt: new Date(),
    },
  });

  const existing = await prisma.enrollmentLesson.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });

  // Course-ordered lesson list — computeLessonProgress derives availability
  // strictly from the *preceding* lesson, so this order has to be authoritative.
  const allLessons = await prisma.courseLesson.findMany({
    where: { section: { courseId } },
    select: { id: true, isCheckpoint: true },
    orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
  });
  const allLessonIds = allLessons.map((l) => l.id);

  const passedQuizLessonIds = new Set(
    await prisma.enrollmentQuiz
      .findMany({
        where: { userId, passed: true, lessonId: { in: allLessonIds } },
        select: { lessonId: true },
      })
      .then((rows) => rows.map((r) => r.lessonId))
  );

  // Completed-lesson ids, fetched once and reused twice: for the sequential
  // lock below, and to derive the post-upsert state. This handler runs on
  // every player progress ping, so the second query it used to issue was
  // pure overhead.
  const priorCompletedIds = new Set(
    await prisma.enrollmentLesson
      .findMany({
        where: { userId, lessonId: { in: allLessonIds }, completed: true },
        select: { lessonId: true },
      })
      .then((rows) => rows.map((r) => r.lessonId))
  );

  // Enforce the same sequential lock the UI shows, so completion can't be
  // written out of order via a direct API call — the client-side gate is a
  // convenience, not the actual boundary.
  if (completed === true && !(existing?.completed ?? false)) {
    const priorStates = computeLessonProgress(
      allLessons,
      priorCompletedIds,
      passedQuizLessonIds
    );
    const target = priorStates.find((s) => s.id === lessonId);
    if (target && !target.available) {
      throw new ErrorHandler(
        "This lesson isn't unlocked yet — complete the previous lesson first.",
        423
      );
    }
  }

  const nextWatched = Math.max(
    existing?.watchedSeconds ?? 0,
    watchedSeconds ?? 0
  );
  const nextCompleted = (existing?.completed ?? false) || completed === true;
  const completedAt =
    existing?.completedAt ?? (nextCompleted ? new Date() : null);
  const justCompleted = nextCompleted && !(existing?.completed ?? false);

  const lesson = await prisma.enrollmentLesson.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: {
      watchedSeconds: nextWatched,
      completed: nextCompleted,
      completedAt,
      ...(telemetry ? { playbackTelemetry: telemetry as any } : {}),
    },
    create: {
      enrollmentId: enrollment.id,
      userId,
      lessonId,
      watchedSeconds: nextWatched,
      completed: nextCompleted,
      completedAt,
      ...(telemetry ? { playbackTelemetry: telemetry as any } : {}),
    },
  });

  // Recompute overall course progress so clients can react immediately.
  // Uses the same helper getProgress reads through, so the two can't drift.
  // Derived from the pre-upsert set rather than re-queried: the upsert above
  // can only add this lesson's completion. A concurrent completion of a
  // different lesson between the fetch and here would be picked up by that
  // learner's next progress ping — progress only ever ratchets up.
  const postCompletedIds = new Set(priorCompletedIds);
  if (nextCompleted) {
    postCompletedIds.add(lessonId);
  }
  const { progress, courseCompleted } = summarizeCourseProgress(
    computeLessonProgress(allLessons, postCompletedIds, passedQuizLessonIds)
  );

  const courseJustCompleted = courseCompleted && !enrollment.completed;

  if (enrollment.progress !== progress || enrollment.completed !== courseCompleted) {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { progress, completed: courseCompleted },
    });
  }

  // Portable credentials: publish app.civic.progress records to the learner's
  // own PDS. Fire-and-forget — never blocks the request path.
  if (justCompleted) {
    void publishLessonCredential(userId, courseId, lessonId).catch(() => {});
  }
  if (courseJustCompleted) {
    // Fan-out covers every completed lesson plus the course-level record.
    void publishCredentialsOnCourseComplete(userId, courseId).catch(() => {});

    // Completion notification for the learner (fire-and-forget).
    void (async () => {
      try {
        const course = await prisma.course.findUnique({
          where: { id: courseId },
          select: { name: true },
        });
        await prisma.notification.create({
          data: {
            userId,
            title: "¡Programa completado! 🎓",
            message: `Felicidades — completaste "${course?.name ?? "el programa"}". Tu certificado y tu credencial ATProto están listos.`,
          },
        });
      } catch {
        /* non-blocking */
      }
    })();
  }

  return {
    enrollmentId: enrollment.id,
    lessonCompleted: lesson.completed,
    watchedSeconds: lesson.watchedSeconds,
    progress,
    courseCompleted,
  };
}
