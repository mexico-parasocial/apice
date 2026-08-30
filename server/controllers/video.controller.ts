import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { prisma } from "../utils/db";
import { resolvePlaybackUrlWithMetrics, verifyVideoRef } from "../services/videoDelivery.service";
import { recordLessonProgress } from "../services/progress.service";

const lessonPlaybackSchema = z.object({
  lessonId: z.string().min(1, "lessonId is required"),
});

const progressReportSchema = z.object({
  watchedSeconds: z.number().int().min(0),
});

const telemetrySchema = z
  .object({
    startupMs: z.number().int().min(0).optional(),
    stallCount: z.number().int().min(0).optional(),
    errorCount: z.number().int().min(0).optional(),
  })
  .optional();

const completeReportSchema = z
  .object({
    telemetry: telemetrySchema,
  })
  .optional();

const videoRefSchema = z.object({
  videoUrl: z
    .string()
    .min(1, "videoUrl is required")
    .regex(/^at:\/\//, "videoUrl must be an AT URI"),
  videoLength: z.number().int().positive().optional(),
});

/**
 * Maximum number of playback URLs we will hand out to the same user for the
 * same lesson in a short window. This is a lightweight bot mitigation: real
 * learners open the player once; scripts that hammer the endpoint stand out.
 */
const PLAYBACK_COOLDOWN_MS = 60_000;

/** Don't bother resuming for less than this much prior progress. */
const RESUME_THRESHOLD_SECONDS = 30;

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? undefined;
}

/**
 * GET /api/v1/videos/lessons/:lessonId/playback
 *
 * Returns a playable URL for the lesson video.
 *
 * Access policy:
 *   - The caller must be authenticated.
 *   - The caller must have a linked Bluesky DID (iM8 identity). This gives us
 *     a stable, verifiable identity for every view and keeps casual bots from
 *     burning bandwidth.
 *   - The lesson must exist and have a configured video reference.
 *
 * Every successful request is logged to VideoView so Ápice knows *who* watched
 * what, when, and through which provider.
 */
export const getLessonPlayback = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = lessonPlaybackSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new ErrorHandler(
          parsed.error.issues.map((e) => e.message).join(", "),
          400
        )
      );
    }

    const { lessonId } = parsed.data;
    const userId = req.user?.id;
    if (!userId) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Identity gate: require a verified Bluesky DID (iM8 / OAuth).
    const blueskyDid = req.user?.blueskyDid;
    if (!blueskyDid) {
      return next(
        new ErrorHandler(
          "A verified Bluesky identity is required to watch videos. Please link your account via iM8.",
          403
        )
      );
    }

    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } } },
    });

    if (!lesson) {
      return next(new ErrorHandler("Lesson not found", 404));
    }

    const videoRef = lesson.videoUrl;
    if (!videoRef) {
      return next(new ErrorHandler("Lesson has no video", 404));
    }

    // Lightweight cooldown: don't create a new VideoView row if the same user
    // requested the same lesson within the last minute.
    const recentView = await prisma.videoView.findFirst({
      where: {
        userId,
        lessonId,
        createdAt: { gte: new Date(Date.now() - PLAYBACK_COOLDOWN_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    // Resume: if the learner already watched part of this lesson, start the
    // playlist at that position (Streamplace nanosecond clip param). Skip
    // resume when nearly finished (rewatch from the top) or barely started.
    const enrollmentLesson = await prisma.enrollmentLesson.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { watchedSeconds: true, completed: true },
    });

    let resumeSeconds = 0;
    if (enrollmentLesson && !enrollmentLesson.completed) {
      const watched = enrollmentLesson.watchedSeconds;
      const duration = lesson.videoLength ?? 0;
      const nearlyDone = duration > 0 && watched >= duration * 0.95;
      if (watched >= RESUME_THRESHOLD_SECONDS && !nearlyDone) {
        resumeSeconds = watched;
      }
    }

    const playback = await resolvePlaybackUrlWithMetrics(videoRef, {
      startSeconds: resumeSeconds > 0 ? resumeSeconds : undefined,
    });

    if (!recentView) {
      await prisma.videoView.create({
        data: {
          userId,
          lessonId,
          courseId: lesson.section.courseId,
          provider: playback.provider,
          playbackUrl: playback.playbackUrl,
          ip: getClientIp(req),
          userAgent: req.headers["user-agent"] ?? null,
        },
      });
    }

    res.status(200).json({
      success: true,
      lessonId,
      provider: playback.provider,
      playbackUrl: playback.playbackUrl,
      expiresAt: playback.expiresAt?.toISOString() ?? null,
      durationSeconds: lesson.videoLength ?? null,
      resumeSeconds,
      identity: {
        userId,
        blueskyDid,
      },
    });
  }
);

/**
 * POST /api/v1/videos/lessons/:lessonId/progress
 *
 * Stub: accepts watchedSeconds and returns success. Real persistence will
 * reuse /api/v1/update-progress once the video player is integrated.
 */
export const reportVideoProgress = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const paramsParsed = lessonPlaybackSchema.safeParse(req.params);
    const bodyParsed = progressReportSchema.safeParse(req.body);

    if (!paramsParsed.success || !bodyParsed.success) {
      const issues = [
        ...(paramsParsed.error?.issues ?? []),
        ...(bodyParsed.error?.issues ?? []),
      ];
      return next(
        new ErrorHandler(
          issues.map((e) => e.message).join(", "),
          400
        )
      );
    }

    const { lessonId } = paramsParsed.data;
    const { watchedSeconds } = bodyParsed.data;
    const userId = req.user?.id;
    if (!userId) {
      return next(new ErrorHandler("User not found", 404));
    }

    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: { section: true },
    });
    if (!lesson) {
      return next(new ErrorHandler("Lesson not found", 404));
    }

    const result = await recordLessonProgress({
      userId,
      courseId: lesson.section.courseId,
      lessonId,
      watchedSeconds,
    });

    res.status(200).json({
      success: true,
      lessonId,
      watchedSeconds: result.watchedSeconds,
      progress: result.progress,
      persisted: true,
    });
  }
);

