import { Server as SocketIOServer } from "socket.io";
import http from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { metrics } from "./utils/metrics";
import { log } from "./utils/logger";

const socketLog = log("socket");

export const initSocketServer = (server: http.Server) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["http://localhost:3000"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth.token || socket.handshake.headers["access-token"];
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }
    try {
      const decoded = jwt.verify(
        token,
        process.env.ACCESS_TOKEN as string
      ) as JwtPayload;
      if (!decoded) {
        return next(new Error("Authentication error: Invalid token"));
      }
      (socket as any).userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error("Authentication error: Token verification failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = (socket as any).userId as string;
    metrics.socketConnections.inc();
    socketLog.debug({ userId }, "socket connected");

    // Each authenticated socket joins its own room for targeted delivery.
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Listen for 'notification' event from the frontend.
    socket.on("notification", (data) => {
      // Targeted delivery when a recipient is specified; only explicitly
      // broadcast notifications (no userId) go to all clients.
      if (data?.userId) {
        io.to(`user:${data.userId}`).emit("newNotification", data);
      } else {
        io.emit("newNotification", data);
      }
    });

    socket.on("disconnect", () => {
      metrics.socketConnections.dec();
      socketLog.debug("socket disconnected");
    });
  });

  // The io instance is returned so shutdown can close long-lived sockets
  // before the HTTP server stops accepting new ones.
  return io;
};
