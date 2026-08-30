import express from "express";
import {
  claimCertificate,
  downloadCertificate,
  getMyCertificates,
} from "../controllers/certificate.controller";
import { isAutheticated } from "../middleware/auth";

const certificateRouter = express.Router();

certificateRouter.get("/certificates", isAutheticated, getMyCertificates);
certificateRouter.post(
  "/certificates/:courseId/claim",
  isAutheticated,
  claimCertificate
);
certificateRouter.get(
  "/certificates/:id/download",
  isAutheticated,
  downloadCertificate
);

export default certificateRouter;
