import { Server as SocketIOServer } from "socket.io";
import http from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { metrics } from "./utils/metrics";
import { log } from "./utils/logger";
import { redis } from "./utils/redis";
import { ADMIN_ROOM, registerRealtime, userRoom } from "./utils/realtime";

const socketLog = log("socket");

interface SocketIdentity {
  userId: string;
  role: string;
}

/**
 * Realtime delivery for notifications.
 *
 * Server → client only. Notifications are emitted by services/notification
 * .service.ts when a row is stored; clients just listen. There is no
 * client-to-client relay: the old `notification` event let any logged-in
 * learner broadcast arbitrary payloads to every connected admin.
 *
 * The handshake must carry a valid access token. The role comes from the
 * same Redis session the HTTP auth middleware reads, so a demoted admin stops
 * joining the admin room as soon as their session is refreshed.
 */
export const initSocketServer = (server: http.Server) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["http://localhost:3000"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers["access-token"];
    if (!token || typeof token !== "string") {
      return next(new Error("Authentication error: No token provided"));
    }
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN as string) as JwtPayload;
    } catch {
      return next(new Error("Authentication error: Token verification failed"));
    }
    if (!decoded?.id) {
      return next(new Error("Authentication error: Invalid token"));
    }
    try {
      const session = await redis.get(decoded.id);
      if (!session) {
        return next(new Error("Authentication error: No session"));
      }
      const user = JSON.parse(session) as { id: string; role?: string };
      socket.data.identity = {
        userId: user.id,
        role: user.role ?? "user",
      } satisfies SocketIdentity;
      next();
    } catch (err) {
      socketLog.error({ err }, "socket session lookup failed");
      next(new Error("Authentication error: Session unavailable"));
    }
  });

  io.on("connection", (socket) => {
    const { userId, role } = socket.data.identity as SocketIdentity;
    metrics.socketConnections.inc();
    socketLog.debug({ userId, role }, "socket connected");

    socket.join(userRoom(userId));
    if (role === "admin") socket.join(ADMIN_ROOM);

    socket.on("disconnect", () => {
      metrics.socketConnections.dec();
      socketLog.debug({ userId }, "socket disconnected");
    });
  });

  registerRealtime(io);

  // The io instance is returned so shutdown can close long-lived sockets
  // before the HTTP server stops accepting new ones.
  return io;
};
