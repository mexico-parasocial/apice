import express from "express";
import {
  activateUser,
  loginUser,
  logoutUser,
  registrationUser,
  updatePassword,
} from "./password.controller";
import { isAuthenticated } from "../../http/auth";

/** Email + password accounts: sign-up, activation, sign-in, sign-out. */
const passwordAuthRouter = express.Router();

passwordAuthRouter.post("/registration", registrationUser);
passwordAuthRouter.post("/activate-user", activateUser);
passwordAuthRouter.post("/login", loginUser);
// POST: it changes state. (Was GET, which any <img> tag could trigger.)
passwordAuthRouter.post("/logout", isAuthenticated, logoutUser);
passwordAuthRouter.put("/update-user-password", isAuthenticated, updatePassword);

export default passwordAuthRouter;
