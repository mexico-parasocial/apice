/**
 * Single source of truth for "is this lesson done, and is the next one
 * unlocked" — shared by the read path (progress.controller.ts, quiz gating)
 * and the write path (progress.service.ts) so the two can never drift into
 * disagreeing about a learner's progress.
 *
 * A checkpoint lesson (`isCheckpoint`) is `satisfied` only once its video is
 * watched *and* its quiz is passed. Satisfying a lesson unlocks the next one.
 * Critically, a checkpoint's own availability depends on the lesson *before*
 * it, never on its own quiz — gating a lesson behind a quiz you can only
 * reach by opening that same lesson is a deadlock, not a feature.
 */

export interface CourseLessonMeta {
  id: string;
  isCheckpoint: boolean;
}

export interface LessonProgressState {
  id: string;
  /** Video watched / marked done (EnrollmentLesson.completed). */
  completed: boolean;
  /** completed AND (not a checkpoint OR its quiz has been passed). */
  satisfied: boolean;
  /** Can the learner open this lesson right now? */
  available: boolean;
  isCheckpoint: boolean;
  /** null when this lesson isn't a checkpoint. */
  quizPassed: boolean | null;
}

/**
 * `lessons` must already be in course order (section order, then lesson
 * order) — availability is derived strictly from the preceding lesson.
 */
export function computeLessonProgress(
  lessons: readonly CourseLessonMeta[],
  completedLessonIds: ReadonlySet<string>,
  passedQuizLessonIds: ReadonlySet<string>
): LessonProgressState[] {
  const states: LessonProgressState[] = [];
  // The first lesson has no predecessor to wait on.
  let previousSatisfied = true;

  for (const lesson of lessons) {
    const completed = completedLessonIds.has(lesson.id);
    const isCheckpoint = lesson.isCheckpoint;
    const quizPassed = isCheckpoint ? passedQuizLessonIds.has(lesson.id) : null;
    const satisfied = completed && (!isCheckpoint || quizPassed === true);
    // Already-completed lessons stay open even if something upstream
    // regressed (shouldn't happen, but never lock out finished work).
    const available = previousSatisfied || completed;

    states.push({ id: lesson.id, completed, satisfied, available, isCheckpoint, quizPassed });
    previousSatisfied = satisfied;
  }

  return states;
}

export interface CourseProgressSummary {
  progress: number;
  courseCompleted: boolean;
}

export function summarizeCourseProgress(
  states: readonly LessonProgressState[]
): CourseProgressSummary {
  const total = states.length;
  const satisfiedCount = states.filter((s) => s.satisfied).length;
  const progress = total === 0 ? 0 : Math.round((satisfiedCount / total) * 100);
  return { progress, courseCompleted: total > 0 && progress >= 100 };
}
