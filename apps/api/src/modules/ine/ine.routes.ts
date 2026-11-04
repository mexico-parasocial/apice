import express from "express";
import {
  getMyINEVerification,
  submitINEVerification,
  listINEVerifications,
  reviewINEVerification,
} from "./ine.controller";
import { isAuthenticated, authorizeRoles } from "../../http/auth";

const ineRouter = express.Router();

ineRouter.get("/ine/me", isAuthenticated, getMyINEVerification);
ineRouter.post("/ine/submit", isAuthenticated, submitINEVerification);
ineRouter.get(
  "/ine/verifications",
  isAuthenticated,
  authorizeRoles("admin"),
  listINEVerifications
);
ineRouter.put(
  "/ine/verifications/:id/review",
  isAuthenticated,
  authorizeRoles("admin"),
  reviewINEVerification
);

export default ineRouter;
