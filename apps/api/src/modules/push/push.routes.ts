import express from "express";
import { isAuthenticated } from "../../http/auth";
import { registerPushToken, unregisterPushToken } from "./push.controller";

const pushRouter = express.Router();

pushRouter.post("/push/register", isAuthenticated, registerPushToken);
pushRouter.post("/push/unregister", isAuthenticated, unregisterPushToken);

export default pushRouter;
