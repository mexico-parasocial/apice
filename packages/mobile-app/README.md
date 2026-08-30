# Ápice Mobile App

A minimal Expo iOS/Android app for Ápice built with the same infrastructure patterns as PARA (Expo CNG, Metro, EAS).

## Native build notes

Non-obvious requirements for the iOS build to work (all are durable — applied
automatically by `pnpm install` / `expo prebuild` / `pod install`):

1. **Autolinking patch** — `patches/expo-modules-autolinking@2.0.8.patch`
   (registered in `pnpm-workspace.yaml`). The bundled autolinking (expo@52)
   doesn't treat the umbrella `apple` platform as supporting `ios`, so modules
   like `expo-video` were silently skipped from the Podfile.
2. **expo-video API shims** — `patches/expo-video@57.0.0.patch`. expo-video 57
   targets a newer expo-modules-core than expo@52 ships; the patch renames
   `emit(event:payload:)` → `emit(event:arguments:)` and replaces the
   nonexistent `appContext.jsLogger` with `os_log`.
3. **iOS deployment target 16.4** — `ExpoVideo.podspec` requires iOS 16.4+.
   Set via the `expo-build-properties` plugin in `app.config.js`. Do not lower it.
4. **fmt C++17 workaround** — the RN-vendored fmt 11.0.2 fails with the current
   Xcode toolchain (consteval errors). The `post_install` hook in `ios/Podfile`
   compiles the fmt pod as C++17, which makes fmt take its
   `FMT_USE_CONSTEVAL=0` branch (a `-DFMT_USE_CONSTEVAL=0` flag does NOT work —
   fmt's base.h re-defines the macro without guards).

Native video stack (2026-07-20): the player is **`@bsky.app/video`**
(Bluesky's own native video view — same player as the Bluesky app), not
expo-video. `BlueskyVideo.podspec` links cleanly; no patches needed. The
legacy expo-video pnpm patch (`patches/expo-video@57.0.0.patch`) remains
registered only until the dependency is fully removed.

Additional native modules and their notes:
- `expo-keep-awake` — screen stays on during playback (links cleanly).
- `expo-web-browser` — ATProto OAuth login flow (links cleanly).
- `expo-file-system` + `expo-sharing` — certificate download/share sheet.
  `expo-sharing@57.0.6` needs `patches/expo-sharing@57.0.6.patch` (its Swift
  expects a newer expo-file-system API; the patch uses Foundation's
  `FileManager.isReadableFile` instead).

Platform detection follows the Bluesky pattern via `@bsky.app/alf`
(`isNative`/`isWeb`/`platform()` + `.native.ts`/`.ts` file splits, e.g.
`certificateDownload.native.ts`).

Last verified: full `xcodebuild` simulator build succeeds (2026-07-20, with
@bsky.app/video + expo-keep-awake). Runtime playback on a real
device/simulator against the Streamplace node is still a manual smoke-test
step.

## Setup

From the repo root:

```bash
cd /Users/mlv/Desktop/Ápice
pnpm install
cp packages/mobile-app/.env.example packages/mobile-app/.env
```

Edit `.env` if your server is not on `http://127.0.0.1:8000`.

## Run

```bash
cd packages/mobile-app
pnpm expo start
```

Then press `i` for iOS simulator or `a` for Android emulator.

For a native development build:

```bash
pnpm expo run:ios
# or
pnpm expo run:android
```

## Features

- **Home** — horizontal optative course carousel.
- **Courses** — list all courses and enroll in the free ones.
- **Profile** — Bluesky/iM8 login, certificate list, and completion modal demo.

## Crash reporting (Sentry)

Structure copied from PARA's Sentry setup. Init is gated on the DSN, so a
build without the variable has Sentry fully inert — nothing to configure for
local development.

- `EXPO_PUBLIC_SENTRY_DSN` — Sentry project DSN. Unset = disabled.
- Optional: `EXPO_PUBLIC_ENV` — environment tag (`development`/`production`).

Init lives in `src/observability/sentry.ts` and is called first thing in
`src/App.tsx`, before fonts/navigation mount. `Network request failed` is
ignored by design — intermittent connectivity is a condition of the audience
(prepaid data), not a bug. To enable native crash reporting in EAS builds,
add the `@sentry/react-native/expo` plugin to `app.config.js` and run the
Sentry wizard (`npx @sentry/wizard@latest -i reactNative`).
