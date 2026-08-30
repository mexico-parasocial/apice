import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/credentials.service", () => ({
  publishLessonCredential: vi.fn().mockResolvedValue(false),
  publishCourseCredential: vi.fn().mockResolvedValue(false),
  publishCredentialsOnCourseComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/db", () => ({
  prisma: {
    enrollment: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    enrollmentLesson: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    courseLesson: {
      findMany: vi.fn(),
    },
    enrollmentQuiz: {
      findMany: vi.fn(),
    },
  },
}));

import { recordLessonProgress } from "../../services/progress.service";
import { prisma } from "../../utils/db";

const enrollment = {
  id: "enroll-1",
  userId: "user-1",
  courseId: "course-1",
  progress: 0,
  completed: false,
};

describe("recordLessonProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.enrollment.upsert as any).mockResolvedValue(enrollment);
    (prisma.courseLesson.findMany as any).mockResolvedValue([
      { id: "lesson-1", isCheckpoint: false },
      { id: "lesson-2", isCheckpoint: false },
    ]);
    (prisma.enrollmentQuiz.findMany as any).mockResolvedValue([]);
  });

  it("auto-enrolls and creates the lesson record on first report", async () => {
    (prisma.enrollmentLesson.findUnique as any).mockResolvedValue(null);
    (prisma.enrollmentLesson.upsert as any).mockResolvedValue({
      completed: false,
      watchedSeconds: 42,
    });
    (prisma.enrollmentLesson.findMany as any).mockResolvedValue([]);

    const result = await recordLessonProgress({
      userId: "user-1",
      courseId: "course-1",
      lessonId: "lesson-1",
      watchedSeconds: 42,
    });

    expect(prisma.enrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_courseId: { userId: "user-1", courseId: "course-1" } },
      })
    );
    expect(prisma.enrollmentLesson.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          enrollmentId: "enroll-1",
          lessonId: "lesson-1",
          watchedSeconds: 42,
          completed: false,
        }),
      })
    );
    expect(result.watchedSeconds).toBe(42);
    expect(result.progress).toBe(0);
    expect(result.courseCompleted).toBe(false);
  });

  it("never regresses watchedSeconds", async () => {
    (prisma.enrollmentLesson.findUnique as any).mockResolvedValue({
      completed: false,
      watchedSeconds: 100,
      completedAt: null,
    });
    (prisma.enrollmentLesson.upsert as any).mockResolvedValue({
      completed: false,
      watchedSeconds: 100,
    });
    (prisma.enrollmentLesson.findMany as any).mockResolvedValue([]);

    await recordLessonProgress({
      userId: "user-1",
      courseId: "course-1",
      lessonId: "lesson-1",
      watchedSeconds: 30,
    });

    expect(prisma.enrollmentLesson.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ watchedSeconds: 100 }),
      })
    );
  });

  it("never un-completes a completed lesson", async () => {
    const completedAt = new Date("2026-07-01T00:00:00Z");
    (prisma.enrollmentLesson.findUnique as any).mockResolvedValue({
      completed: true,
      watchedSeconds: 300,
      completedAt,
    });
    (prisma.enrollmentLesson.upsert as any).mockResolvedValue({
      completed: true,
      watchedSeconds: 300,
    });
    (prisma.enrollmentLesson.findMany as any).mockResolvedValue([
      { lessonId: "lesson-1" },
    ]);

    await recordLessonProgress({
      userId: "user-1",
      courseId: "course-1",
      lessonId: "lesson-1",
      watchedSeconds: 10,
      completed: false,
    });

    expect(prisma.enrollmentLesson.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          completed: true,
          completedAt,
          watchedSeconds: 300,
        }),
      })
    );
  });

  it("marks the enrollment completed at 100% so certificates unlock", async () => {
    (prisma.enrollmentLesson.findUnique as any).mockResolvedValue(null);
    (prisma.enrollmentLesson.upsert as any).mockResolvedValue({
      completed: true,
      watchedSeconds: 300,
    });
    // Both lessons completed after this call.
    (prisma.enrollmentLesson.findMany as any).mockResolvedValue([
      { lessonId: "lesson-1" },
      { lessonId: "lesson-2" },
    ]);

    const result = await recordLessonProgress({
      userId: "user-1",
      courseId: "course-1",
      lessonId: "lesson-2",
      completed: true,
      watchedSeconds: 300,
    });

    expect(result.progress).toBe(100);
    expect(result.courseCompleted).toBe(true);
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: "enroll-1" },
      data: { progress: 100, completed: true },
    });
  });

  it("keeps completedAt from the first completion", async () => {
    (prisma.enrollmentLesson.findUnique as any).mockResolvedValue(null);
    (prisma.enrollmentLesson.upsert as any).mockResolvedValue({
      completed: true,
      watchedSeconds: 0,
    });
    (prisma.enrollmentLesson.findMany as any).mockResolvedValue([]);

    await recordLessonProgress({
      userId: "user-1",
      courseId: "course-1",
      lessonId: "lesson-1",
      completed: true,
    });

    const upsertArg = (prisma.enrollmentLesson.upsert as any).mock.calls[0][0];
    expect(upsertArg.create.completed).toBe(true);
    expect(upsertArg.create.completedAt).toBeInstanceOf(Date);
  });
});