/**
 * POST /api/v1/videos/lessons/:lessonId/complete
 *
 * Stub: marks a lesson complete. Real persistence will reuse /api/v1/update-progress.
 */
export const markLessonComplete = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = lessonPlaybackSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new ErrorHandler(
          parsed.error.issues.map((e) => e.message).join(", "),
          400
        )
      );
    }

    const { lessonId } = parsed.data;
    const userId = req.user?.id;
    if (!userId) {
      return next(new ErrorHandler("User not found", 404));
    }

    const bodyParsed = completeReportSchema.safeParse(req.body ?? {});
    const telemetry = bodyParsed.success
      ? bodyParsed.data?.telemetry
      : undefined;

    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: { section: true },
    });
    if (!lesson) {
      return next(new ErrorHandler("Lesson not found", 404));
    }

    const result = await recordLessonProgress({
      userId,
      courseId: lesson.section.courseId,
      lessonId,
      completed: true,
      watchedSeconds: lesson.videoLength ?? undefined,
      telemetry,
    });

    res.status(200).json({
      success: true,
      lessonId,
      completed: true,
      progress: result.progress,
      courseCompleted: result.courseCompleted,
      persisted: true,
    });
  }
);

/**
 * POST /api/v1/videos/lessons/:lessonId/videoRef
 *
 * Attach a published Streamplace video AT URI to a lesson. Called by the admin
 * panel after the instructor has uploaded and published a video through the
 * self-hosted Streamplace node.
 */
export const setLessonVideoRef = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const paramsParsed = lessonPlaybackSchema.safeParse(req.params);
    const bodyParsed = videoRefSchema.safeParse(req.body);

    if (!paramsParsed.success || !bodyParsed.success) {
      const issues = [
        ...(paramsParsed.error?.issues ?? []),
        ...(bodyParsed.error?.issues ?? []),
      ];
      return next(
        new ErrorHandler(
          issues.map((e) => e.message).join(", "),
          400
        )
      );
    }

    const { lessonId } = paramsParsed.data;
    const { videoUrl, videoLength } = bodyParsed.data;

    if (!videoUrl.includes("/place.stream.video/")) {
      return next(
        new ErrorHandler(
          "videoUrl must point to a place.stream.video record",
          400
        )
      );
    }

    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) {
      return next(new ErrorHandler("Lesson not found", 404));
    }

    // Refuse to attach a video Streamplace cannot actually serve. An
    // unpublished or deleted AT URI would otherwise look fine here and break
    // for every learner who opens the lesson.
    const check = await verifyVideoRef(videoUrl);
    if (!check.ready) {
      return next(new ErrorHandler(check.error, 422));
    }

    await prisma.courseLesson.update({
      where: { id: lessonId },
      data: {
        videoUrl,
        ...(videoLength ? { videoLength } : {}),
      },
    });

    res.status(200).json({
      success: true,
      lessonId,
      videoUrl,
    });
  }
);
