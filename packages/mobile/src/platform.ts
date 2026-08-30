/**
 * Platform detection — the Bluesky pattern (re-exported from @bsky.app/alf,
 * which ships platform-split builds: `.native` for React Native, default for
 * web).
 *
 * Usage:
 *   import { isNative, isWeb, platform } from "@apice/mobile";
 *   const behavior = platform({ ios: "a", android: "b", default: "c" });
 *
 * For platform-specific module implementations, use file suffixes:
 *   `foo.native.ts` (React Native) / `foo.ts` (web fallback).
 */
export {
  isIOS,
  isAndroid,
  isNative,
  isWeb,
  platform,
  native,
  web,
  ios,
  android,
} from "@bsky.app/alf";
