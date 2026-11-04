import express from "express";
import {
  claimCertificate,
  downloadCertificate,
  getMyCertificates,
} from "./certificates.controller";
import { isAuthenticated } from "../../http/auth";

const certificateRouter = express.Router();

certificateRouter.get("/certificates", isAuthenticated, getMyCertificates);
certificateRouter.post(
  "/certificates/:courseId/claim",
  isAuthenticated,
  claimCertificate
);
certificateRouter.get(
  "/certificates/:id/download",
  isAuthenticated,
  downloadCertificate
);

export default certificateRouter;
