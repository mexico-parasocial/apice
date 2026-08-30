import express from "express";
import {
  startIM8Login,
  completeIM8Login,
} from "../controllers/im8.controller";

const im8Router = express.Router();

im8Router.post("/auth/iM8/start", startIM8Login);
im8Router.post("/auth/iM8/complete", completeIM8Login);

export default im8Router;
