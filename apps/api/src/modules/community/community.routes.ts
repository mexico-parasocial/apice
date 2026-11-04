import express from "express";
import {
  addAnswer,
  addQuestion,
  addReplyToReview,
  addReview,
} from "./community.controller";
import { authorizeRoles, isAuthenticated } from "../../http/auth";

/** Lesson Q&A and course reviews. */
const communityRouter = express.Router();

communityRouter.put("/add-question", isAuthenticated, addQuestion);
communityRouter.put("/add-answer", isAuthenticated, addAnswer);
communityRouter.put("/add-review/:id", isAuthenticated, addReview);
communityRouter.put("/add-reply", isAuthenticated, authorizeRoles("admin"), addReplyToReview);

export default communityRouter;
