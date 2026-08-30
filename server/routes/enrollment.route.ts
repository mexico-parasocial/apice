import express from "express";
import {
  checkEnrollment,
  enrollFree,
} from "../controllers/enrollment.controller";
import { isAutheticated } from "../middleware/auth";

const enrollmentRouter = express.Router();

enrollmentRouter.get(
  "/enrollments/:courseId/check",
  isAutheticated,
  checkEnrollment
);

enrollmentRouter.post("/enrollments/:courseId", isAutheticated, enrollFree);

export default enrollmentRouter;
