import express from "express";
import { isAuthenticated } from "../../http/auth";
import {
  checkInstructor,
  getLessonPlayback,
  markLessonComplete,
  reportVideoProgress,
  setLessonVideoRef,
} from "./video.controller";
import { authorizeRoles } from "../../http/auth";

const videoRouter = express.Router();

/**
 * Video delivery routes.
 *
 * Base path: /api/v1/videos
 */

// GET /api/v1/videos/lessons/:lessonId/playback
videoRouter.get(
  "/lessons/:lessonId/playback",
  isAuthenticated,
  getLessonPlayback
);

// POST /api/v1/videos/lessons/:lessonId/progress
videoRouter.post(
  "/lessons/:lessonId/progress",
  isAuthenticated,
  reportVideoProgress
);

// POST /api/v1/videos/lessons/:lessonId/complete
videoRouter.post(
  "/lessons/:lessonId/complete",
  isAuthenticated,
  markLessonComplete
);

// POST /api/v1/videos/lessons/:lessonId/videoRef
// Attach a Streamplace video AT URI to a lesson (admin only).
videoRouter.post(
  "/lessons/:lessonId/videoRef",
  isAuthenticated,
  authorizeRoles("admin"),
  setLessonVideoRef
);

// GET /api/v1/videos/instructors/check?did=…
// Is this Bluesky account an approved instructor? (admin only)
videoRouter.get(
  "/instructors/check",
  isAuthenticated,
  authorizeRoles("admin"),
  checkInstructor
);

export default videoRouter;
