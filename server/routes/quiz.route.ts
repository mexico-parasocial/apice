import express from "express";
import {
  createQuiz,
  deleteQuiz,
  getQuiz,
  submitQuiz,
  getQuizResult,
} from "../controllers/quiz.controller";
import { isAutheticated, authorizeRoles } from "../middleware/auth";

const quizRouter = express.Router();

quizRouter.post(
  "/quiz",
  isAutheticated,
  authorizeRoles("admin"),
  createQuiz
);
quizRouter.delete(
  "/quiz/:lessonId",
  isAutheticated,
  authorizeRoles("admin"),
  deleteQuiz
);
quizRouter.get("/quiz/:lessonId", isAutheticated, getQuiz);
quizRouter.post("/quiz/:lessonId/submit", isAutheticated, submitQuiz);
quizRouter.get("/quiz/:lessonId/result", isAutheticated, getQuizResult);

export default quizRouter;
