import express from "express";
import {
  checkEnrollment,
  enrollFree,
} from "./enrollment.controller";
import { isAuthenticated } from "../../http/auth";

const enrollmentRouter = express.Router();

enrollmentRouter.get(
  "/enrollments/:courseId/check",
  isAuthenticated,
  checkEnrollment
);

enrollmentRouter.post("/enrollments/:courseId", isAuthenticated, enrollFree);

export default enrollmentRouter;
