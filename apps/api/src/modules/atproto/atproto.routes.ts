import express from "express";
import { authorizeRoles, isAuthenticated } from "../../http/auth";
import {
  getCourseAtprotoRecord,
  publishCourseToAtmosphere,
  registerCourseAtprotoRef,
} from "./atproto.controller";

const atprotoRouter = express.Router();

atprotoRouter.post(
  "/publish-course",
  isAuthenticated,
  authorizeRoles("admin"),
  publishCourseToAtmosphere
);

atprotoRouter.post(
  "/course/:id/atprotoRef",
  isAuthenticated,
  authorizeRoles("admin"),
  registerCourseAtprotoRef
);

atprotoRouter.get("/course/:id/atmosphere", getCourseAtprotoRecord);

export default atprotoRouter;
