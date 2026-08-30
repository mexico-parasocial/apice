import express from "express";
import { isAutheticated } from "../middleware/auth";
import {
  getLessonPlayback,
  markLessonComplete,
  reportVideoProgress,
  setLessonVideoRef,
} from "../controllers/video.controller";
import { authorizeRoles } from "../middleware/auth";

const videoRouter = express.Router();

/**
 * Video delivery routes.
 *
 * Base path: /api/v1/videos
 */

// GET /api/v1/videos/lessons/:lessonId/playback
videoRouter.get(
  "/lessons/:lessonId/playback",
  isAutheticated,
  getLessonPlayback
);

// POST /api/v1/videos/lessons/:lessonId/progress
videoRouter.post(
  "/lessons/:lessonId/progress",
  isAutheticated,
  reportVideoProgress
);

// POST /api/v1/videos/lessons/:lessonId/complete
videoRouter.post(
  "/lessons/:lessonId/complete",
  isAutheticated,
  markLessonComplete
);

// POST /api/v1/videos/lessons/:lessonId/videoRef
// Attach a Streamplace video AT URI to a lesson (admin only).
videoRouter.post(
  "/lessons/:lessonId/videoRef",
  isAutheticated,
  authorizeRoles("admin"),
  setLessonVideoRef
);

export default videoRouter;
