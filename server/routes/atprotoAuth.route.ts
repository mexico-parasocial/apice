import express from "express";
import {
  atprotoAuthCallback,
  getAtprotoAuthMode,
  getAtprotoClientMetadata,
  startAtprotoAuth,
} from "../controllers/atprotoAuth.controller";

const atprotoAuthRouter = express.Router();

// Public client metadata (required by the ATProto OAuth spec).
atprotoAuthRouter.get(
  "/auth/atproto/client-metadata.json",
  getAtprotoClientMetadata
);

atprotoAuthRouter.get("/auth/atproto/mode", getAtprotoAuthMode);

atprotoAuthRouter.post("/auth/atproto/start", startAtprotoAuth);

atprotoAuthRouter.get("/auth/atproto/callback", atprotoAuthCallback);

export default atprotoAuthRouter;
