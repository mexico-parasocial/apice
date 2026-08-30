import express from "express";
import {
  updateProgress,
  getProgress,
  getAllProgress,
} from "../controllers/progress.controller";
import { isAutheticated } from "../middleware/auth";

const progressRouter = express.Router();

progressRouter.post("/update-progress", isAutheticated, updateProgress);
progressRouter.get("/get-progress/:courseId", isAutheticated, getProgress);
progressRouter.get("/get-all-progress", isAutheticated, getAllProgress);

export default progressRouter;
