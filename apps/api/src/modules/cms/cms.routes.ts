import express from "express";
import { authorizeRoles, isAuthenticated } from "../../http/auth";
import { createLayout, editLayout, getLayoutByType } from "./cms.controller";
const layoutRouter = express.Router();

layoutRouter.post("/create-layout", isAuthenticated,authorizeRoles("admin"), createLayout);

layoutRouter.put("/edit-layout", isAuthenticated,authorizeRoles("admin"), editLayout);

layoutRouter.get("/get-layout/:type",getLayoutByType);


export default layoutRouter;