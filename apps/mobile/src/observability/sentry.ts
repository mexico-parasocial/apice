import * as Sentry from "@sentry/react-native";
import { SENTRY_DSN } from "../env";

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Crash reporting for the mobile app.
 *
 * Structure copied from the PARA app's Sentry setup: init is gated on the
 * DSN being present, so a build without EXPO_PUBLIC_SENTRY_DSN is a build
 * with Sentry fully inert — no requirement to configure anything to develop.
 *
 * Sampling: internal/dev builds report everything; production samples
 * aggressively. A crash that happens to 1% of learners still reaches us
 * quickly at these rates; a firehose would not.
 */
export function initSentry() {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !IS_DEV,
    environment: process.env.EXPO_PUBLIC_ENV ?? (IS_DEV ? "development" : "production"),
    // Network flapping on Mexican prepaid data is a condition of the audience,
    // not a bug in the app — the most-reported non-error in PARA's setup.
    ignoreErrors: ["Network request failed"],
    sampleRate: IS_DEV ? 1.0 : 0.5,
    tracesSampleRate: IS_DEV ? 1.0 : 0.05,
  });
}
