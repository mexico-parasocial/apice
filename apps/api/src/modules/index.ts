import express from "express";
import passwordAuthRouter from "./auth/password.routes";
import atprotoAuthRouter from "./auth/atprotoOAuth.routes";
import im8Router from "./auth/im8.routes";
import userRouter from "./users/users.routes";
import courseRouter from "./courses/courses.routes";
import communityRouter from "./community/community.routes";
import enrollmentRouter from "./enrollment/enrollment.routes";
import progressRouter from "./progress/progress.routes";
import quizRouter from "./quizzes/quizzes.routes";
import videoRouter from "./video/video.routes";
import certificateRouter from "./certificates/certificates.routes";
import atprotoRouter from "./atproto/atproto.routes";
import networkRouter from "./network/network.routes";
import ineRouter from "./ine/ine.routes";
import notificationRouter from "./notifications/notifications.routes";
import cmsRouter from "./cms/cms.routes";
import analyticsRouter from "./analytics/analytics.routes";
import pushRouter from "./push/push.routes";
import orderRouter from "./payments/orders.routes";

/**
 * Every feature module's routes, mounted under /api/v1 by app.ts.
 *
 * One module per folder: <name>.routes.ts (HTTP surface), <name>.controller
 * .ts (request handling), <name>.service.ts (logic that doesn't know about
 * HTTP). Adding a module means adding one line here.
 */
export const apiRouter = express.Router();

apiRouter.use(
  passwordAuthRouter,
  atprotoAuthRouter,
  im8Router,
  userRouter,
  courseRouter,
  communityRouter,
  enrollmentRouter,
  progressRouter,
  quizRouter,
  certificateRouter,
  atprotoRouter,
  networkRouter,
  ineRouter,
  notificationRouter,
  cmsRouter,
  analyticsRouter,
  pushRouter,
  orderRouter // dormant: payments are off until the revenue model lands
);
apiRouter.use("/videos", videoRouter);
