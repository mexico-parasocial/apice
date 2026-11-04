import express from "express";
import { authorizeRoles, isAuthenticated } from "../../http/auth";
import { getMyNotifications, getNotifications, updateNotification } from "./notifications.controller";
const notificationRoute = express.Router();

notificationRoute.get("/notifications", isAuthenticated, getMyNotifications);

notificationRoute.get(
  "/get-all-notifications",
  isAuthenticated,
  authorizeRoles("admin"),
  getNotifications
);
notificationRoute.put("/update-notification/:id", isAuthenticated, authorizeRoles("admin"), updateNotification);

export default notificationRoute;
