import express from "express";
import { authorizeRoles, isAutheticated } from "../middleware/auth";
import { getMyNotifications, getNotifications, updateNotification } from "../controllers/notification.controller";
const notificationRoute = express.Router();

notificationRoute.get("/notifications", isAutheticated, getMyNotifications);

notificationRoute.get(
  "/get-all-notifications",
  isAutheticated,
  authorizeRoles("admin"),
  getNotifications
);
notificationRoute.put("/update-notification/:id", isAutheticated, authorizeRoles("admin"), updateNotification);

export default notificationRoute;
