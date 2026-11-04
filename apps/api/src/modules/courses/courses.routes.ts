import express from "express";
import {
  deleteCourse,
  editCourse,
  getAdminAllCourses,
  getAdminCourseContent,
  getAllCourses,
  getCourseByUser,
  getSingleCourse,
  uploadCourse,
} from "./courses.controller";
import { authorizeRoles, isAuthenticated } from "../../http/auth";
const courseRouter = express.Router();

courseRouter.post(
  "/create-course",
  isAuthenticated,
  authorizeRoles("admin"),
  uploadCourse
);

courseRouter.put(
  "/edit-course/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  editCourse
);

courseRouter.get("/get-course/:id", getSingleCourse);

courseRouter.get("/get-courses", getAllCourses);

courseRouter.get(
  "/get-admin-courses",
  isAuthenticated,
  authorizeRoles("admin"),
  getAdminAllCourses
);

courseRouter.get(
  "/get-admin-course-content/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  getAdminCourseContent
);

courseRouter.get("/get-course-content/:id", isAuthenticated, getCourseByUser);

courseRouter.delete(
  "/delete-course/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  deleteCourse
);

export default courseRouter;
