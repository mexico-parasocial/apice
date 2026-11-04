import { Server as SocketIOServer } from "socket.io";
import http from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { metrics } from "./utils/metrics";
import { log } from "./utils/logger";
import { ADMIN_ROOM, registerRealtime, userRoom } from "./utils/realtime";
import { ACCESS_COOKIE, isSessionActive, loadUser } from "./utils/jwt";

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
 * The handshake must carry a valid access token for a live session. The
 * role comes from the same user cache the HTTP auth middleware reads.
 */
export const initSocketServer = (server: http.Server) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000"];

  const io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    // Mobile passes the token in the handshake; the admin web relies on its
    // HttpOnly cookie. A cookie only counts from an allowed origin, since a
    // WebSocket upgrade isn't subject to CORS.
    let token: unknown = socket.handshake.auth?.token;
    if (!token) {
      const origin = socket.handshake.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
      }
    }
    if (!token || typeof token !== "string") {
      return next(new Error("Authentication error: No token provided"));
    }
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN as string) as JwtPayload;
    } catch {
      return next(new Error("Authentication error: Token verification failed"));
    }
    if (!decoded?.id || !decoded?.sid) {
      return next(new Error("Authentication error: Invalid token"));
    }
    try {
      if (!(await isSessionActive(decoded.id, decoded.sid))) {
        return next(new Error("Authentication error: No session"));
      }
      const user = await loadUser(decoded.id);
      if (!user) {
        return next(new Error("Authentication error: No session"));
      }
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

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
