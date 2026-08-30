import {v2 as cloudinary} from "cloudinary";
import http from "http";
import connectDB from "./utils/db";
import { initSocketServer } from "./socketServer";
import { app } from "./app";
import { logger } from "./utils/logger";
import { prisma } from "./utils/db";
import { redis } from "./utils/redis";
require("dotenv").config();
const server = http.createServer(app);
const log = logger.child({ subsystem: "server" });


// cloudinary config
cloudinary.config({
 cloud_name: process.env.CLOUDINARY_NAME,
 api_key: process.env.CLOUDINARY_API_KEY,
 api_secret: process.env.CLOUDINARY_API_SECRET,
});

const io = initSocketServer(server);

// create server
server.listen(process.env.PORT, () => {
    log.info({ port: process.env.PORT }, "server listening");
    connectDB();
});

/**
 * Graceful shutdown — drain in the opposite order things were opened.
 *
 * Docker sends SIGTERM and gives the container ~10s before SIGKILL. Without
 * this handler an in-flight Stripe webhook or lesson-progress write is cut
 * off mid-request, which is exactly the kind of corruption you only notice
 * in production. Calls to a dependency that was never opened are guarded so
 * the same path works in tests and partial dev setups.
 */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return; // second SIGTERM falls through to default
  shuttingDown = true;
  log.info({ signal }, "shutting down");

  // Stop accepting new connections/sockets first, then let in-flight
  // requests finish. Force-close after 8s: Docker's SIGKILL arrives at 10s
  // and we want our own exit code on record, not a kill.
  const forceExit = setTimeout(() => process.exit(1), 8000);
  forceExit.unref();

  try {
    io.close();
    server.close();
    await prisma.$disconnect();
    await redis.quit().catch(() => undefined);
    log.info("shutdown complete");
    process.exit(0);
  } catch (err) {
    log.error({ err }, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
