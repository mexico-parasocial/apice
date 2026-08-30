import express from "express";
import {
  getNetworkCourse,
  getNetworkCourses,
} from "../controllers/network.controller";

const networkRouter = express.Router();

// Public read API for civic records discovered on the ATProto network.
networkRouter.get("/network/courses", getNetworkCourses);
networkRouter.get("/network/courses/:did/:rkey", getNetworkCourse);

export default networkRouter;
