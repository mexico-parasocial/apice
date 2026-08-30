import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Structured logger.
 *
 * JSON in production so a log shipper can parse it; human-readable locally.
 *
 * The redaction list is not decoration. This is a political party's learning
 * platform: a log line that captures an auth header, a password field, or a
 * learner's Bluesky DID alongside a lesson id turns the log store into a
 * record of who studied what — exactly the data the ATProto design is meant
 * to keep out of our hands.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      'req.headers["access-token"]',
      'req.headers["refresh-token"]',
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.accessToken",
      "*.refreshToken",
      "*.svgContent",
    ],
    censor: "[redacted]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});

/** Child logger for a subsystem, e.g. `log("video")`. */
export function log(subsystem: string) {
  return logger.child({ subsystem });
}
