import express from "express";
import { authorizeRoles, isAutheticated } from "../middleware/auth";
import {
  getCourseAtprotoRecord,
  publishCourseToAtmosphere,
  registerCourseAtprotoRef,
} from "../controllers/atproto.controller";

const atprotoRouter = express.Router();

atprotoRouter.post(
  "/publish-course",
  isAutheticated,
  authorizeRoles("admin"),
  publishCourseToAtmosphere
);

atprotoRouter.post(
  "/course/:id/atprotoRef",
  isAutheticated,
  authorizeRoles("admin"),
  registerCourseAtprotoRef
);

atprotoRouter.get("/course/:id/atmosphere", getCourseAtprotoRecord);

export default atprotoRouter;
