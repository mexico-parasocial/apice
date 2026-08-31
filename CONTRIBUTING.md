# Contributing to Ápice

Ápice is a MOOC platform built on ATProto (Bluesky) infrastructure — courses,
lessons, quizzes, certificates and streaming video, with a political-civic
community organisation as its first deployment. Thanks for considering a
contribution.

## Prerequisites

- **Node.js ≥ 22.13**
- **pnpm ≥ 11.7** (`corepack enable && corepack prepare pnpm@11.7.0 --activate`)
- **Docker** (Postgres + Redis + SeaweedFS + Streamplace run in compose)

## Getting started

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Boot the dev infrastructure (Postgres :5434, Redis :6379) and migrate
make run-dev-env            # or: pnpm dev:env

# 3. Copy env files and adjust if needed
cp server/.env.example server/.env

# 4. Run the API (http://localhost:8000)
pnpm dev:server

# 5. Run the admin panel / mobile web
pnpm dev:admin
pnpm web

# 6. Run native mobile (requires macOS for iOS)
pnpm ios             # iOS simulator — runs pod install automatically
pnpm android         # Android emulator
```

### iOS native builds

After `pnpm install`, CocoaPods must be run once before the first native build:

```bash
cd packages/mobile-app/ios && pod install && cd ../..
```

Re-run this any time you add or update a native dependency. See
`packages/mobile-app/README.md` for details on the Expo patches that make the
iOS build work.

`make doctor` checks the running stack (API probes, Postgres, Redis,
SeaweedFS, Streamplace) and prints pass/fail per service.

## Repository layout

| Path | What it is |
|---|---|
| `server/` | Express 4 + TypeScript API. Prisma/Postgres, Redis, Socket.IO, Stripe, ATProto OAuth |
| `admin/` | Next.js admin panel (MUI) |
| `packages/mobile-app/` | Expo (React Native) learner app |
| `packages/mobile/` | Shared mobile library (theme, components, progress hooks) |
| `packages/lexicons/` | ATProto lexicons (`app.civic.*`) |
| `docs/` | Runbooks: deployment, video pipeline, encoding, branding |

## Before you open a PR

CI (`.github/workflows/ci.yml`) runs on every push and PR:

1. `pnpm -r typecheck` — all five packages must typecheck cleanly.
2. `pnpm --filter server test` — Vitest suite must pass.
3. Server and admin must build.

Run these locally first; a PR that fails any gate won't be reviewed.

Expectations for changes:

- **Server routes**: every write endpoint validates input with a Zod schema
  (see `course.controller.ts` for the pattern) or derives its write data
  server-side. Never pass `req.body` to Prisma unparsed.
- **New env vars**: add them to `server/.env.example` /
  `server/.env.production.example` and to the `KnownEnvVar` union in
  `server/utils/env.ts` if they must be validated at boot.
- **Database changes**: create a Prisma migration
  (`pnpm --filter server exec prisma migrate dev --name <change>`); never edit
  an applied migration.
- **Comments**: explain *why*, especially for anything touching payments,
  access control, or learner privacy. This platform stores government ID
  images (INE verification) and payment records — treat data handling as a
  security surface.

## Reporting bugs and security issues

Bugs: open a GitHub issue with steps to reproduce (stack, endpoint or screen,
expected vs actual).

Security: **do not open a public issue** — see [SECURITY.md](SECURITY.md).

## Licence

Ápice is licensed under the [GNU General Public License v3.0](LICENSE).
