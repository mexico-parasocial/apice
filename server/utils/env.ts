import { z } from "zod";

/**
 * Typed access to process.env, plus startup validation.
 *
 * `env` is the passthrough object the rest of the server reads (and that tests
 * mock). `loadEnv()` is the strict check, called once from app.ts at boot.
 *
 * Every variable guarded below has a failure mode that is silent at startup
 * and only surfaces later as a mystery: a missing ALLOWED_ORIGINS rejects
 * every request from the real domain, a missing ACCESS_TOKEN throws on the
 * first login rather than on deploy, and a leftover `change-me` ships a
 * signing key that is published in the repo. Failing loudly here turns each of
 * those into a deploy-time error with a name attached.
 */
const raw = process.env as NodeJS.ProcessEnv &
  Partial<Record<KnownEnvVar, string>>;

export const env = {
  ...raw,
  /** Falls back to the public Bluesky PDS when no self-hosted PDS is set. */
  PDS_URL: raw.PDS_URL ?? "https://bsky.social",
};

export type KnownEnvVar =
  | "NODE_ENV"
  | "PORT"
  | "DATABASE_URL"
  | "REDIS_URL"
  | "API_PUBLIC_URL"
  | "ALLOWED_ORIGINS"
  | "PUBLIC_COURSE_URL_TEMPLATE"
  | "ACCESS_TOKEN"
  | "REFRESH_TOKEN"
  | "ACCESS_TOKEN_EXPIRE"
  | "REFRESH_TOKEN_EXPIRE"
  | "ACTIVATION_SECRET"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_SERVICE"
  | "SMTP_MAIL"
  | "SMTP_PASSWORD"
  | "CLOUDINARY_NAME"
  | "CLOUDINARY_API_KEY"
  | "CLOUDINARY_API_SECRET"
  | "STRIPE_PUBLISHABLE_KEY"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_ENDPOINT_SECRET"
  | "PDS_URL"
  | "PDS_SERVICE_HANDLE"
  | "PDS_SERVICE_PASSWORD"
  | "PDS_PUBLISH_DID"
  | "ATPROTO_OAUTH_LOOPBACK"
  | "IM8_IDENTITY_MANAGER_URL"
  | "STREAMPLACE_VOD_BASE_URL"
  | "STREAMPLACE_ALLOWED_STREAMS"
  | "ALLOW_DIRECT_VIDEO_URLS"
  | "METRICS_ENABLED"
  | "JETSTREAM_URL"
  | "SENTRY_DSN";

const isProduction = process.env.NODE_ENV === "production";

/** Placeholders that ship in the compose defaults and .env.example files. */
const PLACEHOLDER = /^change-me/i;

/** Required everywhere, and never a placeholder in production. */
const secret = (name: string) =>
  z
    .string()
    .min(1, `${name} is required`)
    .refine(
      (v) => !isProduction || !PLACEHOLDER.test(v),
      `${name} still holds a "change-me" placeholder — set a real value before deploying`
    );

/** Required in production, optional in local dev. */
const requiredInProd = (name: string) =>
  isProduction
    ? z.string().min(1, `${name} is required in production`)
    : z.string().optional();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("8000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  ACCESS_TOKEN: secret("ACCESS_TOKEN"),
  REFRESH_TOKEN: secret("REFRESH_TOKEN"),
  ACTIVATION_SECRET: secret("ACTIVATION_SECRET"),

  // Without this the CORS layer silently falls back to localhost, so every
  // request from the real domain is rejected.
  ALLOWED_ORIGINS: requiredInProd("ALLOWED_ORIGINS"),

  // Bluesky OAuth client metadata is discovered at this URL; without it the
  // ATProto login flow cannot complete in production.
  API_PUBLIC_URL: requiredInProd("API_PUBLIC_URL"),

  // Local-demo escape hatch that lets a lesson point at plain http(s) video.
  // Streamplace AT URIs must be the only source in production.
  ALLOW_DIRECT_VIDEO_URLS: z
    .string()
    .optional()
    .refine(
      (v) => !isProduction || v !== "true",
      "ALLOW_DIRECT_VIDEO_URLS=true is a local-demo flag and must not be set in production"
    ),
});

let validated = false;

/**
 * Validates process.env and exits on failure. Idempotent.
 *
 * A misconfigured container should fail its deploy rather than come up and
 * serve errors, so this runs before anything binds a port.
 */
export function loadEnv() {
  if (validated) return;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const name = issue.path.join(".") || "(env)";
      // zod reports a missing key as an invalid_type against undefined, whose
      // stock wording ("expected string, received undefined") reads like a
      // type error rather than "you forgot to set this".
      const missing =
        issue.code === "invalid_type" && /undefined/.test(issue.message);
      return `  • ${name}: ${missing ? "not set" : issue.message}`;
    });
    console.error(
      [
        "",
        "✖ Invalid environment configuration — refusing to start.",
        ...lines,
        "",
        `NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}`,
        "See server/.env.production.example for the full list.",
        "",
      ].join("\n")
    );
    process.exit(1);
  }

  validated = true;
}
