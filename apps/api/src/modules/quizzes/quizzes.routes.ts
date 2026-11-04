import express from "express";
import {
  createQuiz,
  deleteQuiz,
  getQuiz,
  submitQuiz,
  getQuizResult,
} from "./quizzes.controller";
import { isAuthenticated, authorizeRoles } from "../../http/auth";

const quizRouter = express.Router();

quizRouter.post(
  "/quiz",
  isAuthenticated,
  authorizeRoles("admin"),
  createQuiz
);
quizRouter.delete(
  "/quiz/:lessonId",
  isAuthenticated,
  authorizeRoles("admin"),
  deleteQuiz
);
quizRouter.get("/quiz/:lessonId", isAuthenticated, getQuiz);
quizRouter.post("/quiz/:lessonId/submit", isAuthenticated, submitQuiz);
quizRouter.get("/quiz/:lessonId/result", isAuthenticated, getQuizResult);

export default quizRouter;
