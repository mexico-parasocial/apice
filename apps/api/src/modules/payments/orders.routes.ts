import express from "express";
import { authorizeRoles, isAuthenticated } from "../../http/auth";
import {
  createMobileOrder,
  createOrder,
  getAllOrders,
  newPayment,
  sendStripePublishableKey,
} from "./orders.controller";
const orderRouter = express.Router();

orderRouter.post("/create-order", isAuthenticated, createOrder);

orderRouter.post("/create-mobile-order", isAuthenticated, createMobileOrder);

orderRouter.get(
  "/get-orders",
  isAuthenticated,
  authorizeRoles("admin"),
  getAllOrders
);

orderRouter.get("/payment/stripepublishablekey", sendStripePublishableKey);

orderRouter.post("/payment", isAuthenticated, newPayment);

export default orderRouter;
