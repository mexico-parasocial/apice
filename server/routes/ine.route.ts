import express from "express";
import {
  getMyINEVerification,
  submitINEVerification,
  listINEVerifications,
  reviewINEVerification,
} from "../controllers/ine.controller";
import { isAutheticated, authorizeRoles } from "../middleware/auth";

const ineRouter = express.Router();

ineRouter.get("/ine/me", isAutheticated, getMyINEVerification);
ineRouter.post("/ine/submit", isAutheticated, submitINEVerification);
ineRouter.get(
  "/ine/verifications",
  isAutheticated,
  authorizeRoles("admin"),
  listINEVerifications
);
ineRouter.put(
  "/ine/verifications/:id/review",
  isAutheticated,
  authorizeRoles("admin"),
  reviewINEVerification
);

export default ineRouter;
