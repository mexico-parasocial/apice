import express from "express";
import {
  updateProgress,
  getProgress,
  getAllProgress,
} from "./progress.controller";
import { isAuthenticated } from "../../http/auth";

const progressRouter = express.Router();

progressRouter.post("/update-progress", isAuthenticated, updateProgress);
progressRouter.get("/get-progress/:courseId", isAuthenticated, getProgress);
progressRouter.get("/get-all-progress", isAuthenticated, getAllProgress);

export default progressRouter;
