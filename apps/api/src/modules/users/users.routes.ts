import express from "express";
import {
  deleteUser,
  getAllUsers,
  getUserInfo,
  updateCredentialsConsent,
  updateProfilePicture,
  updateUserInfo,
  updateUserRole,
} from "./users.controller";
import { authorizeRoles, isAuthenticated } from "../../http/auth";

/** The signed-in user's profile, plus admin user management. */
const userRouter = express.Router();

userRouter.get("/me", isAuthenticated, getUserInfo);
userRouter.put("/update-user-info", isAuthenticated, updateUserInfo);
userRouter.put("/me/credentials-consent", isAuthenticated, updateCredentialsConsent);
userRouter.put("/update-user-avatar", isAuthenticated, updateProfilePicture);

userRouter.get("/get-users", isAuthenticated, authorizeRoles("admin"), getAllUsers);
userRouter.put("/update-user", isAuthenticated, authorizeRoles("admin"), updateUserRole);
userRouter.delete("/delete-user/:id", isAuthenticated, authorizeRoles("admin"), deleteUser);

export default userRouter;
